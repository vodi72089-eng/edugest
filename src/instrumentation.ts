// ─── Instrumentation Next.js ────────────────────────────────────────────────
// `register` est appelé UNE fois au démarrage de chaque instance serveur
// (dev, standalone/prod, exe desktop). Ici :
//   1) Cloudflare Workers : warm-up de la base puis PRÉCHARGEMENT INTÉGRAL et
//      ATTENDU de tous les modules de routes/pages côté serveur (voir plus bas) ;
//   2) Node/EXE : migration additive du schéma SQLite local + planificateur
//      in-process des rapports — balaie les ReportSchedule actifs arrivés à
//      échéance toutes les 60 s, génère texte WhatsApp + PDF et notifie les
//      admins dans l'app. Fonctionne même aucune cliente ouverte (option
//      serveur 24/7). Guard globalThis anti redémarrage (HMR dev).

const DB_WARMUP_TIMEOUT_MS = 15_000;
const PRELOAD_TIMEOUT_MS = 30_000;

export async function register() {
  // ── Cloudflare Workers : éliminer la classe « isolat empoisonné » ──────────
  //
  // Mécanisme constaté en production (login « Erreur réseau » intermittent,
  // 500/1101 sur des routes isolées pendant des heures) :
  //   • chaque route est chargée par un import() dynamique DANS la première
  //     requête qui la touche (vinext `ensureRouteLoaded` → `Promise.all` des
  //     loaders, promesse mémoïsée sur l'objet route — `__loading`) ;
  //   • si l'évaluation de ce module se termine APRÈS la fin (ou l'annulation)
  //     de la requête créatrice, workerd abandonne la continuation — le drapeau
  //     `no_handle_cross_request_promise_resolution` (wrangler.jsonc) empêche
  //     tout rejouement : la promesse d'import ne se résout JAMAIS ;
  //   • `__loading` reste alors pendante à jamais → toutes les requêtes
  //     suivantes de cette route retournent 500/1101 jusqu'au recyclage de
  //     l'isolat (« The Workers runtime canceled this request because it
  //     detected that your Worker's code had hung »).
  //
  // Solution : tout évaluer ICI, dans le contexte de la requête
  // d'amorçage, et TOUT ATTENDRE — register() est mémorisé puis attendu par
  // vinext avant tout module serveur utilisateur (« The generated RSC entry
  // also awaits the shared registration promise before importing user server
  // modules »), donc la requête créatrice est garantie vivante pendant toute
  // l'évaluation : aucune continuation n'est abandonnée, le registre de
  // modules est complet au premier contact réel d'une route.
  //   • d'abord @/lib/db (top-level `await db.$connect()`, borné 15 s) ;
  //   • puis les 163 modules de routes/pages serveur (Promise.allSettled,
  //     borné 30 s ; évaluations désormais sans I/O = CPU seulement).
  // Chaque import() est un LITTERAL analysable par le bundler : ils se
  // résolvent vers les chunks déjà émis pour le manifeste de routes (même
  // instance de module, aucune double charge).
  if (isCloudflareWorkers()) {
    // Identifiant d'isolat dans le log d'amorçage : permet de corréler un
    // « isolat X prêt » avec les requêtes suivantes lors d'un diagnostic
    // (wrangler tail) — un wedge ou une lenteur se rattache alors à un isolat.
    (globalThis as { __edugestIso?: string }).__edugestIso = crypto
      .randomUUID()
      .slice(0, 8);

    // Diagnostic wedge : journalise toute promesse rejetee non geree
    // (vecteur d'abandon cross-request - investigation du 10/10/2026).
    try {
      process.on('unhandledRejection', (reason) => {
        console.error(
          `[${(globalThis as { __edugestIso?: string }).__edugestIso}] promesse rejetee non geree:`,
          reason
        );
      });
    } catch {
      // process.on indisponible : silencieux, le diagnostic reste optionnel.
    }

    const dbReady = await Promise.race([
      import('./lib/db')
        .then(() => true as const)
        .catch((error) => {
          console.error('[instrumentation] warm-up base de données échoué :', error);
          return false as const;
        }),
      timeout(DB_WARMUP_TIMEOUT_MS).then(() => false as const),
    ]);

    if (!dbReady) {
      console.error(
        `[instrumentation] warm-up base interrompu (> ${DB_WARMUP_TIMEOUT_MS} ms) — ` +
          'préchargement des routes ignoré pour cet isolat (première requête par route restante).',
      );
    } else {
      const t0 = Date.now();
      await Promise.race([Promise.allSettled(buildPreloadList()), timeout(PRELOAD_TIMEOUT_MS)]);
      console.log(
        `[instrumentation] isolat ${(globalThis as { __edugestIso?: string }).__edugestIso} prêt — ` +
          `modules serveur préchargés en ${Date.now() - t0} ms`,
      );
    }
  }

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

// Journalisation des erreurs non gérées de requête (diagnostic future).
export function onRequestError(error: Error) {
  console.error('[instrumentation] erreur de requête non gérée :', error?.stack || error);
}

function timeout(ms: number): Promise<'timeout'> {
  return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
}

// TOUS les modules de segments côté serveur (route.ts + page/layout/loading/
// error/not-found serveur), générés depuis l'arbre src/app. Les fichiers
// 'use client' sont exclus (références cliente, évaluation nulle côté RSC).
// ⚠️ Régénérer cette liste quand on AJOUTE une route/page serveur
//   (voir scripts de génération de session, ou suivre le motif ci-dessous).
function buildPreloadList(): Promise<unknown>[] {
  return [
    import('./app/api/admin-analytics/route'),
    import('./app/api/attendance/route'),
    import('./app/api/attendance/teachers/history/pdf/route'),
    import('./app/api/attendance/teachers/history/route'),
    import('./app/api/attendance/teachers/route'),
    import('./app/api/auth/change-password/route'),
    import('./app/api/auth/forgot-password/route'),
    import('./app/api/auth/google/callback/route'),
    import('./app/api/auth/google/route'),
    import('./app/api/auth/logout/route'),
    import('./app/api/auth/me/route'),
    import('./app/api/auth/reset-password/route'),
    import('./app/api/auth/route'),
    import('./app/api/auth/send-otp/route'),
    import('./app/api/auth/verify-otp/route'),
    import('./app/api/auth/verify-reset-code/route'),
    import('./app/api/auth/whatsapp/route'),
    import('./app/api/bulletins/[studentId]/route'),
    import('./app/api/bulletins/[studentId]/whatsapp/route'),
    import('./app/api/classes/[id]/route'),
    import('./app/api/classes/route'),
    import('./app/api/class-passing/repechage/route'),
    import('./app/api/class-passing/route'),
    import('./app/api/communications/[id]/approve/route'),
    import('./app/api/communications/[id]/read/route'),
    import('./app/api/communications/route'),
    import('./app/api/convocations/[id]/read/route'),
    import('./app/api/convocations/[id]/reschedule/route'),
    import('./app/api/convocations/[id]/respond/route'),
    import('./app/api/convocations/route'),
    import('./app/api/corporate/me/route'),
    import('./app/api/corporates/[id]/route'),
    import('./app/api/corporates/[id]/schools/route'),
    import('./app/api/corporates/route'),
    import('./app/api/currency/convert/route'),
    import('./app/api/currency/exchange-rates/route'),
    import('./app/api/currency/route'),
    import('./app/api/debts/route'),
    import('./app/api/discipline/classify/route'),
    import('./app/api/discipline/keywords/[id]/route'),
    import('./app/api/discipline/keywords/route'),
    import('./app/api/discipline/route'),
    import('./app/api/dispenses/[id]/route'),
    import('./app/api/dispenses/route'),
    import('./app/api/document-verifications/route'),
    import('./app/api/educational-systems/route'),
    import('./app/api/email-config/route'),
    import('./app/api/events/[id]/route'),
    import('./app/api/events/route'),
    import('./app/api/exchange-rate/route'),
    import('./app/api/feature-grants/route'),
    import('./app/api/finance-overview/route'),
    import('./app/api/grades/[id]/read/route'),
    import('./app/api/grades/route'),
    import('./app/api/health/route'),
    import('./app/api/homework/[id]/read/route'),
    import('./app/api/homework/route'),
    import('./app/api/logs/route'),
    import('./app/api/medical/dispensations/route'),
    import('./app/api/medical/documents/[id]/pdf/route'),
    import('./app/api/medical/documents/route'),
    import('./app/api/medical/records/route'),
    import('./app/api/medical/visits/route'),
    import('./app/api/notifications/read-all/route'),
    import('./app/api/notifications/route'),
    import('./app/api/parents/route'),
    import('./app/api/payment-gateways/[id]/route'),
    import('./app/api/payment-gateways/initiate/route'),
    import('./app/api/payment-gateways/initiate-subscription/route'),
    import('./app/api/payment-gateways/route'),
    import('./app/api/payments/[id]/route'),
    import('./app/api/payments/online/route'),
    import('./app/api/payments/receipt/[id]/route'),
    import('./app/api/payments/route'),
    import('./app/api/payments/subscription/renew/route'),
    import('./app/api/payments/subscription/route'),
    import('./app/api/payments/verify/route'),
    import('./app/api/payments/verify-receipt/route'),
    import('./app/api/payments/webhook/route'),
    import('./app/api/payments/webhook/subscription/route'),
    import('./app/api/payment-transactions/[id]/route'),
    import('./app/api/payment-transactions/route'),
    import('./app/api/platform/update/route'),
    import('./app/api/platform-announcements/route'),
    import('./app/api/platform-emails/route'),
    import('./app/api/platform-events/[id]/route'),
    import('./app/api/platform-events/route'),
    import('./app/api/platform-events/status/route'),
    import('./app/api/platform-payment-gateways/route'),
    import('./app/api/pricing/route'),
    import('./app/api/profile/route'),
    import('./app/api/public/find-child/route'),
    import('./app/api/public/parent-register/route'),
    import('./app/api/public/schools/route'),
    import('./app/api/public/stats/route'),
    import('./app/api/push/subscribe/route'),
    import('./app/api/push/unsubscribe/route'),
    import('./app/api/push/vapid/route'),
    import('./app/api/report-cards/route'),
    import('./app/api/reports/cashier/route'),
    import('./app/api/reports/pdf/route'),
    import('./app/api/reports/route'),
    import('./app/api/reports/schedule/route'),
    import('./app/api/reports/scheduler-run/route'),
    import('./app/api/reports/send/route'),
    import('./app/api/reset/route'),
    import('./app/api/route'),
    import('./app/api/school/design/route'),
    // EXCLUE du préchargement : cette route importe better-sqlite3 (module
    // NATIF Node) — son évaluation ferait échouer le bundle Edge Instrumentation
    // de la CI (« Module not found: Can't resolve (<dynamic> | 'null')" dans
    // better-sqlite3/lib/binding.js). Sur Workers la route est de toute façon
    // inopérante (EXE-only) : son import y est rejeté, ce qui purge __loading
    // automatiquement — pas de risque de wedge.
    // import('./app/api/school/import-db/route'),
    import('./app/api/school-comments/route'),
    import('./app/api/school-currency/route'),
    import('./app/api/school-fees/[id]/route'),
    import('./app/api/school-fees/route'),
    import('./app/api/school-photos/[id]/route'),
    import('./app/api/school-photos/route'),
    import('./app/api/school-photos/search/route'),
    import('./app/api/school-qr-codes/[id]/route'),
    import('./app/api/school-qr-codes/route'),
    import('./app/api/schools/[id]/archived-students/route'),
    import('./app/api/schools/[id]/restore-students/route'),
    import('./app/api/schools/[id]/route'),
    import('./app/api/schools/route'),
    import('./app/api/seed/route'),
    import('./app/api/sessions/device/route'),
    import('./app/api/sessions/revoke/route'),
    import('./app/api/sessions/revoke-all/route'),
    import('./app/api/sessions/route'),
    import('./app/api/settings-approval/route'),
    import('./app/api/sms-config/route'),
    import('./app/api/sommation/route'),
    import('./app/api/stats/route'),
    import('./app/api/students/[id]/parent-account/route'),
    import('./app/api/students/[id]/route'),
    import('./app/api/students/route'),
    import('./app/api/subjects/route'),
    import('./app/api/subscription/downgrade/route'),
    import('./app/api/subscription/payment-methods/route'),
    import('./app/api/subscription/request/[id]/route'),
    import('./app/api/subscription/request/route'),
    import('./app/api/subscription/requests/route'),
    import('./app/api/subscription/status/route'),
    import('./app/api/subscription/validate/route'),
    import('./app/api/support/agent/route'),
    import('./app/api/support/tickets/[id]/route'),
    import('./app/api/support/tickets/route'),
    import('./app/api/sync/pulse/route'),
    import('./app/api/sync/push/route'),
    import('./app/api/sync/send/route'),
    import('./app/api/sync/token/route'),
    import('./app/api/teacher-assignments/route'),
    import('./app/api/users/profile/route'),
    import('./app/api/users/route'),
    import('./app/api/verify/document/route'),
    import('./app/api/version/exe/route'),
    import('./app/api/whatsapp/usage/route'),
    import('./app/api/whatsapp-api/route'),
    import('./app/api/whatsapp-config/connect/route'),
    import('./app/api/whatsapp-config/custom/route'),
    import('./app/api/whatsapp-config/route'),
    import('./app/api/whatsapp-config/status/route'),
    import('./app/api/whatsapp-status/route'),
    import('./app/layout'),
    import('./app/verify/document/[code]/page'),
  ];
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
