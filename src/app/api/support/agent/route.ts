import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, checkRateLimit, sanitizeError } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { getTierLimits } from '@/lib/subscription';
import { chatWithAiChain } from '@/lib/ai-providers';

// ═══════════════════════════════════════════════════════════════════════════
// AGENT IA SUPPORT (« notre agent pour répondre aux clients »)
// Chatbot produit EduGest branché sur le LLM (backend uniquement). Il répond
// aux questions des clients (corporates, écoles, parents) sur l'utilisation
// de la plateforme. Chaque échange est journalisé (AuditLog → Hermes en prod).
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Tu es « Agent Kelasi 360 », l'assistant IA du support client de Kelasi 360, la plateforme de gestion scolaire n°1 en République Démocratique du Congo.

TON RÔLE :
- Répondre aux questions des clients (admins d'écoles, comptes corporates multi-écoles, parents) sur l'utilisation de Kelasi 360.
- Être concis, professionnel, chaleureux. Répondre TOUJOURS en français.
- Structurer les réponses avec des listes courtes quand c'est utile.
- Si la question sort du périmètre produit (politique, hors-sujet), recentrer poliment sur Kelasi 360.
- Si tu ne sais pas ou si la demande nécessite un humain (litige de paiement, suppression de données, contrat), invite à ouvrir un ticket dans l'onglet « Support » : l'équipe support prendra le relais.
- Si le client signale un BUG ou une erreur de la plateforme, invite-le à cliquer le bouton « Signaler un bug » sous le chat : son signalement (avec toute la conversation) part en rapport direct à l'équipe.

CE QUE TU DOIS CONNAÎTRE D'EDUGEST :
1. Écoles : élèves, classes, notes & bulletins, paiements & situation financière, discipline (Liste Blanche = élèves sans incident, Liste Grise = avertissements, Liste Noire = sanctions graves), présence, devoirs, convocations, personnel multi-rôles (secrétaire, caisse, direction maternelle/primaire/secondaire, discipline, enseignant, médical), événements, communications, QR parents, service médical.
2. Comptes corporates : un client corporate (groupe scolaire, opérateur) possède PLUSIEURS écoles sous un seul espace « Espace Corporate » avec statistiques agrégées (élèves, classes, personnel, encaissements). Créés uniquement par l'administrateur de la plateforme.
3. Support : onglet « Support » → tickets (Général, Technique, Facturation, Onboarding, Données) avec suivi de statut (Ouvert, En cours, Résolu, Fermé) + t'as toi-même (moi, Agent IA) pour répondre immédiatement.
4. Passage de classe : fonctionnalité réservée aux écoles à partir du forfait Professionnel (PREMIUM) ET activée individuellement par l'administrateur de la plateforme (il « envoie » le passage à chaque école). Sans activation, la vue est verrouillée même avec le bon forfait.
5. Abonnements : FREEMIUM (limité), ESSENTIEL, STANDARD, PREMIUM (Passage de classe), ENTERPRISE, CORPORATE. La demande d'upgrade se fait dans « Mon Abonnement » ; l'admin plateforme la valide.
6. Emails officiels EduGest : noreply@edugest.app (notifications), support@edugest.app (support client), contact@edugest.app (commercial/partenariats).
7. Les données sont hébergées par école, cloisonnées : chaque compte ne voit que son périmètre.

STYLE : réponses courtes (3-8 lignes), listes à puces si nécessaire, jamais de blocs de code inutiles, émojis sobres autorisés (max 1).`;

interface ChatMessage { role: 'user' | 'assistant'; content: string }

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // Anti-abus : 20 messages / 5 min / utilisateur
    if (!checkRateLimit(`agent:${user.id}`, 20, 5 * 60 * 1000)) {
      return NextResponse.json({ error: 'Trop de messages — laissez l\u2019agent souffler un instant.' }, { status: 429 });
    }

    const body = await request.json();
    const message = String(body.message || '').trim().slice(0, 2000);
    if (!message) return NextResponse.json({ error: 'Message vide' }, { status: 400 });

    // Historique court fourni par le client (max 10 échanges, purgé)
    const history: ChatMessage[] = Array.isArray(body.history)
      ? body.history
          .filter((m: ChatMessage) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-10)
          .map((m: ChatMessage) => ({ role: m.role, content: String(m.content).slice(0, 1500) }))
      : [];

    // ── Quota journalier par compte selon le forfait de l'école ─────────────
    // FREEMIUM 3, ESSENTIEL 10, STANDARD 20, PREMIUM 30, ENTERPRISE 50,
    // CORPORATE 100. Comptes plateforme (super admin, support) : illimité.
    // Corporates : forfait CORPORATE. Compteur = échanges AGENT_CHAT du jour.
    const isPlatformStaff = user.role === 'SUPER_ADMIN_GLOBAL' || user.role === 'SUPPORT_AGENT';
    let agentDaily = 3;
    if (!isPlatformStaff) {
      let tier = 'FREEMIUM';
      if (user.role === 'CORPORATE_ADMIN') {
        tier = 'CORPORATE';
      } else if (user.schoolId) {
        const school = await db.school.findUnique({
          where: { id: user.schoolId },
          select: { subscriptionTier: true },
        });
        tier = school?.subscriptionTier || 'FREEMIUM';
      }
      agentDaily = getTierLimits(tier).agentDaily;
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const usedToday = await db.auditLog.count({
        where: { action: 'AGENT_CHAT', userId: user.id, createdAt: { gte: startOfDay } },
      });
      if (usedToday >= agentDaily) {
        return NextResponse.json(
          { error: `Quota Agent IA atteint (${agentDaily} questions/jour en forfait ${tier}). Il se recharge demain — ou passez au forfait supérieur depuis Mon Abonnement.` },
          { status: 429 }
        );
      }
    }

    let reply = '';
    try {
      // Équipe configurée (bascule auto) ou config unique historique.
      const out = await chatWithAiChain([
        { role: 'system', content: SYSTEM_PROMPT },
        ...history,
        { role: 'user', content: message },
      ]);
      reply = out.reply;
      if (out.failovers.length > 0) {
        console.warn(`[Support:agent] Bascule IA : ${out.failovers.map(f => f.from).join(' → ')} → ${out.provider}`);
      }
    } catch (e) {
      console.error('[Support:agent] Provider error:', e instanceof Error ? e.message : e);
    }
    if (!reply.trim()) {
      return NextResponse.json({ error: 'L\u2019agent n\u2019a pas pu générer de réponse — reformulez ou ouvrez un ticket.' }, { status: 502 });
    }

    await logAudit({
      action: 'AGENT_CHAT',
      userId: user.id, userName: user.name, userRole: user.role,
      entityType: 'SupportAgent', entityId: null,
      details: `Agent IA consulté : « ${message.slice(0, 80)} »`,
      meta: { questionLength: message.length, replyLength: reply.length },
    });

    // ── Rapport de bug : le signalement + toute la conversation partent en
    // ticket TECHNIQUE prioritaire, notifié en temps réel à l'équipe support
    // (même canal que les tickets : cloche + push). Anti-spam : 3/heure/user.
    let bugTicketRef: string | null = null;
    if (body.reportBug === true) {
      if (!checkRateLimit(`agent-bug:${user.id}`, 3, 60 * 60 * 1000)) {
        return NextResponse.json({ data: { reply }, error: 'Trop de rapports — réessayez dans une heure.' }, { status: 429 });
      }
      const transcript = [...history, { role: 'user' as const, content: message }]
        .map(m => `${m.role === 'user' ? 'Client' : 'Agent IA'} : ${m.content}`)
        .join('\n\n');
      const firstUser = [...history, { role: 'user' as const, content: message }].find(m => m.role === 'user');
      const subject = `[Bug via Agent IA] ${(firstUser?.content || message).slice(0, 60)}`;
      const year = new Date().getFullYear();
      const ref = `TCK-${year}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const schoolId = user.schoolId || null;
      const ticket = await db.supportTicket.create({
        data: {
          ref,
          subject,
          category: 'TECHNIQUE',
          priority: 'HIGH',
          status: 'OPEN',
          createdById: user.id,
          schoolId,
          messages: {
            create: {
              userId: user.id,
              authorRole: 'CLIENT',
              body: `Rapport de bug envoyé depuis l'Agent IA par ${user.name} (${user.role}).\n\nDescription : ${message}\n\n── Transcription ──\n${transcript}`.slice(0, 8000),
            },
          },
        },
        include: { school: { select: { name: true, shortName: true } } },
      });
      bugTicketRef = ticket.ref;
      const origin = ticket.school ? ` — ${ticket.school.shortName || ticket.school.name}` : '';
      try {
        const recipients = await db.user.findMany({
          where: { isActive: true, role: { in: ['SUPPORT_AGENT', 'SUPER_ADMIN_GLOBAL'] }, id: { not: user.id } },
          select: { id: true },
          take: 20,
        });
        for (const recipient of recipients) {
          await notify({
            data: {
              type: 'SUPPORT_TICKET',
              title: `Rapport de bug ${ticket.ref}`,
              message: `${user.name} (${user.role}) signale : « ${subject} »${origin}`.slice(0, 180),
              userId: recipient.id,
              schoolId,
              relatedId: ticket.id,
              linkTo: 'support',
              linkId: ticket.id,
            },
          });
        }
      } catch (e) {
        console.error('[Support:agent] Notification rapport de bug impossible :', e);
      }
      await logAudit({
        action: 'AGENT_BUG_REPORT',
        userId: user.id, userName: user.name, userRole: user.role,
        entityType: 'SupportTicket', entityId: ticket.id, schoolId,
        details: `Rapport de bug ${ticket.ref} via Agent IA : « ${subject} »`,
        meta: { ref: ticket.ref },
      });
    }

    return NextResponse.json({ data: { reply, bugTicketRef } });
  } catch (error) {
    console.error('[Support:agent] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
