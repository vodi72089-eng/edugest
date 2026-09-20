/**
 * NotificationSoundService — son de notification EduGest (Web + Electron).
 *
 * Deux couches de lecture :
 *   1. Fichier local embarqué /sounds/notification.wav (aucun service externe,
 *      aucun CDN) lu via un élément <audio> préchargé ;
 *   2. Fallback synthèse Web Audio API (« pop » WhatsApp-like) si le fichier
 *      est indisponible ou échoue — jamais de dépendance réseau.
 *
 * Préférences utilisateur PERSISTÉES (localStorage, clé namespacée par userId :
 * chaque compte du même navigateur a ses propres réglages) :
 *   - notificationSoundEnabled (on/off)
 *   - notificationSoundVolume  (0–100)
 *   - notificationSoundType    (DEFAULT | SOFT | ALERT)
 *
 * Politique autoplay : le son ne peut partir qu'après un premier geste
 * utilisateur. `unlockNotificationAudio()` est appelé au premier geste
 * (clic/touche) n'importe où dans l'app.
 *
 * IMPORTANT (bug historique corrigé) : `playNotificationSound()` est async et
 * ATTEND la reprise du contexte audio au lieu de tester `state` de façon
 * synchrone juste après resume() (l'ancienne version ne sonnait jamais).
 *
 * Anti-avalanche : le Topbar ne joue qu'UNE fois par cycle de polling et
 * uniquement pour de NOUVELLES notifications (suivi lastSeenNotificationIds).
 */

const ENABLE_KEY = 'edugest_notif_sound';
const VOLUME_KEY = 'edugest_notif_volume';
const TYPE_KEY = 'edugest_notif_soundtype';
/** Fichier local (généré au build, 0,4 s, ~35 Ko) — « ouï » bref et léger. */
const SOUND_FILE = '/sounds/notification.wav';

export type NotificationSoundType = 'DEFAULT' | 'SOFT' | 'ALERT';

let ctx: AudioContext | null = null;
let audioEl: HTMLAudioElement | null = null;
let audioElFailed = false;
// Compteur de gestes : permet de retenter un resume même si un appel précédent a échoué
let unlockedAtLeastOnce = false;
// Garde anti-avalanche : pas plus d'un son toutes les 2 s (poll + push simultanés)
let lastPlayedAt = 0;

function key(base: string, userId?: string | null): string {
  return userId ? `${base}:${userId}` : base;
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

/** À appeler sur un geste utilisateur (clic/touche) pour autoriser l'audio ensuite. */
export function unlockNotificationAudio(): void {
  unlockedAtLeastOnce = true;
  const ac = getContext();
  if (ac && ac.state !== 'running') {
    ac.resume().catch(() => {});
  }
  // Prépare aussi l'élément <audio> (certains navigateurs exigent un geste
  // pour la première lecture même via HTMLAudioElement).
  try {
    if (!audioEl && !audioElFailed && typeof Audio !== 'undefined') {
      audioEl = new Audio(SOUND_FILE);
      audioEl.preload = 'auto';
      audioEl.addEventListener('error', () => { audioElFailed = true; audioEl = null; });
    }
  } catch {
    audioElFailed = true;
  }
}

/** Le son a-t-il déjà été déverrouillé par un geste (diagnostic / UI). */
export function isNotificationAudioUnlocked(): boolean {
  return unlockedAtLeastOnce;
}

// ─── Préférences utilisateur (persistées, namespacées par compte) ────────────

/** Activé par défaut. */
export function isNotificationSoundEnabled(userId?: string | null): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(key(ENABLE_KEY, userId)) !== 'off';
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean, userId?: string | null): void {
  try {
    window.localStorage.setItem(key(ENABLE_KEY, userId), enabled ? 'on' : 'off');
  } catch { /* stockage indisponible : on ignore */ }
}

/** Volume 0–100 (défaut 60). Hors bornes → borné. */
export function getNotificationSoundVolume(userId?: string | null): number {
  if (typeof window === 'undefined') return 60;
  try {
    const raw = window.localStorage.getItem(key(VOLUME_KEY, userId));
    const v = raw === null ? 60 : parseInt(raw, 10);
    if (isNaN(v)) return 60;
    return Math.min(100, Math.max(0, v));
  } catch {
    return 60;
  }
}

export function setNotificationSoundVolume(volume: number, userId?: string | null): void {
  const v = Math.min(100, Math.max(0, Math.round(volume)));
  try {
    window.localStorage.setItem(key(VOLUME_KEY, userId), String(v));
  } catch { /* on ignore */ }
}

