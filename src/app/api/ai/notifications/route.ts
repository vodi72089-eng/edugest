import { NextRequest, NextResponse } from 'next/server';
import { auditAgentAction, consumeAgentQuota, getAgentQuota, requireAgent } from '@/lib/ai-agent';
import { db } from '@/lib/db';

// ─── /api/ai/notifications — Notifications créées par l'agent IA ────────────
// GET  ?schoolId=… (requis) &userId=… &limit=…  → dernières notifications
// POST { schoolId, title, message, type?, userId? | targetRole? }
//   → cible un utilisateur précis (userId) OU tous les utilisateurs d'un rôle
//     dans l'école (targetRole, ex. PARENT, TEACHER, SCHOOL_ADMIN).

const MAX_BATCH = 500;

export async function GET(request: NextRequest) {
  const guard = requireAgent(request);
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId')?.trim() || '';
  if (!schoolId) {
    return NextResponse.json({ error: 'Paramètre « schoolId » requis.' }, { status: 400 });
  }
  const userId = searchParams.get('userId')?.trim() || '';
  const limitParam = Number(searchParams.get('limit') || '20');
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, Math.trunc(limitParam))) : 20;

  const notifications = await db.notification.findMany({
    where: { schoolId, ...(userId ? { userId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { name: true, role: true } } },
  });

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      isRead: n.isRead,
      recipient: n.user ? `${n.user.name} (${n.user.role})` : n.userId,
      createdAt: n.createdAt,
    })),
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const guard = requireAgent(request);
  if (guard) return guard;

  if (!consumeAgentQuota()) {
    return NextResponse.json({ error: 'Quota quotidien atteint.', quotas: getAgentQuota() }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const schoolId = typeof body.schoolId === 'string' ? body.schoolId.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const type = typeof body.type === 'string' && body.type.trim() ? body.type.trim().toUpperCase() : 'AI_AGENT';
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const targetRole = typeof body.targetRole === 'string' ? body.targetRole.trim().toUpperCase() : '';

  if (!schoolId || !title || !message) {
    return NextResponse.json({ error: 'Champs requis : schoolId, title, message.' }, { status: 400 });
  }
  if (title.length > 150 || message.length > 1000) {
    return NextResponse.json({ error: 'title ≤ 150 caractères, message ≤ 1000 caractères.' }, { status: 400 });
  }

  const school = await db.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) {
    return NextResponse.json({ error: 'École introuvable.' }, { status: 404 });
  }

  // Résolution des destinataires : soit un utilisateur, soit un rôle entier.
  let recipients: { id: string }[];
  if (userId) {
    const user = await db.user.findFirst({
      where: { id: userId, schoolId },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable dans cette école.' }, { status: 404 });
    }
    recipients = [user];
  } else if (targetRole) {
    recipients = await db.user.findMany({
      where: { role: targetRole, schoolId },
      select: { id: true },
      take: MAX_BATCH,
    });
    if (recipients.length === 0) {
      return NextResponse.json({ error: `Aucun utilisateur « ${targetRole} » dans cette école.` }, { status: 404 });
    }
  } else {
    return NextResponse.json({ error: 'Cible requise : userId ou targetRole.' }, { status: 400 });
  }

  await db.notification.createMany({
    data: recipients.map((r) => ({
      type,
      title,
      message,
      userId: r.id,
      schoolId,
    })),
  });

  await auditAgentAction(
    'AI_AGENT_NOTIFICATION_CREATE',
    'Notification',
    null,
    `« ${title} » envoyée à ${recipients.length} destinataire(s).`,
    schoolId,
    { type, targetRole: targetRole || undefined, userId: userId || undefined },
  );

  return NextResponse.json(
    {
      status: 'created',
      createdCount: recipients.length,
      timestamp: new Date().toISOString(),
    },
    { status: 201 },
  );
}
