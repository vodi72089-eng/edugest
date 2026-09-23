import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { sendPlatformEmail } from '@/lib/platform-email';

// ─── /api/support/tickets/[id] — fil de discussion + traitement ────────────
// GET  : ticket + messages (accès : auteur, école, corporate, support, SAG)
// POST : répondre { body } — le support peut clore via PATCH
// PATCH: statut / priorité / assignation (SUPPORT_AGENT | SAG uniquement)

const HANDLE_ROLES = ['SUPPORT_AGENT', 'SUPER_ADMIN_GLOBAL'];

async function loadTicketWithAccess(id: string, userId: string, role: string, schoolId: string | null) {
  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, role: true, email: true } },
      assignee: { select: { id: true, name: true } },
      corporate: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, role: true } } },
      },
    },
  });
  if (!ticket) return { ticket: null, allowed: false };

  let allowed = HANDLE_ROLES.includes(role) || ticket.createdById === userId;
  if (!allowed && role === 'CORPORATE_ADMIN') {
    const m = await db.corporateUser.findFirst({ where: { userId, corporateId: ticket.corporateId || '___' } });
    allowed = !!m;
  }
  if (!allowed && schoolId && ticket.schoolId === schoolId) allowed = true;
  return { ticket, allowed };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    const { id } = await params;

    const { ticket, allowed } = await loadTicketWithAccess(id, user.id, user.role, user.schoolId);
    if (!ticket) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 });
    if (!allowed) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    return NextResponse.json({
      data: {
        id: ticket.id, ref: ticket.ref, subject: ticket.subject, category: ticket.category,
        priority: ticket.priority, status: ticket.status,
        createdBy: ticket.createdBy, assignee: ticket.assignee,
        corporate: ticket.corporate, school: ticket.school,
        createdAt: ticket.createdAt, updatedAt: ticket.updatedAt,
        messages: ticket.messages.map(m => ({
          id: m.id, body: m.body, authorRole: m.authorRole,
          author: { id: m.author.id, name: m.author.name, role: m.author.role },
          createdAt: m.createdAt,
        })),
      },
      permissions: { canHandle: HANDLE_ROLES.includes(user.role) },
    });
  } catch (error) {
    console.error('[Support:ticket] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    const { id } = await params;
    const body = await request.json();
    const text = String(body.body || '').trim();
    if (text.length < 1) return NextResponse.json({ error: 'Message vide' }, { status: 400 });

    const { ticket, allowed } = await loadTicketWithAccess(id, user.id, user.role, user.schoolId);
    if (!ticket) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 });
    if (!allowed) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const canHandle = HANDLE_ROLES.includes(user.role);
    const authorRole = canHandle ? 'SUPPORT' : 'CLIENT';

    const [message] = await db.$transaction([
      db.ticketMessage.create({
        data: { ticketId: id, userId: user.id, authorRole, body: text },
      }),
      // Le support ouvre automatiquement le ticket ; le client rouvre s'il
      // répond sur un ticket résolu.
      db.supportTicket.update({
        where: { id },
        data: {
          status: canHandle
            ? (ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status)
            : (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'OPEN' : ticket.status),
        },
      }),
    ]);

    // Notification email à l'autre partie (nos emails → support@)
    if (canHandle && ticket.createdBy.email) {
      await sendPlatformEmail({
        to: ticket.createdBy.email,
        fromKey: 'support',
        template: 'TICKET_REPLY',
        subject: `[${ticket.ref}] Nouvelle réponse du support`,
        html: `<p>Bonjour ${ticket.createdBy.name},</p><p>Le support a répondu à votre ticket <b>${ticket.ref}</b> :</p><blockquote>${text.slice(0, 500)}</blockquote><p>Connectez-vous à EduGest pour voir le fil complet.</p><p>L'équipe support EduGest</p>`,
      });
    }

    await logAudit({
      action: 'TICKET_REPLY',
      userId: user.id, userName: user.name, userRole: user.role,
      entityType: 'SupportTicket', entityId: id, schoolId: ticket.schoolId,
      details: `${canHandle ? 'Support' : 'Client'} a répondu au ticket ${ticket.ref}`,
      meta: { authorRole, length: text.length },
    });

    return NextResponse.json({ data: { id: message.id, authorRole } }, { status: 201 });
  } catch (error) {
    console.error('[Support:ticket] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    if (!HANDLE_ROLES.includes(user.role)) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const data: Record<string, string> = {};
    if (body.status && ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(body.status)) data.status = body.status;
    if (body.priority && ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(body.priority)) data.priority = body.priority;
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || user.id;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Aucun changement valide' }, { status: 400 });

    const ticket = await db.supportTicket.update({ where: { id }, data });

    await logAudit({
      action: 'TICKET_UPDATED',
      userId: user.id, userName: user.name, userRole: user.role,
      entityType: 'SupportTicket', entityId: id, schoolId: ticket.schoolId,
      details: `Ticket ${ticket.ref} → ${body.status ? `statut ${body.status}` : ''}${body.priority ? ` priorité ${body.priority}` : ''}`,
      meta: data,
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error('[Support:ticket] PATCH error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
