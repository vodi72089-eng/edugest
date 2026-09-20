/**
 * Son de notification style WhatsApp (petit « pop » à l'arrivée d'un message).
 *
 * Synthétisé en Web Audio API : aucun fichier audio externe, aucune licence,
 * fonctionne aussi dans l'app desktop (Electron/Chromium).
 *
 * Politique autoplay des navigateurs : le son ne peut partir qu'après un
 * premier geste utilisateur. `unlockNotificationAudio()` est appelé au premier
 * geste (clic/touche) n'importe où dans l'app ; les polls suivants peuvent
 * alors jouer le son.
 *
 * IMPORTANT (bug historique corrigé) : l'ancienne version testait
 * `ac.state === 'suspended'` de façon SYNCHRONE juste après `resume()` — or
 * resume() est asynchrone : l'état restait « suspended » pendant des dizaines
 * de millisecondes et la fonction sortait SANS JAMAIS JOUER. Désormais
 * `playNotificationSound()` est async et ATTEND la reprise du contexte
 * (avec tentatives), puis joue.
 */

const STORAGE_KEY = 'edugest_notif_sound';

let ctx: AudioContext | null = null;
// Compteur de gestes : permet de retenter un resume même si un appel précédent a échoué
let unlockedAtLeastOnce = false;

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
}

/** Préférence utilisateur (persistée). Activé par défaut. */
export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* stockage indisponible : on ignore */
  }
}

/**
 * S'assure que le contexte audio est bien « running » avant de jouer.
 * resume() est asynchrone : on l'ATTEND (au lieu de tester l'état de façon
 * synchrone comme l'ancienne version qui ne sonnait jamais).
 */
async function ensureRunning(ac: AudioContext): Promise<boolean> {
  if (ac.state === 'running') return true;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await ac.resume();
    } catch {
      /* rejeté : on retente */
    }
    if (ac.state === 'running') return true;
    // Petite pause avant la tentative suivante (le resume peut prendre un cycle)
    await new Promise(r => setTimeout(r, 60));
  }
  return ac.state === 'running';
}

/**
 * Joue le « pop » WhatsApp-like : deux brefs blips sinusoïdaux
 * (montée rapide, décroissance exponentielle).
 * Async : attend que l'AudioContext soit réellement repris avant de jouer.
 */
export async function playNotificationSound(): Promise<void> {
  const ac = getContext();
  if (!ac) return;

  // Sans aucun geste utilisateur préalable, la politique autoplay bloque le son :
  // on tente quand même (Chrome peut autoriser si le site a déjà été utilisé),
  // mais on ne bloque pas l'appelant.
  const running = await ensureRunning(ac);
  if (!running) return;

  try {
    const now = ac.currentTime;
    // Deux notes brèves façon « pop » de message entrant
    const notes = [
      { freq: 880, at: 0, dur: 0.09, gain: 0.28 },
      { freq: 1318.5, at: 0.09, dur: 0.16, gain: 0.24 },
    ];

    for (const n of notes) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.at);
      g.gain.setValueAtTime(0.0001, now + n.at);
      g.gain.exponentialRampToValueAtTime(n.gain, now + n.at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(now + n.at);
      osc.stop(now + n.at + n.dur + 0.05);
    }
  } catch {
    // Échec silencieux : ne jamais casser l'UI pour un son
  }
}

/** Le son a-t-il déjà été déverrouillé par un geste (diagnostic / UI). */
export function isNotificationAudioUnlocked(): boolean {
  return unlockedAtLeastOnce;
}