export function getNotificationSoundType(userId?: string | null): NotificationSoundType {
  if (typeof window === 'undefined') return 'DEFAULT';
  try {
    const raw = window.localStorage.getItem(key(TYPE_KEY, userId));
    return raw === 'SOFT' || raw === 'ALERT' ? raw : 'DEFAULT';
  } catch {
    return 'DEFAULT';
  }
}

export function setNotificationSoundType(type: NotificationSoundType, userId?: string | null): void {
  try {
    window.localStorage.setItem(key(TYPE_KEY, userId), type);
  } catch { /* on ignore */ }
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

/** S'assure que le contexte audio est bien « running » avant de jouer. */
async function ensureRunning(ac: AudioContext): Promise<boolean> {
  // Lecture FRAÎCHE à chaque appel : resume() fait évoluer l'état asynchrone-
  // ment. TypeScript ne peut pas le savoir et garde le narrowing de la toute
  // première comparaison (TS2367) — on passe donc par une closure qui renvoie
  // systématiquement l'union complète AudioContextState.
  const readState = (): AudioContextState => ac.state;
  if (readState() === 'running') return true;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await ac.resume();
    } catch { /* rejeté : on retente */ }
    if (readState() === 'running') return true;
    await new Promise(r => setTimeout(r, 60));
  }
  return readState() === 'running';
}

/**
 * Joue le son de notification.
 * @param options.enabled  préférence ON/OFF (l'appelant peut la vérifier lui-même ;
 *                         la fonction re-vérifie systématiquement via userId)
 * @param options.userId   compte utilisateur (préférences namespacées)
 * @param options.type     DEFAULT | SOFT | ALERT (priorité métier)
 * @param options.volume   override ponctuel du volume (0–100)
 */
export async function playNotificationSound(options?: {
  enabled?: boolean;
  userId?: string | null;
  type?: NotificationSoundType;
  volume?: number;
}): Promise<void> {
  // Garde-fous : préférence, contexte disponible, anti-avalanche 2 s.
  if (options?.enabled === false) return;
  if (!isNotificationSoundEnabled(options?.userId)) return;
  const ac = getContext();
  if (!ac) return;
  const now = Date.now();
  if (now - lastPlayedAt < 2000) return;
  lastPlayedAt = now;

  const volume = Math.min(100, Math.max(0, options?.volume ?? getNotificationSoundVolume(options?.userId))) / 100;
  const type: NotificationSoundType = options?.type
    ?? getNotificationSoundType(options?.userId);

  // Sans aucun geste utilisateur préalable, la politique autoplay bloque le
  // son : on tente quand même, mais on ne bloque jamais l'appelant.
  const running = await ensureRunning(ac);
  if (!running) return;

  try {
    // 1) Fichier local (préféré) — sauf si déjà connu en échec.
    if (!audioElFailed && typeof Audio !== 'undefined') {
      try {
        if (!audioEl) {
          audioEl = new Audio(SOUND_FILE);
          audioEl.preload = 'auto';
          audioEl.addEventListener('error', () => { audioElFailed = true; audioEl = null; });
        }
        audioEl.volume = volume;
        audioEl.currentTime = 0;
        await audioEl.play();
        return; // succès — pas besoin du fallback
      } catch {
        // autoplay/erreur : bascule sur la synthèse locale
      }
    }

    // 2) Fallback : synthèse Web Audio (« pop » WhatsApp-like), paramétrée
    //    par le type de son choisi.
    const profiles: Record<NotificationSoundType, Array<{ freq: number; at: number; dur: number; gain: number }>> = {
      // Standard : deux blips ascendants (message entrant)
      DEFAULT: [
        { freq: 880, at: 0, dur: 0.09, gain: 0.28 },
        { freq: 1318.5, at: 0.09, dur: 0.16, gain: 0.24 },
      ],
      // Doux : un seul blip feutré (annonces, communications)
      SOFT: [
        { freq: 660, at: 0, dur: 0.14, gain: 0.18 },
      ],
      // Alerte : trois blips rapides et percants (convocation, approbation, médical)
      ALERT: [
        { freq: 988, at: 0, dur: 0.08, gain: 0.32 },
        { freq: 988, at: 0.12, dur: 0.08, gain: 0.32 },
        { freq: 1318.5, at: 0.24, dur: 0.2, gain: 0.3 },
      ],
    };

    const start = ac.currentTime;
    for (const n of profiles[type]) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, start + n.at);
      g.gain.setValueAtTime(0.0001, start + n.at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, n.gain * volume), start + n.at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + n.at + n.dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(start + n.at);
      osc.stop(start + n.at + n.dur + 0.05);
    }
  } catch {
    // Échec silencieux : ne jamais casser l'UI pour un son
  }
}
