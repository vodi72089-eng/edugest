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

const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
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
let waProcess = null;
let mainWindow = null;
let splashWindow = null;
let currentPort = 0;

/** Met à jour le texte d'étape affiché sur le splash */
function setSplashStage(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const js = `window.__setStage && window.__setStage(${JSON.stringify(text)});`;
  splashWindow.webContents.executeJavaScript(js).catch(() => {});
}

/** Splash minimaliste (style grands éditeurs) : logo officiel intégré en base64
 *  (les file:// sont bloqués depuis une page data:), plaque claire, nom,
 *  fine barre de progression + étape en cours, version en bas. */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#0b0f0e',
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
    try {
      const buf = fs.readFileSync(SPLASH_LOGO);
      return 'data:image/png;base64,' + buf.toString('base64');
    } catch { return ''; }
  })();
  const logoHtml = logoUri
    ? `<div class="plate"><img src="${logoUri}" alt="EduGest" draggable="false"></div>`
    : `<div class="plate fallback">EduGest</div>`;
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%;background:#0b0f0e;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden;user-select:none}
  .plate{background:#fff;border-radius:18px;padding:14px 26px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
  .plate img{width:150px;height:auto;display:block}
  .plate.fallback{color:#0b0f0e;font-weight:800;font-size:22px}
  h1{color:#fff;font-size:17px;font-weight:700;margin:16px 0 2px;letter-spacing:.2px}
  .sub{color:rgba(255,255,255,.42);font-size:11.5px;font-weight:500;margin:0 0 18px}
  .bar{width:160px;height:3px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden}
  .bar span{display:block;height:100%;width:40%;background:#f5a623;border-radius:2px;animation:slide 1.1s ease-in-out infinite}
  @keyframes slide{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}
  #stage{color:rgba(255,255,255,.6);font-size:12px;font-weight:500;margin:10px 0 0;text-align:center;min-height:16px;transition:opacity .2s}
  .ver{position:absolute;bottom:10px;left:0;right:0;text-align:center;color:rgba(255,255,255,.25);font-size:10px;letter-spacing:.3px}
</style></head><body>
  ${logoHtml}
  <h1>EduGest</h1>
  <p class="sub">Édition bureau</p>
  <div class="bar"><span></span></div>
  <p id="stage">Préparation de votre espace…</p>
  <div class="ver">EduGest Desktop ${APP_VERSION ? 'v' + APP_VERSION : ''}</div>
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

/** Affiche la fenêtre principale (une seule fois) et ferme le splash. */
let mainShown = false;
function showMainWindow() {
  if (mainShown) return;
  mainShown = true;
  closeSplash();
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Sécurité : fenêtre toujours visible et bien positionnée (jamais un
    // bandeau hors écran). Maximisée façon opencode.
    try {
      if (!mainWindow.isMaximized()) {
        mainWindow.center();
        mainWindow.maximize();
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
    } catch {}
    mainWindow.show();
    mainWindow.focus();
  }
}

// L'interface prévient quand elle est réellement peinte (preload.js) :
// la fenêtre ne s'affiche jamais vide ou à moitié chargée.
try {
  ipcMain.on('ui-ready', () => showMainWindow());
} catch {}

function createWindow(port) {
  setSplashStage('Ouverture de l\u2019interface…');
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    center: true,
    title: 'EduGest',
    icon: ICON_PATH,
    backgroundColor: '#0a0f0d',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  // Fenêtre maximisée façon opencode : pleine page dès l'ouverture,
  // jamais un bandeau ni une fenêtre perdue hors écran.
  mainWindow.maximize();

  // Barre de menu système SUPPRIMÉE (EduGest / Affichage / Édition)
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  // L'app desktop démarre directement sur la connexion (pas de landing page :
  // le store rabat de toute façon 'home' vers 'login' en mode Electron).
  mainWindow.loadURL(`http://127.0.0.1:${port}/login`);
  // Le splash reste visible jusqu'au chargement COMPLET de la page.
  // Ordre d'affichage : 1) signal 'ui-ready' de l'interface (peinte),
  // 2) did-finish-load, 3) sécurité à 25 s. Jamais de fenêtre vide.
  mainWindow.webContents.on('did-finish-load', () => showMainWindow());
  setTimeout(() => showMainWindow(), 25000);
  mainWindow.once('ready-to-show', () => {
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
  // 1) Base de données locale : copie du template au premier lancement.
  //    La base existante n'est JAMAIS écrasée (ni par les MAJ, ni au
  //    redémarrage) — les données, comptes et sessions sont conservés.
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

  // 2) Ports locaux libres (interface + agent WhatsApp)
  const port = await findFreePort(3927);
  currentPort = port;
  log('Démarrage du serveur EduGest sur le port', port);

  // 2b) Agent WhatsApp embarqué (Baileys, bundlé — même Node qu'Electron).
  //     Démarre avec l'app, session dans userData (survit aux MAJ).
  //     À la fermeture : socket fermé SANS logout → reconnexion auto au
  //     prochain lancement, sans re-scan. Absent en dev (bundle non construit).
  const WA_BUNDLE = isPackaged
    ? path.join(process.resourcesPath, 'wa-server', 'wa-server.cjs')
    : path.join(__dirname, 'wa-server', 'wa-server.cjs');
  const WA_AUTH_DIR = path.join(USER_DATA, 'whatsapp-auth');
  try { if (!fs.existsSync(WA_AUTH_DIR)) fs.mkdirSync(WA_AUTH_DIR, { recursive: true }); } catch {}
  let waPort = 0;
  if (fs.existsSync(WA_BUNDLE)) {
    waPort = await findFreePort(3001);
    log("Démarrage de l'agent WhatsApp sur le port", waPort);
    waProcess = spawn(process.execPath, [WA_BUNDLE], {
      cwd: path.dirname(WA_BUNDLE),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        WA_PORT: String(waPort),
        WHATSAPP_AUTH_DIR: WA_AUTH_DIR,
        WHATSAPP_API_KEY: process.env.WHATSAPP_API_KEY || 'edugest-wa-dev-key',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    waProcess.stdout.on('data', (d) => log('[whatsapp]', String(d).trim()));
    waProcess.stderr.on('data', (d) => log('[whatsapp:err]', String(d).trim()));
    waProcess.on('exit', (code) => log('Agent WhatsApp arrêté (code', code, ')'));
  } else {
    log("Agent WhatsApp non embarqué (bundle absent) — service externe attendu sur le port 3001 s'il existe");
  }

  // 3) Serveur Next.js standalone en processus fils (Node embarqué d'Electron)
  setSplashStage('Démarrage du serveur local…');
  // Sessions serveur persistantes : dans userData (%APPDATA%/EduGest), JAMAIS
  // dans le dossier de l'app (écrasé à chaque mise à jour, et ré-extrait en
  // temp à chaque lancement du portable). Durée 30 jours : pas de reconnexion
  // forcée après une MAJ ou un redémarrage.
  const SESSIONS_DIR = path.join(USER_DATA, '.sessions');
  try { if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch {}
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
      // Sessions persistantes (survivent aux MAJ et aux redémarrages)
      EDUGEST_SESSIONS_DIR: SESSIONS_DIR,
      EDUGEST_SESSION_DAYS: '30',
      // Agent WhatsApp embarqué (ou service externe sur 3001 par défaut)
      WHATSAPP_SERVER_URL: waPort ? `http://127.0.0.1:${waPort}` : 'http://127.0.0.1:3001',
      WHATSAPP_API_KEY: process.env.WHATSAPP_API_KEY || 'edugest-wa-dev-key',
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
  // Agent WhatsApp : simple extinction (SANS logout réseau) → la session
  // Baileys est conservée et reprend automatiquement au prochain lancement.
  if (waProcess) {
    try { waProcess.kill(); } catch {}
    waProcess = null;
  }
});
