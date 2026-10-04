import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { APP_NAME, auditAgentAction, consumeAgentQuota, getAgentQuota, requireAgent } from '@/lib/ai-agent';
import { db } from '@/lib/db';

// ─── POST /api/ai/query — Requête en langage naturel (IA) ───────────────────
// Body : { "question": "...", "requestId"?: "..." }
// L'agent IA externe pose une question ; on collecte des statistiques réelles
// de la base et le LLM (backend uniquement) rédige une réponse en français.

async function collectSnapshot() {
  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [
    schools,
    students,
    users,
    classes,
    payments30d,
    paidRecords30d,
    discipline30d,
    infirmary7d,
    absences7d,
    unreadNotifications,
  ] = await Promise.all([
    db.school.count(),
    db.student.count({ where: { isArchived: false } }),
    db.user.count(),
    db.class.count(),
    db.paymentRecord.count({ where: { createdAt: { gte: since30d } } }),
    db.paymentRecord.aggregate({ _sum: { paidAmount: true }, where: { paidAt: { gte: since30d } } }),
    db.disciplineRecord.count({ where: { createdAt: { gte: since30d } } }),
    db.infirmaryVisit.count({ where: { visitDate: { gte: since7d } } }),
    db.attendanceRecord.count({ where: { date: { gte: new Date(since7d).toISOString().slice(0, 10) }, status: 'ABSENT' } }),
    db.notification.count({ where: { isRead: false } }),
  ]);

  return {
    ecoles: schools,
    elevesActifs: students,
    utilisateurs: users,
    classes,
    paiementsCrees30j: payments30d,
    totalEncaisse30j: paidRecords30d._sum.paidAmount ?? 0,
    incidentsDiscipline30j: discipline30d,
    visitesInfirmerie7j: infirmary7d,
    absences7j: absences7d,
    notificationsNonLues: unreadNotifications,
  };
}

export async function POST(request: NextRequest) {
  const guard = requireAgent(request);
  if (guard) return guard;

  if (!consumeAgentQuota()) {
    return NextResponse.json({ error: 'Quota quotidien atteint.', quotas: getAgentQuota() }, { status: 429 });
  }

  let body: { question?: unknown; requestId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return NextResponse.json({ error: 'Champ « question » requis.' }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: 'Question trop longue (max 2000 caractères).' }, { status: 400 });
  }

  let stats: Awaited<ReturnType<typeof collectSnapshot>>;
  try {
    stats = await collectSnapshot();
  } catch (e) {
    return NextResponse.json(
      { error: `Base de données indisponible : ${e instanceof Error ? e.message : 'erreur inconnue'}` },
      { status: 503 },
    );
  }

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            `Tu es l'assistant IA de ${APP_NAME}, plateforme de gestion scolaire multi-écoles en RDC. ` +
            'Réponds TOUJOURS en français, de façon concise et factuelle, en t’appuyant UNIQUEMENT ' +
            'sur les statistiques fournies. Si l’information demandée n’y figure pas, dis-le ' +
            'clairement et suggère l’endpoint dédié (/api/ai/db/query, /api/ai/payments, ' +
            '/api/ai/discipline, /api/ai/patients…). Ne demande jamais de données personnelles ' +
            'sensibles (mots de passe, tokens).',
        },
        {
          role: 'user',
          content: `Statistiques actuelles (JSON) :\n${JSON.stringify(stats, null, 2)}\n\nQuestion : ${question}`,
        },
      ],
      thinking: { type: 'disabled' },
    });

    const answer = completion.choices[0]?.message?.content ?? '';
    if (!answer.trim()) {
      return NextResponse.json({ error: 'Le modèle IA n’a renvoyé aucune réponse.' }, { status: 502 });
    }

    await auditAgentAction('AI_AGENT_QUERY', 'AiQuery', null, `Question : ${question.slice(0, 300)}`);

    return NextResponse.json({
      answer,
      stats,
      requestId: typeof body.requestId === 'string' ? body.requestId : null,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Erreur LLM : ${e instanceof Error ? e.message : 'inconnue'}` },
      { status: 502 },
    );
  }
}
