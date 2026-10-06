import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, checkRateLimit, sanitizeError } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { sendPlatformEmail } from '@/lib/platform-email';

// ═══════════════════════════════════════════════════════════════════════════
// SUPPORT CLIENT — TICKETS
// Le support EduGest accomplit les tâches AVEC les clients (corporates et
// écoles) via une file de tickets. Un ticket peut être créé par tout
// utilisateur connecté ; traité par SUPPORT_AGENT / SUPER_ADMIN_GLOBAL.
// ═══════════════════════════════════════════════════════════════════════════

const STAFF_HANDLE_ROLES = ['SUPPORT_AGENT', 'SUPER_ADMIN_GLOBAL'];
const CATEGORIES = ['GENERAL', 'TECHNIQUE', 'FACTURATION', 'ONBOARDING', 'DONNEES'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

function makeRef(): string {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TCK-${year}-${rand}`;
}

// GET /api/support/tickets — file de tickets (filtrée selon le rôle)
// Query: ?status=&priority=&corporateId=&q=
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const priority = searchParams.get('priority') || undefined;
    const q = searchParams.get('q') || undefined;

    const isHandler = STAFF_HANDLE_ROLES.includes(user.role);
    let corporateIds: string[] = [];
    if (user.role === 'CORPORATE_ADMIN') {
      const memberships = await db.corporateUser.findMany({ where: { userId: user.id }, select: { corporateId: true } });
      corporateIds = memberships.map(m => m.corporateId);
    }

    const where = {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(q ? { OR: [{ ref: { contains: q } }, { subject: { contains: q } }] } : {}),
      // Cloisonnement : le support/SAG voit TOUT ; corporate → ses tickets ;
      // école → ceux créés par elle (créateur ou même école) ; parent → les siens.
      ...(isHandler ? {} : user.role === 'CORPORATE_ADMIN'
        ? { corporateId: { in: corporateIds } }
        : user.schoolId
          ? { OR: [{ createdById: user.id }, { schoolId: user.schoolId }] }
          : { createdById: user.id }),
    };

    const tickets = await db.supportTicket.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        assignee: { select: { id: true, name: true } },
        corporate: { select: { id: true, name: true } },
        school: { select: { id: true, name: true, shortName: true } },
        messages: { orderBy: { createdAt: 'asc' }, take: 1, select: { body: true } },
      },
    });

    return NextResponse.json({
      data: tickets.map(t => ({
        id: t.id,
        ref: t.ref,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        createdById: t.createdById,
        createdBy: t.createdBy,
        assignee: t.assignee,
        corporate: t.corporate,
        school: t.school,
        firstMessage: t.messages[0]?.body || '',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      context: { isHandler, role: user.role, corporateIds },
    });
  } catch (error) {
    console.error('[Support:tickets] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// POST /api/support/tickets — crée un ticket (+ 1er message)
// Body: { subject, category?, priority?, body, corporateId?, schoolId?, screenshotUrl? }
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!checkRateLimit(`tickets:${user.id}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Trop de tickets créés — réessayez plus tard' }, { status: 429 });
    }

    const body = await request.json();
    const subject = String(body.subject || '').trim();
    const description = String(body.body || '').trim();
    const category = CATEGORIES.includes(body.category) ? body.category : 'GENERAL';
    const priority = PRIORITIES.includes(body.priority) ? body.priority : 'NORMAL';
    // Capture d'écran du signalement (onglet Aide) : URL /api/upload/…
    const screenshotUrl = typeof body.screenshotUrl === 'string' && body.screenshotUrl.startsWith('/api/upload/')
      ? body.screenshotUrl.slice(0, 300)
      : '';
    const firstMessage = screenshotUrl
      ? `${description}\n\nCapture d'écran : ${screenshotUrl}`
      : description;
    if (subject.length < 4) return NextResponse.json({ error: 'Sujet trop court (4 caractères min.)' }, { status: 400 });
    if (description.length < 5) return NextResponse.json({ error: 'Décrivez votre demande (5 caractères min.)' }, { status: 400 });

    // Contexte corporate / école — DÉTERMINÉ CÔTÉ SERVEUR (anti-IDOR) :
    // l'ID d'école/corporate du body n'est JAMAIS cru pour un non-admin
    // plateforme (un utilisateur malveillant pouvait rattacher son ticket à
    // une autre école/corporate pour lire ou déborder leur file).
    //  - SUPER_ADMIN_GLOBAL : peut cibler explicitement (outils support)
    //  - CORPORATE_ADMIN : rattaché à SON corporate (adhésion en base)
    //  - autres rôles : leur propre école (schoolId du compte), sinon null
    //  - SUPPORT_AGENT : ticket plateforme (null/null)
    let corporateId: string | null = null;
    let schoolId: string | null = null;
    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      corporateId = typeof body.corporateId === 'string' ? body.corporateId : null;
      schoolId = typeof body.schoolId === 'string' ? body.schoolId : (user.schoolId || null);
      if (corporateId) {
        const corp = await db.corporate.findUnique({ where: { id: corporateId }, select: { id: true } });
        if (!corp) corporateId = null;
      }
      if (schoolId) {
        const sch = await db.school.findUnique({ where: { id: schoolId }, select: { id: true } });
        if (!sch) schoolId = null;
      }
    } else if (user.role === 'CORPORATE_ADMIN') {
      const m = await db.corporateUser.findFirst({ where: { userId: user.id } });
      corporateId = m?.corporateId || null;
      schoolId = null;
    } else if (user.role === 'SUPPORT_AGENT') {
      corporateId = null;
      schoolId = null;
    } else {
      schoolId = user.schoolId || null;
      corporateId = null;
    }

    const ticket = await db.supportTicket.create({
      data: {
        ref: makeRef(),
        subject,
        category,
        priority,
        status: 'OPEN',
        createdById: user.id,
        corporateId,
        schoolId,
        ...(firstMessage ? {
          messages: { create: { userId: user.id, authorRole: 'CLIENT', body: firstMessage } },
        } : {}),
      },
      include: { corporate: { select: { name: true } }, school: { select: { name: true } } },
    });

    // Accusé de réception depuis « nos emails » (support@edugest.app)
    const emailTo = user.role === 'CORPORATE_ADMIN'
      ? (await db.user.findUnique({ where: { id: user.id }, select: { email: true } }))?.email
      : (await db.user.findUnique({ where: { id: user.id }, select: { email: true } }))?.email;
    if (emailTo) {
      await sendPlatformEmail({
        to: emailTo,
        fromKey: 'support',
        template: 'TICKET_CREATED',
        subject: `[${ticket.ref}] Accusé de réception — ${subject.slice(0, 60)}`,
        html: `<p>Bonjour ${user.name},</p><p>Votre demande <b>${ticket.ref}</b> a bien été enregistrée : « ${subject} ».</p><p>Notre support client la traite dans les meilleurs délais.</p><p>L'équipe support EduGest</p>`,
      });
    }

    // URL absolue pour l'agent Hermes (webhook externe) — la relative reste
    // dans le message pour l'app.
    const appBase = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    await logAudit({
      action: 'TICKET_CREATED',
      userId: user.id, userName: user.name, userRole: user.role,
      entityType: 'SupportTicket', entityId: ticket.id, schoolId,
      details: `Ticket ${ticket.ref} créé : « ${subject} » (${priority})${screenshotUrl ? ' + capture d’écran' : ''}`,
      meta: {
        ref: ticket.ref, category, priority, corporate: ticket.corporate?.name || null,
        screenshotUrl: screenshotUrl || null,
        screenshotAbsoluteUrl: screenshotUrl && appBase ? `${appBase}${screenshotUrl}` : null,
      },
    });

    // ── Réception TEMPS RÉL pour l'équipe support ────────────────────────────
    // Sans cela, un ticket n'était « reçu » qu'en ouvrant la vue Support puis
    // en cliquant Rafraîchir : notify() déclenche au contraire la cloche, le
    // son, la notification native et le Web Push (notification-routing.ts →
    // SUPPORT_TICKET → vue `support`). Non bloquant : un échec de
    // notification ne doit jamais faire échouer la création du ticket.
    try {
      const recipients = await db.user.findMany({
        where: { isActive: true, role: { in: STAFF_HANDLE_ROLES }, id: { not: user.id } },
        select: { id: true },
        take: 20,
      });
      const scope = schoolId
        ? await db.school.findUnique({ where: { id: schoolId }, select: { shortName: true, name: true } })
        : null;
      const origin = scope ? ` — ${scope.shortName || scope.name}` : '';
      for (const recipient of recipients) {
        await notify({
          data: {
            type: 'SUPPORT_TICKET',
            title: `Nouveau ticket ${ticket.ref}`,
            message: `${user.name} (${user.role}) a ouvert : « ${subject} »${origin}`.slice(0, 180),
            userId: recipient.id,
            schoolId,
            relatedId: ticket.id,
            linkTo: 'support',
            linkId: ticket.id,
          },
        });
      }
    } catch (e) {
      console.error('[Support:tickets] Notification temps réel impossible :', e);
    }

    return NextResponse.json({ data: { id: ticket.id, ref: ticket.ref } }, { status: 201 });
  } catch (error) {
    console.error('[Support:tickets] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
