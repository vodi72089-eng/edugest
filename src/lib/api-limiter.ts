// ═══════════════════════════════════════════════════════════════════════════
// LIMITATION DE CONCURRENCE DES APPELS API CÔTÉ CLIENT
//
// Pourquoi : le runtime workerd (Cloudflare Workers) annule toute requête
// dont il estime qu'elle « ne générera jamais de réponse » (« hung ») quand
// un isolate dépasse ~12 requêtes simultanées — voir
// docs/MIGRATION-WORKERS-BLOCAGES.md. Le dashboard chargeait 10 à 14
// données en parallèle au démarrage, ce qui produisait des 500 intermittents
// (page d'erreur Cloudflare « Worker threw exception »). Sur POST /api/auth,
// la réponse HTML faisait échouer res.json() → toast « Erreur réseau ».
//
// Ici, on fait passer TOUS les appels same-origin /api/* par une file
// d'attente plafonnée à MAX_CONCURRENT requêtes en vol. Les vues peuvent
// lancer autant de fetch qu'elles veulent : le plafond est respecté.
// Les assets, RSC et requêtes externes ne sont pas concernés.
// ═══════════════════════════════════════════════════════════════════════════

// Seuil prudent : mesures en production = 100 % fiable ≤ 12 simultanées,
// dégradations au-delà. À 6, on laisse de la marge pour un 2e onglet et le
// pulse de synchronisation pendant le burst du dashboard.
const MAX_CONCURRENT = 6;

let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  // Le slot est TRANSMIS par release() (active reste inchangé) : pas
  // d'incrément ici, sinon on dépasserait le plafond.
  return new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next(); // transmission du slot au suivant
  else active = Math.max(0, active - 1);
}

function isApiUrl(input: RequestInfo | URL): boolean {
  try {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    return url.startsWith('/api/') || url.startsWith(`${location.origin}/api/`);
  } catch {
    return false;
  }
}

let installed = false;

/**
 * Remplace window.fetch par une version plafonnée (6 appels /api/ en vol).
 * Idempotent ; no-op côté serveur. Importer ce module pour son effet de bord
 * depuis tout point d'entrée client.
 */
export function installApiLimiter(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isApiUrl(input)) return original(input, init);
    await acquire();
    try {
      return await original(input, init);
    } finally {
      release();
    }
  };
}

// Effet de bord : installation au chargement du module côté client.
installApiLimiter();
