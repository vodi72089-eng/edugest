/**
 * EduGest Desktop — preload (pont sécurisé renderer → main).
 *
 * Expose `window.__edugest.ready()` pour que l'interface prévienne le
 * processus principal quand elle est réellement peinte : la fenêtre
 * principale ne s'affiche qu'à ce moment-là (jamais de bandeau vide).
 * Sans effet sur le web (objet absent → appel ignoré).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__edugest', {
  ready: () => {
    try { ipcRenderer.send('ui-ready'); } catch {}
  },
});
