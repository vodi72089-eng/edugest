// ─── Instrumentation Next.js ────────────────────────────────────────────────
// `register` est appelé UNE fois au démarrage de chaque instance serveur
// (dev, standalone/prod, exe desktop). Ici : lance le planificateur
// in-process des rapports — balaie les ReportSchedule actifs arrivés à
// échéance toutes les 60 s, génère texte WhatsApp + PDF et notifie les
// admins dans l'app. Fonctionne même aucune cliente ouverte (option
// serveur 24/7). Guard globalThis anti redémarrage (HMR dev).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startInProcessScheduler } = await import('./lib/report-scheduler');
    startInProcessScheduler();
  }
}
