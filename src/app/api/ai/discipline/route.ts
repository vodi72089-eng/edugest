import { NextRequest, NextResponse } from 'next/server';
import { auditAgentAction, consumeAgentQuota, getAgentQuota, requireAgent } from '@/lib/ai-agent';
import { db } from '@/lib/db';

// ─── /api/ai/discipline — Actions discipline de l'agent IA ──────────────────
// GET  ?schoolId=… (requis) &limit=…   → incidents récents
// POST { schoolId, studentId, type, severity, title, description?, points?,
//        listType? }                   → création d'un incident (PENDING)
// Une notification est créée pour les SCHOOL_ADMIN de l'école concernée.

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const LIST_TYPES = ['BLACKLIST', 'GREYLIST', 'WHITELIST'];

export async function GET(request: NextRequest) {
  const guard = requireAgent(request);
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId')?.trim() || '';
  if (!schoolId) {
    return NextResponse.json({ error: 'Paramètre « schoolId » requis.' }, { status: 400 });
  }

  const limitParam = Number(searchParams.get('limit') || '20');
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, Math.trunc(limitParam))) : 20;

  const [records, total, pending] = await Promise.all([
    db.disciplineRecord.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        student: { select: { matricule: true, firstName: true, lastName: true } },
      },
    }),
    db.disciplineRecord.count({ where: { schoolId } }),
    db.disciplineRecord.count({ where: { schoolId, status: 'PENDING' } }),
  ]);

  return NextResponse.json({
    summary: { total, pending },
    records: records.map((r) => ({
      id: r.id,
      date: r.createdAt,
      student: `${r.student.firstName} ${r.student.lastName}`,
      matricule: r.student.matricule,
      type: r.type,
      severity: r.severity,
      title: r.title,
      description: r.description,
      points: r.points,
      listType: r.listType,
      status: r.status,
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
  const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : '';
  const type = typeof body.type === 'string' ? body.type.trim() : '';
  const severity = typeof body.severity === 'string' ? body.severity.trim().toUpperCase() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const points = Number(body.points ?? 0);
  const listType = typeof body.listType === 'string' ? body.listType.trim().toUpperCase() : 'GREYLIST';

  if (!schoolId || !studentId || !type || !title) {
    return NextResponse.json(
      { error: 'Champs requis : schoolId, studentId, type, title.' },
      { status: 400 },
    );
  }
  if (!SEVERITIES.includes(severity)) {
    return NextResponse.json({ error: `severity doit être : ${SEVERITIES.join(', ')}.` }, { status: 400 });
  }
  if (!LIST_TYPES.includes(listType)) {
    return NextResponse.json({ error: `listType doit être : ${LIST_TYPES.join(', ')}.` }, { status: 400 });
  }
  if (!Number.isFinite(points) || points < 0 || points > 100) {
    return NextResponse.json({ error: 'points doit être un nombre entre 0 et 100.' }, { status: 400 });
  }

  const student = await db.student.findFirst({
    where: { id: studentId, schoolId, isArchived: false },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!student) {
    return NextResponse.json(
      { error: 'Élève introuvable dans cette école (isolation multi-tenant).' },
      { status: 404 },
    );
  }

  const record = await db.disciplineRecord.create({
    data: {
      studentId: student.id,
      type,
      severity,
      title,
      description,
      points: Math.trunc(points),
      listType,
      status: 'PENDING',
      schoolId,
    },
  });

  // Notification des administrateurs de l'école.
  const admins = await db.user.findMany({
    where: { role: 'SCHOOL_ADMIN', schoolId },
    select: { id: true },
  });
  if (admins.length > 0) {
    await db.notification.createMany({
      data: admins.map((a) => ({
        type: 'DISCIPLINE',
        title: 'Nouvel incident signalé par l’agent IA',
        message: `${student.firstName} ${student.lastName} — ${title} (${severity}, ${points} pts).`,
        userId: a.id,
        schoolId,
        relatedId: record.id,
      })),
    });
  }

  await auditAgentAction(
    'AI_AGENT_DISCIPLINE_CREATE',
    'DisciplineRecord',
    record.id,
    `Incident « ${title} » créé pour ${student.firstName} ${student.lastName} (${severity}, ${points} pts).`,
    schoolId,
    { type, severity, points: Math.trunc(points), listType },
  );

  return NextResponse.json(
    {
      status: 'created',
      record: { id: record.id, status: record.status, listType: record.listType },
      notifiedAdmins: admins.length,
      timestamp: new Date().toISOString(),
    },
    { status: 201 },
  );
}
