// Synchronisation automatique exe → Neon (client).
//
// L'admin active UNE FOIS (email + mot de passe plateforme) : le serveur
// Neon renvoie un jeton lié à l'école, stocké localement (mot de passe
// jamais stocké). Ensuite l'exe envoie tout seul dès qu'internet revient :
// boucle périodique + événement `online` + envoi manuel de secours.
//
// Le push reste insert-only côté Neon (jamais d'écrasement) et chaque lot
// est limité par le rate-limit serveur. Sans jeton configuré : rien ne part.

import { authFetch, getActiveSchoolId, isDesktopApp } from '@/lib/store';

export const SYNC_CONFIG_KEY = 'edugest_sync_auto';
export const SYNC_LAST_KEY = 'edugest_sync_last';
export const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const DEFAULT_PLATFORM_URL = 'https://edugest.app';

export interface SyncAutoConfig {
  issuerUrl: string;
  token: string;
  neonSchoolId: string;
  neonSchoolName: string;
  localSchoolId: string;
  expiresAt: string;
  createdAt: string;
}

export interface SyncLastResult {
  at: string;
  ok: boolean;
  appliedTotal: number;
  message: string;
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

function countApplied(applied: Record<string, number> | undefined): number {
  if (!applied) return 0;
  return Object.values(applied).reduce((s, n) => s + (typeof n === 'number' ? n : 0), 0);
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
  if (!localSchoolId) throw new Error('École locale introuvable — connectez-vous d’abord');
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
 * Exécute UN envoi avec le jeton stocké (serveur local → Neon).
 * Silencieux par nature : le résultat est persisté (lu par l'UI) et les
 * erreurs réseau (hors-ligne) remontent comme échec sans toast.
 */
export async function runAutoSync(): Promise<RunSyncOutcome> {
  const cfg = readSyncConfig();
  if (!cfg) {
    return { ok: false, appliedTotal: 0, message: 'Synchronisation non activée' };
  }
  try {
    const res = await authFetch('/api/sync/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issuerUrl: cfg.issuerUrl,
        syncToken: cfg.token,
        localSchoolId: cfg.localSchoolId,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.data) {
      const message = j?.error || `Envoi refusé (${res.status})`;
      // Jeton expiré/invalide → l'utilisateur devra réactiver (mot de passe).
      if (res.status === 401) clearSyncConfig();
      const out = { ok: false, appliedTotal: 0, message };
      saveSyncLast({ at: new Date().toISOString(), ...out });
      return out;
    }
    const appliedTotal = countApplied(j.data.applied);
    const out = {
      ok: true,
      appliedTotal,
      message: appliedTotal > 0 ? `${appliedTotal} ligne(s) envoyée(s)` : 'Rien de nouveau à envoyer',
    };
    saveSyncLast({ at: new Date().toISOString(), ...out });
    return out;
  } catch {
    const out = { ok: false, appliedTotal: 0, message: 'Plateforme injoignable (hors ligne ?)' };
    saveSyncLast({ at: new Date().toISOString(), ...out });
    return out;
  }
}

// ── Boucle automatique (à monter UNE fois, ex. DashboardLayout) ────────────
let autoSyncStarted = false;

/** Démarre la boucle : envoi au montage (décalé), toutes les 10 min, et à chaque retour réseau. Idempotent. */
export function startAutoSyncLoop(): () => void {
  if (autoSyncStarted || typeof window === 'undefined') return () => {};
  if (!isDesktopApp()) return () => {};
  autoSyncStarted = true;
  let running = false;
  let fails = 0;
  const tick = async () => {
    if (running || document.hidden) return;
    if (!readSyncConfig()) return; // pas activé : rien à faire
    running = true;
    try {
      const out = await runAutoSync();
      fails = out.ok ? 0 : fails + 1;
    } catch {
      fails += 1;
    } finally {
      running = false;
    }
  };
  const boot = window.setTimeout(tick, 30000); // laisse l'app se stabiliser
  const timer = window.setInterval(tick, SYNC_INTERVAL_MS);
  const onOnline = () => { tick(); };
  window.addEventListener('online', onOnline);
  return () => {
    window.clearTimeout(boot);
    window.clearInterval(timer);
    window.removeEventListener('online', onOnline);
    autoSyncStarted = false;
  };
}
