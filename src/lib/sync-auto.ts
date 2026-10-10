// Synchronisation automatique exe  Neon (client).
//
// L'admin active UNE FOIS (email + mot de passe plateforme) : le serveur
// Neon renvoie un jeton lié à l'école, stocké localement (mot de passe
// jamais stocké). Ensuite l'exe envoie tout seul dès qu'internet revient :
//   - une sonde locale (toutes les 90 s) interroge /api/sync/status qui
//     compte les modifications en attente DANS SQLite - si total > 0 et que
//     le réseau répond, un envoi est lancé ;
//   - l'événement `online` déclenche un envoi immédiat ;
//   - l'envoi manuel reste possible depuis les Réglages.
//
// ?? Mode delta : l'envoi ne transmet que les lignes modifiées depuis la
// dernière synchro réussie (lastSuccessfulSyncAt) ; côté Neon le push applique
// le « dernière écriture gagne » - les modifications (et pas seulement les
// créations) remontent. Les tables sans colonne de version locale (années,
// matières, comptes) sont renvoyées en entier quand des ajouts sont détectés
// (baseline de compteurs stockée à chaque envoi réussi).
//
// Les erreurs réseau (hors-ligne) sont silencieuses : la boucle réessaie.
// Chaque résultat (succès ou échec) est journalisé (historique, 20 derniers).

import { authFetch, getActiveSchoolId, isDesktopApp } from '@/lib/store';

export const SYNC_CONFIG_KEY = 'edugest_sync_auto';
export const SYNC_LAST_KEY = 'edugest_sync_last';
export const SYNC_HISTORY_KEY = 'edugest_sync_history';
export const SYNC_PROBE_MS = 90 * 1000; // sonde de détection des modifications
export const DEFAULT_PLATFORM_URL = 'https://edugest.eluymas82.workers.dev';
export const SYNC_HISTORY_MAX = 20;

export interface SyncAutoConfig {
  issuerUrl: string;
  token: string;
  neonSchoolId: string;
  neonSchoolName: string;
  localSchoolId: string;
  expiresAt: string;
  createdAt: string;
  /** ISO de la dernière synchro RÉUSSIE (point de départ des deltas). */
  lastSuccessfulSyncAt?: string;
  /** Compteurs des tables sans version relevés au dernier envoi complet. */
  fullBaseline?: { schoolYears: number; subjects: number; users: number } | null;
}

export interface SyncLastResult {
  at: string;
  ok: boolean;
  appliedTotal: number;
  message: string;
}

export interface SyncStatusPending {
  classes: number;
  students: number;
  grades: number;
  schoolFees: number;
  paymentRecords: number;
  fullAdded: { schoolYears: number; subjects: number; users: number };
}

export interface SyncStatusResult {
  pending: SyncStatusPending;
  pendingTotal: number;
  lastWriteAt: string | null;
  since: string | null;
  samples: { type: string; label: string; at: string }[];
}

export function readSyncConfig(): SyncAutoConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<SyncAutoConfig>;
    if (!c || typeof c.token !== 'string' || !c.token) return null;
    if (!c.issuerUrl || !c.localSchoolId || !c.neonSchoolId) return null;
    return c as SyncAutoConfig;
  } catch {
    return null;
  }
}

export function saveSyncConfig(c: SyncAutoConfig): void {
  try {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(c));
  } catch { /* stockage indisponible */
  }
}

export function clearSyncConfig(): void {
  try {
    localStorage.removeItem(SYNC_CONFIG_KEY);
  } catch { /* ignore */
  }
}

export function readSyncLast(): SyncLastResult | null {
  try {
    const raw = localStorage.getItem(SYNC_LAST_KEY);
    return raw ? (JSON.parse(raw) as SyncLastResult) : null;
  } catch {
    return null;
  }
}

function saveSyncLast(r: SyncLastResult): void {
  try {
    localStorage.setItem(SYNC_LAST_KEY, JSON.stringify(r));
  } catch { /* ignore */
  }
}

