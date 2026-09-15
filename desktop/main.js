/**
 * EduGest Desktop — Application de bureau (Windows / macOS / Linux)
 *
 * Architecture :
 *  1. Au premier lancement, la base de données SQLite locale est copiée dans
 *     le dossier de données de l'utilisateur (%APPDATA%/EduGest/edugest.db).
 *  2. Le serveur Next.js standalone (généré par `npm run build`) est démarré
 *     en processus fils sur un port local libre.
 *  3. Un SPLASH (vrai logo officiel EduGest) s'affiche INSTANTANÉMENT et
 *     affiche l'étape en cours (base de données → serveur → interface) —
 *     l'utilisateur voit l'app se lancer tout de suite, puis la fenêtre
 *     principale remplace le splash (démarrage perçu rapide).
 *  4. AUCUNE barre de menu système (EduGest / Affichage / Édition supprimés).
 *
 * Performances : sondage serveur à 250 ms, throttling d'arrière-plan désactivé,
 * splash sans frame pour un affichage immédiat même sur machine modeste.
 *
 * Build : voir DESKTOP.md (electron-builder → installateur .exe + portable).
 */

const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');

/** Mise à jour auto (NSIS installé). Chargé uniquement en mode packagé. */
let autoUpdater = null;
try {
  if (app.isPackaged) {
    ({ autoUpdater } = require('electron-updater'));
  }
} catch (e) {
  console.warn('[edugest-desktop] electron-updater indisponible :', e.message);
}

/** Version portable ? (l'auto-update silencieuse ne marche que sur la version installée NSIS) */
function isPortable() {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
}

// Réactivité maximale de l'UI (utile sur petites machines / HDD)
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// ─── Chemins ─────────────────────────────────────────────────────────────────

const isPackaged = app.isPackaged;

/** Dossier contenant le serveur Next standalone */
const APP_DIR = isPackaged
  ? path.join(process.resourcesPath, 'app')
  : path.join(__dirname, '..', '.next', 'standalone');

const SERVER_JS = path.join(APP_DIR, 'server.js');

/** Vrai logo officiel EduGest (complet « EDUC GEST », fond transparent) */
const SPLASH_LOGO = path.join(__dirname, 'splash-logo.png');
/** Symbole seul (icône fenêtre/exe) */
const ICON_PATH = path.join(__dirname, 'icon.png');

/** Base de données locale (créée au premier lancement) */
const USER_DATA = app.getPath('userData');
const DB_DIR = isPackaged ? USER_DATA : path.join(__dirname, '..', 'db');
const DB_PATH = isPackaged
  ? path.join(USER_DATA, 'edugest.db')
  : path.join(__dirname, '..', 'db', 'custom.db');

/** Base embarquée avec l'application (schéma Prisma complet) */
const TEMPLATE_DB = isPackaged
  ? path.join(process.resourcesPath, 'template.db')
  : path.join(__dirname, '..', 'db', 'desktop-template.db');

