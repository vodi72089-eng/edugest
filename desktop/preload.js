/**
 * EduGest Desktop — preload (pont sécurisé renderer → main).
 *
 * Expose :
 * - `window.__edugest.ready()` : l'interface prévient quand elle est peinte
 *   (la fenêtre ne s'affiche qu'à ce moment-là, jamais de bandeau vide).
 * - `window.__edugest.updates` : bannière de mise à jour in-app —
 *   réception des événements (available/downloading/ready/portable/error)
 *   et actions (download/install/openPage). Sans effet sur le web.
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
});
