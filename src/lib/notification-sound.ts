/**
 * Son de notification style WhatsApp (petit « pop » à l'arrivée d'un message).
 *
 * Synthétisé en Web Audio API : aucun fichier audio externe, aucune licence,
 * fonctionne aussi dans l'app desktop (Electron/Chromium).
 *
 * Politique autoplay des navigateurs : le son ne peut partir qu'après un
 * premier geste utilisateur. `unlockNotificationAudio()` est appelé au clic
 * sur la cloche ; les polls suivants peuvent alors jouer le son.
 */

const STORAGE_KEY = 'edugest_notif_sound';

let ctx: AudioContext | null = null;

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

/** À appeler sur un geste utilisateur (clic) pour autoriser l'audio ensuite. */
export function unlockNotificationAudio(): void {
  const ac = getContext();
  if (ac && ac.state === 'suspended') {
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
 * Joue le « pop » WhatsApp-like : deux brefs blips sinusoïdaux
 * (montée rapide, décroissance exponentielle).
 */
export function playNotificationSound(): void {
  const ac = getContext();
  if (!ac) return;
  if (ac.state === 'suspended') {
    // Pas encore de geste utilisateur : on tente, sinon on abandonne silencieusement
    ac.resume().catch(() => {});
    if (ac.state === 'suspended') return;
  }

  const now = ac.currentTime;
  // Deux notes brèves façon « pop » de message entrant
  const notes = [
    { freq: 880, at: 0, dur: 0.09, gain: 0.25 },
    { freq: 1318.5, at: 0.09, dur: 0.14, gain: 0.22 },
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
}
