import { after } from 'next/server';

/**
 * Épingle une promesse de travail de fond au contexte de requête courant.
 *
 * ⚠️ OBLIGATOIRE pour tout travail NON attendu qui touche Prisma (ou un fetch
 * long) dans une requête HTTP, sous Cloudflare Workers :
 * workerd abandonne les continuations de promesses résolues APRÈS la fin de
 * la requête créatrice (drapeau `no_handle_cross_request_promise_resolution`,
 * wrangler.jsonc). Si la promesse concerne une requête Prisma, celle-ci ne
 * « conclut » jamais dans l'isolat et TOUTES les requêtes DB suivantes gèlent
 * (1101 « The Workers runtime canceled this request because it detected that
 * your Worker's code had hung » — constaté le 09/10/2026 : notify()→
 * sendPushToUser()→db.pushSubscription.findMany() non awaited empoisonnait
 * l'isolat après chaque création de ticket).
 *
 * `after()` (Next) est implémenté par vinext via `ctx.waitUntil` sur Workers
 * (dist/shims/unified-request-context.js) : le contexte de requête reste
 * donc vivant jusqu'à la résolution, la continuation s'exécute toujours.
 *
 * Hors scope de requête (EXE Node, scheduler in-process), `after()` jette :
 * on laisse alors la promesse courir — Node garde la boucle d'événements
 * vivante jusqu'à sa conclusion. Les erreurs sont avalées ici (le travail de
 * fond ne doit jamais faire échouer la requête métier).
 */
export function pinAfter<T>(promise: Promise<T>): Promise<T> {
  try {
    after(() => promise.catch(() => {}));
  } catch {
    promise.catch(() => {});
  }
  return promise;
}