export function readSyncHistory(): SyncLastResult[] {
  try {
    const raw = localStorage.getItem(SYNC_HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as SyncLastResult[]).slice(0, SYNC_HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function pushHistory(r: SyncLastResult): void {
  try {
    const hist = [r, ...readSyncHistory()].slice(0, SYNC_HISTORY_MAX);
    localStorage.setItem(SYNC_HISTORY_KEY, JSON.stringify(hist));
  } catch { /* ignore */
  }
}

function countApplied(applied: Record<string, number> | undefined): number {
  if (!applied) return 0;
  return Object.values(applied).reduce((s, n) => s + (typeof n === 'number' ? n : 0), 0);
}

/**
 * Interroge le serveur LOCAL (SQLite) : combien de modifications sont en
 * attente d'envoi ? Aucun contact avec la plateforme (fonctionne hors-ligne).
 */
export async function fetchSyncStatus(): Promise<SyncStatusResult | null> {
  const cfg = readSyncConfig();
  if (!cfg) return null;
  try {
    const res = await authFetch('/api/sync/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        since: cfg.lastSuccessfulSyncAt || null,
        fullBaseline: cfg.fullBaseline || null,
        localSchoolId: cfg.localSchoolId,
      }),
    });
    if (!res.ok) return null;
    const j = await res.json().catch(() => ({}));
    return (j?.data as SyncStatusResult) || null;
  } catch {
    return null;
  }
}

/**
 * Active la synchronisation : échange email+mot de passe (UNE FOIS) contre
 * un jeton lié à l'école. Le mot de passe n'est ni affiché ni stocké.
 */
