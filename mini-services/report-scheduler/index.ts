// ─── Mini-service : planificateur agentique des rapports EduGest ────────────
// Port 3002. Toutes les 30 s, lit les programmes ReportSchedule actifs dans
// la base SQLite et déclenche, via l'application Next (port 3000, clé
// partagée), l'envoi du rapport (texte WhatsApp + PDF) aux destinataires.
//
// Le service ne fait AUCUNE écriture en base : la route
// /api/reports/scheduler-run de l'app exécute la logique métier et avance
// elle-même le planning (nextRunAt, lastStatus…).

import { Database } from 'bun:sqlite';

const PORT = 3002;
const APP_URL = process.env.EUGEST_APP_URL || 'http://localhost:3000';
const SCHEDULER_KEY = process.env.REPORT_SCHEDULER_KEY || 'edugest-scheduler-key';
const DB_PATH = process.env.DATABASE_URL?.replace(/^file:/, '') || '/home/z/my-project/db/custom.db';
const SCAN_INTERVAL_MS = 30_000;

// Anti double-déclenchement : id → timestamp du dernier tir
const fired = new Map<string, number>();
const FIRE_TTL_MS = 10 * 60_000;

function openDb(): Database | null {
  try {
    // readonly : jamais de verrou en écriture sur la base de l'app
    // (bun:sqlite natif — better-sqlite3 plante sous Bun avec SIGILL)
    return new Database(DB_PATH, { readonly: true });
  } catch (e) {
    console.warn(`[Scheduler] Base indisponible (${DB_PATH}) :`, (e as Error).message);
    return null;
  }
}

/** Prisma (SQLite) stocke les DateTime en texte ISO-8601 ; parsing tolérant. */
function parsePrismaDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return new Date(raw);
  if (typeof raw !== 'string') return null;
  // « 2026-09-23 09:00:00.000 +00:00 » → ISO compatible
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

async function triggerSchedule(id: string): Promise<void> {
  const res = await fetch(`${APP_URL}/api/reports/scheduler-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-scheduler-key': SCHEDULER_KEY },
    body: JSON.stringify({ id }),
  });
  const j = (await res.json().catch(() => ({}))) as { data?: { status?: string; detail?: string }; error?: string };
  if (!res.ok) {
    console.error(`[Scheduler] Échec du déclenchement de ${id} :`, j.error || res.status);
  } else {
    console.log(`[Scheduler] Rapport ${id} → ${j.data?.status || 'ok'} : ${j.data?.detail || ''}`);
  }
}

function scan(): void {
  let db: Database | null = null;
  try {
    db = openDb();
    if (!db) return;
    const rows = db
      .query('SELECT id, schoolId, intervalDays, hour, minute, isActive, nextRunAt FROM ReportSchedule WHERE isActive = 1')
      .all() as Array<{
      id: string; schoolId: string; intervalDays: number; hour: number; minute: number;
      isActive: number; nextRunAt: string | null;
    }>;
    const now = Date.now();
    for (const row of rows) {
      const due = parsePrismaDate(row.nextRunAt);
      if (!due || due.getTime() > now) continue;
      const last = fired.get(row.id) || 0;
      if (now - last < FIRE_TTL_MS) continue; // déjà tiré récemment (app en cours)
      fired.set(row.id, now);
      console.log(`[Scheduler] Programme échu ${row.id} (${row.intervalDays}j à ${row.hour}h${String(row.minute).padStart(2, '0')}) → déclenchement`);
      void triggerSchedule(row.id).catch((e) => console.error('[Scheduler] Trigger error :', e));
    }
    // Purge du cache anti-doublon
    for (const [k, t] of fired) {
      if (now - t > FIRE_TTL_MS) fired.delete(k);
    }
  } catch (e) {
    console.warn('[Scheduler] Scan échoué :', (e as Error).message);
  } finally {
    db?.close();
  }
}

console.log(`[Scheduler] Mini-service planificateur démarré — port ${PORT}, scan toutes les ${SCAN_INTERVAL_MS / 1000} s, base : ${DB_PATH}`);
scan();
setInterval(scan, SCAN_INTERVAL_MS);

// Petit endpoint HTTP de santé (permet de vérifier que le service tourne)
Bun.serve({
  port: PORT,
  fetch() {
    return new Response(
      JSON.stringify({ ok: true, service: 'edugest-report-scheduler', firedRecently: fired.size }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  },
});
