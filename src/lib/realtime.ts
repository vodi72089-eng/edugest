'use client';

import { authFetch, getAuthToken } from '@/lib/store';

// ═══════════════════════════════════════════════════════════════════════════
// SYNCHRONISATION TEMPS RÉEL — le client interroge /api/sync/pulse toutes les
// 5 secondes (uniquement quand l'onglet est visible et l'utilisateur connecté).
// Dès que la base de données change (paiement, élève, note, communication…),
// l'événement `edugest:db-changed` est diffusé et les vues qui y sont
// abonnées (via onDbChange) rechargent leurs données automatiquement.
// ═══════════════════════════════════════════════════════════════════════════

export const DB_CHANGE_EVENT = 'edugest:db-changed';

const POLL_MS = 5000;

let timer: ReturnType<typeof setInterval> | null = null;
let lastSignature: string | null = null;
let inFlight = false;

async function tick() {
  if (inFlight) return;
  if (typeof window === 'undefined' || document.hidden) return;
  if (!getAuthToken()) return; // pas de requête si déconnecté
  inFlight = true;
  try {
    const res = await authFetch('/api/sync/pulse');
    if (!res.ok) return;
    const json = await res.json();
    const sig: string | undefined = json?.data?.signature;
    if (!sig) return;
    if (lastSignature !== null && sig !== lastSignature) {
      window.dispatchEvent(new CustomEvent(DB_CHANGE_EVENT, { detail: json.data }));
    }
    lastSignature = sig;
  } catch {
    /* silencieux : nouvelle tentative au prochain cycle */
  } finally {
    inFlight = false;
  }
}

// À démarrer une seule fois après la connexion (Home → useEffect userRole).
export function startRealtimeSync() {
  if (typeof window === 'undefined') return;
  if (timer) return;
  tick(); // baseline initiale, sans déclenchement d'événement
  timer = setInterval(tick, POLL_MS);
}

// Abonnement aux changements de la base — renvoie la fonction de désabonnement.
export function onDbChange(handler: (detail?: unknown) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = (e: Event) => handler((e as CustomEvent).detail);
  window.addEventListener(DB_CHANGE_EVENT, h);
  return () => window.removeEventListener(DB_CHANGE_EVENT, h);
}
