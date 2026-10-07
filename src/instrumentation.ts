// ─── Instrumentation Next.js ────────────────────────────────────────────────
// `register` est appelé UNE fois au démarrage de chaque instance serveur
// (dev, standalone/prod, exe desktop). Ici : lance le planificateur
// in-process des rapports — balaie les ReportSchedule actifs arrivés à
// échéance toutes les 60 s, génère texte WhatsApp + PDF et notifie les
// admins dans l'app. Fonctionne même aucune cliente ouverte (option
// serveur 24/7). Guard globalThis anti redémarrage (HMR dev).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // ── Base SQLite locale (app desktop) : migration additive du schéma ──────
    // AVANT le planificateur (ReportSchedule) et avant toute requête
    // (RateLimitBucket : sans elle le login est bloqué en 429 fail-closed).
    // Une base créée par une version antérieure de l'EXE n'est jamais migrée
    // par main.js (le template n'est recopié que si la base est absente).
    // Échec → message EXPLICITE ci-dessous, jamais de fallback silencieux.
    if ((process.env.DATABASE_URL || '').startsWith('file:')) {
      try {
        const { upgradeLocalSqliteSchema } = await import('./lib/sqlite-schema-upgrade');
        await upgradeLocalSqliteSchema();
      } catch (e) {
        console.error(
          '[schema] Migration de la base locale IMPOSSIBLE — connexion (RateLimitBucket) ' +
            'et planificateur (ReportSchedule) peuvent échouer sur ce schéma ancien :',
          (e as Error)?.message,
        );
      }
    }

    // ── Cloudflare Workers : pas de planificateur in-process ──────────────────
    // workerd n'a AUCUN processus persistant : setTimeout/setInterval ne
    // survivent pas entre deux requêtes, et une requête DB lancée HORS
    // contexte de requête est refusée par le runtime :
    //   « Cannot perform I/O on behalf of a different request »
    // et surtout elle empoisonne le PrismaClient partagé (module singleton) :
    // les requêtes suivantes reçoivent le même 503 / db-timeout
    // (constaté sur /api/health en local wrangler dev).
    // Le planificateur reste donc piloté de l'extérieur via l'endpoint
    // existant POST /api/reports/scheduler-run (cron / mini-service 3002).
    // ⚠️ Avertissement EXPLICITE (pas de fallback silencieux).
    if (isCloudflareWorkers()) {
      console.warn(
        '[Scheduler] In-process désactivé sous Cloudflare Workers (workerd : ' +
          'I/O hors contexte de requête interdit). Planifiez POST ' +
          '/api/reports/scheduler-run (cron trigger ou mini-service).',
      );
      return;
    }
    const { startInProcessScheduler } = await import('./lib/report-scheduler');
    startInProcessScheduler();
  }
}

/** true si le runtime est workerd (Cloudflare Workers, y compris wrangler dev). */
function isCloudflareWorkers(): boolean {
  try {
    const ua = (globalThis as { navigator?: { userAgent?: string } }).navigator
      ?.userAgent;
    if (typeof ua === 'string' && /Cloudflare-Workers/i.test(ua)) return true;
  } catch {
    // navigator peut être verrouillé — on considère alors que ce n'est pas Workers.
  }
  return false;
}
