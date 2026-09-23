import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, checkRateLimit, sanitizeError } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
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
// Body: { subject, category?, priority?, body, corporateId?, schoolId? }
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
    const firstMessage = String(body.body || '').trim();
    const category = CATEGORIES.includes(body.category) ? body.category : 'GENERAL';
    const priority = PRIORITIES.includes(body.priority) ? body.priority : 'NORMAL';
    if (subject.length < 4) return NextResponse.json({ error: 'Sujet trop court (4 caractères min.)' }, { status: 400 });
    if (firstMessage.length < 5) return NextResponse.json({ error: 'Décrivez votre demande (5 caractères min.)' }, { status: 400 });

    // Contexte corporate / école
    let corporateId: string | null = body.corporateId || null;
    let schoolId: string | null = body.schoolId || user.schoolId || null;
    if (user.role === 'CORPORATE_ADMIN' && !corporateId) {
      const m = await db.corporateUser.findFirst({ where: { userId: user.id } });
      corporateId = m?.corporateId || null;
      schoolId = null;
    }
    if (corporateId) {
      const corp = await db.corporate.findUnique({ where: { id: corporateId }, select: { id: true, name: true, contactEmail: true } });
      if (!corp) corporateId = null;
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

    await logAudit({
      action: 'TICKET_CREATED',
      userId: user.id, userName: user.name, userRole: user.role,
      entityType: 'SupportTicket', entityId: ticket.id, schoolId,
      details: `Ticket ${ticket.ref} créé : « ${subject} » (${priority})`,
      meta: { ref: ticket.ref, category, priority, corporate: ticket.corporate?.name || null },
    });

    return NextResponse.json({ data: { id: ticket.id, ref: ticket.ref } }, { status: 201 });
  } catch (error) {
    console.error('[Support:tickets] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
