import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { requireAuth, checkRateLimit, sanitizeError } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// ═══════════════════════════════════════════════════════════════════════════
// AGENT IA SUPPORT (« notre agent pour répondre aux clients »)
// Chatbot produit EduGest branché sur le LLM (backend uniquement). Il répond
// aux questions des clients (corporates, écoles, parents) sur l'utilisation
// de la plateforme. Chaque échange est journalisé (AuditLog → Hermes en prod).
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Tu es « Agent EduGest », l'assistant IA du support client d'EduGest, la plateforme de gestion scolaire n°1 en République Démocratique du Congo.

TON RÔLE :
- Répondre aux questions des clients (admins d'écoles, comptes corporates multi-écoles, parents) sur l'utilisation d'EduGest.
- Être concis, professionnel, chaleureux. Répondre TOUJOURS en français.
- Structurer les réponses avec des listes courtes quand c'est utile.
- Si la question sort du périmètre produit (politique, hors-sujet), recentrer poliment sur EduGest.
- Si tu ne sais pas ou si la demande nécessite un humain (litige de paiement, suppression de données, contrat), invite à ouvrir un ticket dans l'onglet « Support » : l'équipe support prendra le relais.

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

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM_PROMPT },
        ...history,
        { role: 'user', content: message },
      ],
      thinking: { type: 'disabled' },
    });

    const reply = completion.choices[0]?.message?.content || '';
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

    return NextResponse.json({ data: { reply } });
  } catch (error) {
    console.error('[Support:agent] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
