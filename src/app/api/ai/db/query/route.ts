import { NextRequest, NextResponse } from 'next/server';
import {
  auditAgentAction,
  consumeAgentQuota,
  getAgentQuota,
  requireAgent,
  serializeRows,
  validateReadOnlySql,
} from '@/lib/ai-agent';
import { db } from '@/lib/db';

// ─── POST /api/ai/db/query — Accès SQL en LECTURE SEULE, validé ─────────────
// Body : { "query": "SELECT ... FROM Student ...", "risk": "read-only" }
// Aucune connexion directe à la base n'est exposée : la requête est validée
// (SELECT seul, tables en whitelist, LIMIT borné) avant exécution via Prisma.
// Les risques « write » et « admin » sont explicitement refusés.

export async function POST(request: NextRequest) {
  const guard = requireAgent(request);
  if (guard) return guard;

  if (!consumeAgentQuota()) {
    return NextResponse.json({ error: 'Quota quotidien atteint.', quotas: getAgentQuota() }, { status: 429 });
  }

  let body: { query?: unknown; risk?: unknown; requestId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const risk = typeof body.risk === 'string' ? body.risk : 'read-only';
  if (risk !== 'read-only') {
    return NextResponse.json(
      { error: `Risque « ${risk} » refusé : seul « read-only » est autorisé pour l'agent IA.` },
      { status: 403 },
    );
  }

  const raw = typeof body.query === 'string' ? body.query : '';
  const validation = validateReadOnlySql(raw);
  if (!validation.ok || !validation.sql) {
    return NextResponse.json({ error: validation.error ?? 'Requête invalide.' }, { status: 400 });
  }

  try {
    const rows = await db.$queryRawUnsafe<unknown[]>(validation.sql);
    const serialized = serializeRows(Array.isArray(rows) ? rows : []).slice(0, 500);

    await auditAgentAction(
      'AI_AGENT_DB_QUERY',
      'AiDbQuery',
      null,
      `SQL : ${validation.sql.slice(0, 300)}`,
      null,
      { rowCount: serialized.length },
    );

    return NextResponse.json({
      rows: serialized,
      rowCount: serialized.length,
      sql: validation.sql,
      requestId: typeof body.requestId === 'string' ? body.requestId : null,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Exécution SQL échouée : ${e instanceof Error ? e.message : 'erreur inconnue'}` },
      { status: 400 },
    );
  }
}
