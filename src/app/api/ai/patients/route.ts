import { NextRequest, NextResponse } from 'next/server';
import { auditAgentAction, requireAgent } from '@/lib/ai-agent';
import { db } from '@/lib/db';

// ─── GET /api/ai/patients — Centre de santé scolaire (infirmerie) ───────────
// Query : ?schoolId=… (requis) &limit=… (1-100, défaut 20) &decision=…
// Renvoie les visites d'infirmerie récentes + les urgences des 30 derniers
// jours. Le filtrage par école est obligatoire (isolation multi-tenant).

const DECISIONS = ['RETURN_TO_CLASS', 'RESTING', 'SENT_HOME', 'EMERGENCY_EVACUATION'];

export async function GET(request: NextRequest) {
  const guard = requireAgent(request);
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId')?.trim() || '';
  if (!schoolId) {
    return NextResponse.json({ error: 'Paramètre « schoolId » requis.' }, { status: 400 });
  }

  const school = await db.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } });
  if (!school) {
    return NextResponse.json({ error: 'École introuvable.' }, { status: 404 });
  }

  const limitParam = Number(searchParams.get('limit') || '20');
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, Math.trunc(limitParam))) : 20;

  const decision = searchParams.get('decision')?.trim() || '';
  if (decision && !DECISIONS.includes(decision)) {
    return NextResponse.json(
      { error: `Décision invalide. Valeurs : ${DECISIONS.join(', ')}.` },
      { status: 400 },
    );
  }

  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [visits, totalVisits30d, emergencies30d, medicalRecords] = await Promise.all([
    db.infirmaryVisit.findMany({
      where: { schoolId, ...(decision ? { decision } : {}) },
      orderBy: { visitDate: 'desc' },
      take: limit,
      include: {
        student: { select: { id: true, matricule: true, firstName: true, lastName: true, classId: true } },
      },
    }),
    db.infirmaryVisit.count({ where: { schoolId, visitDate: { gte: since30d } } }),
    db.infirmaryVisit.count({ where: { schoolId, visitDate: { gte: since30d }, decision: 'EMERGENCY_EVACUATION' } }),
    db.medicalRecord.count({ where: { student: { schoolId } } }),
  ]);

  await auditAgentAction(
    'AI_AGENT_PATIENTS_READ',
    'InfirmaryVisit',
    null,
    `Consultation infirmerie (${visits.length} visites renvoyées).`,
    schoolId,
  );

  return NextResponse.json({
    school: { id: school.id, name: school.name },
    summary: { visits30d: totalVisits30d, emergencies30d, medicalRecords },
    visits: visits.map((v) => ({
      id: v.id,
      visitDate: v.visitDate,
      student: {
        id: v.student.id,
        matricule: v.student.matricule,
        name: `${v.student.firstName} ${v.student.lastName}`,
        classId: v.student.classId,
      },
      reason: v.reason,
      symptoms: v.symptoms,
      treatment: v.treatment,
      decision: v.decision,
      temperature: v.temperature,
      parentNotified: v.parentNotified,
    })),
    timestamp: new Date().toISOString(),
  });
}