const APP_VERSION = (() => {
  try { return require('./package.json').version; } catch { return ''; }
})();

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function log(...args) {
  const line = `[edugest-desktop] ${new Date().toISOString()} ${args.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(path.join(DB_DIR, 'desktop.log'), line + '\n'); } catch {}
}

/** Trouve un port TCP libre à partir de `start` */
function findFreePort(start) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const srv = net.createServer();
      srv.once('error', () => tryPort(port + 1));
      srv.once('listening', () => srv.close(() => resolve(port)));
      srv.listen(port, '127.0.0.1');
    };
    tryPort(start);
  });
}

/** Attend que le serveur Next réponde (sondage rapide : 250 ms) */
function waitForServer(url, timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve(true);
        retry();
      });
      req.on('error', retry);
      req.setTimeout(1500, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error('Le serveur local n\'a pas démarré à temps'));
      setTimeout(ping, 250);
    };
    ping();
  });
}

// ─── Fenêtres ────────────────────────────────────────────────────────────────

let serverProcess = null;
let mainWindow = null;
let splashWindow = null;
let currentPort = 0;

/** Met à jour le texte d'étape affiché sur le splash */
function setSplashStage(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const js = `window.__setStage && window.__setStage(${JSON.stringify(text)});`;
  splashWindow.webContents.executeJavaScript(js).catch(() => {});
}

/** Splash : vrai logo officiel EduGest, affiché instantanément au démarrage */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 440,
    height: 360,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#0a0f0d',
    center: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  const logoUri = (() => {
    try { return 'file://' + SPLASH_LOGO.replace(/\\/g, '/'); } catch { return ''; }
  })();
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;height:100%;background:#0a0f0d;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden;user-select:none}
  .halo{position:absolute;top:-120px;right:-120px;width:380px;height:380px;border-radius:50%;background:radial-gradient(circle,rgba(245,166,35,.14),transparent 65%);pointer-events:none}
  .halo2{position:absolute;bottom:-140px;left:-110px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(20,154,128,.12),transparent 65%);pointer-events:none}
  .plate{position:relative;background:#fdfbf7;border-radius:30px;padding:20px 34px;border:1px solid rgba(255,255,255,.65);box-shadow:0 18px 60px rgba(0,0,0,.55);animation:float 2.6s ease-in-out infinite}
  .plate img{width:220px;height:auto;display:block}
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
  .ring{position:relative;width:16px;height:16px;margin:22px auto 0;border-radius:50%;border:2.5px solid rgba(255,255,255,.14);border-top-color:#f5a623;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  #stage{color:rgba(255,255,255,.72);font-size:13px;font-weight:600;margin:12px 0 0;text-align:center;min-height:18px;transition:opacity .2s}
  .bar{width:190px;height:4px;background:rgba(255,255,255,.09);border-radius:2px;margin:10px auto 0;overflow:hidden}
  .bar span{display:block;height:100%;width:40%;background:linear-gradient(90deg,#149a80,#f5a623);border-radius:2px;animation:slide 1.1s ease-in-out infinite}
  @keyframes slide{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}
  .ver{position:absolute;bottom:12px;left:0;right:0;text-align:center;color:rgba(255,255,255,.28);font-size:10.5px;letter-spacing:.4px}
</style></head><body>
  <div class="halo"></div><div class="halo2"></div>
  <div class="plate"><img src="${logoUri}" alt="EduGest" draggable="false"></div>
  <div class="ring"></div>
  <p id="stage">Préparation de votre espace…</p>
  <div class="bar"><span></span></div>
  <div class="ver">EduGest Desktop ${APP_VERSION ? 'v' + APP_VERSION : ''} — édition bureau</div>
  <script>
    window.__setStage = function(t){
      var el = document.getElementById('stage');
      if(!el) return;
      el.style.opacity = 0;
      setTimeout(function(){ el.textContent = t; el.style.opacity = 1; }, 120);
    };
  </script>
</body></html>`));
  splashWindow.on('closed', () => { splashWindow = null; });
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function createWindow(port) {
  setSplashStage('Ouverture de l\u2019interface…');
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'EduGest',
    icon: ICON_PATH,
    backgroundColor: '#0a0f0d',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  // Barre de menu système SUPPRIMÉE (EduGest / Affichage / Édition)
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
    mainWindow.focus();
    setupAutoUpdate();
  });
  // Sécurité : si l'UI plante au chargement, ne pas laisser un écran noir
  mainWindow.webContents.on('did-fail-load', () => {
    closeSplash();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Mises à jour automatiques (style opencode) ──────────────────────────────
//
// Version INSTALLÉE (NSIS) : electron-updater télécharge la MAJ en arrière-plan
// et propose de redémarrer. Les données (%APPDATA%/EduGest/edugest.db) ne sont
// JAMAIS touchées : l'installeur ne remplace que le code dans Program Files.
//
// Version PORTABLE : pas de MAJ silencieuse possible → on prévient l'utilisateur
// et on ouvre la page de la release GitHub pour télécharger le nouvel exe.

const UPDATE_CHECK_DELAY_MS = 8000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function checkPortableUpdate(manual = false) {
  const req = https.get({
    hostname: 'api.github.com',
    path: '/repos/vodi72089-eng/edugest/releases/latest',
    headers: { 'User-Agent': 'EduGest-Desktop', Accept: 'application/vnd.github+json' },
  }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => {
      try {
        const rel = JSON.parse(body);
        const latest = String(rel.tag_name || '').replace(/^v/, '');
        if (!latest) return;
        if (compareVersions(latest, app.getVersion()) <= 0) {
          if (manual) dialog.showMessageBox(mainWindow, { type: 'info', title: 'EduGest', message: `Vous êtes à jour (v${app.getVersion()}).` });
          return;
        }
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Mise à jour EduGest',
          message: `Une nouvelle version est disponible (v${latest}).`,
          detail: 'Vos données sont conservées. Télécharger la nouvelle version portable ?',
          buttons: ['Télécharger', 'Plus tard'],
          defaultId: 0,
          cancelId: 1,
        }).then(({ response }) => {
          if (response === 0 && rel.html_url) shell.openExternal(rel.html_url);
        });
      } catch {}
    });
  });
  req.on('error', () => {});
  req.setTimeout(10000, () => req.destroy());
}

