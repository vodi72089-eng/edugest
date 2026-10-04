import { NextResponse } from 'next/server';
import { APP_NAME, isAgentConfigured } from '@/lib/ai-agent';
import { db } from '@/lib/db';

// ─── GET /api/ai/health — Statut de santé (public, 200 ou 503) ──────────────
// Sert de sonde pour l'agent IA externe : base de données joignable + agent
// configuré (token). Aucune donnée sensible n'est renvoyée.

export async function GET() {
  let dbUp = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbUp = true;
  } catch {
    dbUp = false;
  }

  const agent = isAgentConfigured();
  const ok = dbUp && agent;

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      app: APP_NAME,
      database: dbUp ? 'up' : 'down',
      agent: agent ? 'configured' : 'missing_token',
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
