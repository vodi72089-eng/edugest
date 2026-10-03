/**
 * EduGest Desktop — preload (pont sécurisé renderer → main).
 *
 * Expose :
 * - `window.__edugest.ready()` : l'interface prévient quand elle est peinte
 *   (la fenêtre ne s'affiche qu'à ce moment-là, jamais de bandeau vide).
 * - `window.__edugest.updates` : bannière de mise à jour in-app —
 *   réception des événements (available/downloading/ready/portable/error)
 *   et actions (download/install/openPage). Sans effet sur le web.
 * - `window.__edugest.notifications` : notifications natives Windows —
 *   `show(payload)` affiche un toast système (titre/corps/icône), et
 *   `onNavigate(cb)` reçoit le clic sur le toast (URL + id) pour que
 *   l'interface ouvre la bonne page. Sans effet sur le web.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__edugest', {
  ready: () => {
    try { ipcRenderer.send('ui-ready'); } catch {}
  },
  updates: {
    onEvent: (cb) => {
      const listener = (_e, payload) => {
        try { cb(payload); } catch {}
      };
      ipcRenderer.on('edugest-update', listener);
      return () => ipcRenderer.removeListener('edugest-update', listener);
    },
    download: () => {
      try { ipcRenderer.send('update-download'); } catch {}
    },
    install: () => {
      try { ipcRenderer.send('update-install'); } catch {}
    },
    openPage: (url) => {
      try { ipcRenderer.send('update-open-page', url); } catch {}
    },
  },
  notifications: {
    /** Demande l'affichage d'une notification native (résultat : true/false). */
    show: (payload) => new Promise((resolve) => {
      try {
        ipcRenderer.once('edugest:notify:result', (_e, ok) => resolve(!!ok));
        ipcRenderer.send('edugest:notify', payload || {});
        // Filet : si le main ne répond pas (ancien exe), ne pas suspendre l'UI.
        setTimeout(() => resolve(false), 1500);
      } catch { resolve(false); }
    }),
    /** Clic sur le toast système → navigation vers la page de la notification. */
    onNavigate: (cb) => {
      const listener = (_e, payload) => {
        try { cb(payload); } catch {}
      };
      ipcRenderer.on('edugest:navigate', listener);
      return () => ipcRenderer.removeListener('edugest:navigate', listener);
    },
  },
  /** Informations système de l'ordinateur (marque, modèle, OS, IP…). */
  systemInfo: () => {
    try {
      return ipcRenderer.invoke('edugest:system-info').catch(() => ({}));
    } catch { return Promise.resolve({}); }
  },
  /**
   * Deep link « edugest:// » reçu du site web (ex. edugest://import-db) :
   * - `consume()` : route en attente au démarrage (app lancée PAR le lien).
   * - `onRoute(cb)` : route poussée par une deuxième instance (app déjà ouverte).
   * Sans effet sur le web (pas de bridge → l'interface n'écoute pas).
   */
  deepLink: {
    consume: () => {
      try {
        return ipcRenderer.invoke('edugest:deep-link:consume').catch(() => null);
      } catch { return Promise.resolve(null); }
    },
    onRoute: (cb) => {
      const listener = (_e, route) => { try { cb(route); } catch {} };
      ipcRenderer.on('edugest:deep-link', listener);
      return () => ipcRenderer.removeListener('edugest:deep-link', listener);
    },
  },
});