export async function activateAutoSync(
  issuerUrl: string,
  email: string,
  password: string,
): Promise<SyncAutoConfig> {
  const issuer = issuerUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(issuer)) throw new Error('Adresse de la plateforme invalide');
  if (!email.trim() || !password) throw new Error('Email et mot de passe requis');
  const localSchoolId = getActiveSchoolId();
  if (!localSchoolId) throw new Error("École locale introuvable - connectez-vous d'abord");
  const res = await fetch(`${issuer}/api/sync/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.data?.token || !j?.data?.schoolId) {
    throw new Error(j?.error || `Activation refusée (${res.status})`);
  }
  const cfg: SyncAutoConfig = {
    issuerUrl: issuer,
    token: j.data.token as string,
    neonSchoolId: j.data.schoolId as string,
    neonSchoolName: String(j.data.schoolName || ''),
    localSchoolId,
    expiresAt: String(j.data.expiresAt || ''),
    createdAt: new Date().toISOString(),
    // 1re synchro : aucun delta ni baseline → tout part (insert + LWW).
    lastSuccessfulSyncAt: undefined,
    fullBaseline: null,
  };
  saveSyncConfig(cfg);
  return cfg;
}

export interface RunSyncOutcome {
  ok: boolean;
  appliedTotal: number;
  message: string;
}

/**
 * Exécute UN envoi avec le jeton stocké (serveur local  Neon).
 * Silencieux par nature : le résultat est persisté (lu par l'UI) et les
 * erreurs réseau (hors-ligne) remontent comme échec sans toast.
 */
export async function runAutoSync(): Promise<RunSyncOutcome> {
  const cfg = readSyncConfig();
  if (!cfg) {
    return { ok: false, appliedTotal: 0, message: 'Synchronisation non activée' };
  }
  // Horodatage AVANT l'envoi : les lignes modifiées pendant l'envoi seront
  // reprises au prochain delta (jamais sautées).
  const startedAt = new Date().toISOString();
  try {
    const status = await fetchSyncStatus();
    const res = await authFetch('/api/sync/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issuerUrl: cfg.issuerUrl,
        syncToken: cfg.token,
        localSchoolId: cfg.localSchoolId,
        since: cfg.lastSuccessfulSyncAt || null,
        // Tables sans version : renvoyées en entier à la 1re synchro, ou
        // dès que la sonde détecte des ajouts (baseline dépassée).
        fullTables: !cfg.lastSuccessfulSyncAt || !cfg.fullBaseline ||
          (status ? status.pending.fullAdded.schoolYears + status.pending.fullAdded.subjects + status.pending.fullAdded.users > 0 : false),
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.data) {
      const message = j?.error || `Envoi refusé (${res.status})`;
      // Jeton expiré/invalide → l'utilisateur devra réactiver (mot de passe).
      if (res.status === 401) clearSyncConfig();
      const out = { ok: false, appliedTotal: 0, message };
      saveSyncLast({ at: new Date().toISOString(), ...out });
      pushHistory({ at: new Date().toISOString(), ...out });
      return out;
    }
    if (j.data.nothingPending) {
      // Rien à envoyer : on ne touche ni à la baseline ni au point de départ.
      const out = { ok: true, appliedTotal: 0, message: 'À jour - rien à envoyer' };
      saveSyncLast({ at: new Date().toISOString(), ...out });
      // Pas d'entrée d'historique pour un tour vide (évite le bruit 90 s).
      return out;
    }
    const appliedTotal = countApplied(j.data.applied) + countApplied(j.data.updated);
    const out = {
      ok: true,
      appliedTotal,
      message: appliedTotal > 0
        ? `${appliedTotal} ligne(s) synchronisée(s)`
        : 'Rien de nouveau à envoyer',
    };
    // Succès : point de départ du prochain delta + baseline des tables
    // sans version (compteurs relevés à l'instant de l'envoi).
    const nextCfg: SyncAutoConfig = {
      ...cfg,
      lastSuccessfulSyncAt: startedAt,
      fullBaseline: j.data.fullCounts && typeof j.data.fullCounts === 'object'
        ? {
            schoolYears: Number(j.data.fullCounts.schoolYears) || 0,
            subjects: Number(j.data.fullCounts.subjects) || 0,
            users: Number(j.data.fullCounts.users) || 0,
          }
        : cfg.fullBaseline ?? null,
    };
    saveSyncConfig(nextCfg);
    saveSyncLast({ at: new Date().toISOString(), ...out });
    pushHistory({ at: new Date().toISOString(), ...out });
    return out;
  } catch {
    const out = { ok: false, appliedTotal: 0, message: 'Plateforme injoignable (hors ligne ?)' };
    saveSyncLast({ at: new Date().toISOString(), ...out });
    pushHistory({ at: new Date().toISOString(), ...out });
    return out;
  }
}

// ?? Boucle automatique (à monter UNE fois, ex. DashboardLayout) ?????????
let autoSyncStarted = false;

/**
 * Démarre la boucle hors-ligne → en ligne :
 *   - sonde LOCALE toutes les 90 s (combien de modifications en attente ?) ;
 *     si total > 0, un envoi est lancé (silencieux si injoignable, on
 *     réessaiera au prochain tour) ;
 *   - envoi immédiat à chaque retour réseau (`online`) ;
 *   - délai de démarrage de 30 s (laisse l'app se stabiliser).
 * Idempotent.
 */
export function startAutoSyncLoop(): () => void {
  if (autoSyncStarted || typeof window === 'undefined') return () => {};
  if (!isDesktopApp()) return () => {};
  autoSyncStarted = true;
  let running = false;
  const tick = async (force: boolean) => {
    if (running || document.hidden) return;
    if (!readSyncConfig()) return; // pas activé : rien à faire
    running = true;
    try {
      if (!force) {
        // Sonde : n'envoie que s'il y a réellement des modifications en attente.
        const status = await fetchSyncStatus();
        if (!status || status.pendingTotal <= 0) return;
      }
      await runAutoSync();
    } catch {
      /* silencieux : on réessaie au prochain tour */
    } finally {
      running = false;
    }
  };
  const boot = window.setTimeout(() => { void tick(false); }, 30000);
  const timer = window.setInterval(() => { void tick(false); }, SYNC_PROBE_MS);
  const onOnline = () => { void tick(true); };
  window.addEventListener('online', onOnline);
  return () => {
    window.clearTimeout(boot);
    window.clearInterval(timer);
    window.removeEventListener('online', onOnline);
    autoSyncStarted = false;
  };
}