function setupAutoUpdate() {
  if (!app.isPackaged || !mainWindow || mainWindow.isDestroyed()) return;

  // — Version portable : simple notification + lien GitHub —
  if (isPortable() || !autoUpdater) {
    if (isPortable()) setTimeout(() => checkPortableUpdate(false), UPDATE_CHECK_DELAY_MS);
    return;
  }

  // — Version installée : MAJ auto façon opencode —
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    log('Mise à jour disponible :', info.version);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Mise à jour EduGest',
      message: `Une nouvelle version est disponible (v${info.version}).`,
      detail: 'Vos données (élèves, notes, paiements) sont conservées. Voulez-vous la télécharger maintenant ?',
      buttons: ['Télécharger', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        log('Téléchargement de la mise à jour…');
        autoUpdater.downloadUpdate().catch((e) => log('Échec téléchargement MAJ :', e.message));
      }
    });
  });

  autoUpdater.on('download-progress', (p) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(p.percent / 100);
        mainWindow.setTitle(`EduGest — mise à jour ${Math.round(p.percent)} %`);
      }
    } catch {}
  });

  autoUpdater.on('update-downloaded', (info) => {
    log('Mise à jour téléchargée :', info.version);
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(-1);
        mainWindow.setTitle('EduGest');
      }
    } catch {}
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Mise à jour prête',
      message: 'La mise à jour est téléchargée.',
      detail: 'Redémarrer EduGest maintenant pour l\u2019installer ? Vos données sont conservées.',
      buttons: ['Redémarrer et installer', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        try { if (serverProcess) serverProcess.kill(); } catch {}
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on('update-not-available', () => log('EduGest est à jour.'));
  autoUpdater.on('error', (e) => log('Erreur vérification MAJ (ignorée) :', e.message));

  const doCheck = () => {
    autoUpdater.checkForUpdates().catch((e) => log('Check MAJ impossible :', e.message));
  };
  setTimeout(doCheck, UPDATE_CHECK_DELAY_MS);
  setInterval(doCheck, UPDATE_CHECK_INTERVAL_MS);
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

async function startBackend() {
  // 1) Base de données locale : copie du template au premier lancement
  setSplashStage('Préparation de la base de données…');
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
      if (fs.existsSync(TEMPLATE_DB)) {
        fs.copyFileSync(TEMPLATE_DB, DB_PATH);
        log('Base de données locale créée depuis le template :', DB_PATH);
      } else {
        log('ATTENTION : template.db absent — la base sera créée par Prisma');
      }
    }
  } catch (e) {
    log('Erreur préparation base de données :', e.message);
  }

  // 2) Port local libre
  const port = await findFreePort(3927);
  currentPort = port;
  log('Démarrage du serveur EduGest sur le port', port);

  // 3) Serveur Next.js standalone en processus fils (Node embarqué d'Electron)
  setSplashStage('Démarrage du serveur local…');
  serverProcess = spawn(process.execPath, [SERVER_JS], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      // Base de données SQLite connectée à l'app desktop
      DATABASE_URL: `file:${DB_PATH}`,
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => log('[serveur]', String(d).trim()));
  serverProcess.stderr.on('data', (d) => log('[serveur:err]', String(d).trim()));
  serverProcess.on('exit', (code) => log('Serveur arrêté (code', code, ')'));

  // 4) Attendre que le serveur soit prêt (le splash est déjà affiché)
  await waitForServer(`http://127.0.0.1:${port}/`);
  return port;
}

app.whenReady().then(async () => {
  // Splash instantané (vrai logo officiel) — AVANT tout le reste
  createSplash();

  try {
    const port = await startBackend();
    createWindow(port);
  } catch (e) {
    log('ERREUR FATALE :', e.message);
    closeSplash();
    dialog.showErrorBox('EduGest', 'Impossible de démarrer le serveur local EduGest.\n\n' + e.message);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverProcess && currentPort) {
      createWindow(currentPort);
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    try { serverProcess.kill(); } catch {}
    serverProcess = null;
  }
});
