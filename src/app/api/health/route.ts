import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/health
// Endpoint public de santé — sert de healthcheck Docker/Coolify et de
// supervision de production. Ne retourne que l'état, jamais de donnée
// sensible.
//   200 : application et base de données joignables
//   503 : la base ne répond pas (ou timeout) → le conteneur est marqué en échec
export const dynamic = 'force-dynamic';

const DB_TIMEOUT_MS = 4000;

export async function GET() {
  const startedAt = Date.now();
  let database: 'up' | 'down' = 'up';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // SELECT 1 est valide sur SQLite (dev/desk) comme sur PostgreSQL (prod).
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('db-timeout')), DB_TIMEOUT_MS);
      }),
    ]);
  } catch {
    database = 'down';
  } finally {
    if (timer) clearTimeout(timer);
  }

  return NextResponse.json(
    {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status: database === 'up' ? 200 : 503 }
  );
}
