import { db } from '@/lib/db';
import { NextResponse, after } from 'next/server';

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
    // Épingle after() AVANT la course : si le timeout de 4 s est gagné (Neon
    // lent), la requête reste en vol quand la réponse part — sans ctx.waitUntil
    // sa continuation serait abandonnée par workerd et PRISMA EMPOISONNERAIT
    // l'isolat (toutes les requêtes DB suivantes gèlent). Après : la page
    // respond 503 comme avant, la requête conclut en arrière-plan.
    const query = db.$queryRaw`SELECT 1`;
    after(() => query.catch(() => {}));
    await Promise.race([
      query,
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
