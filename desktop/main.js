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
const crypto = require('crypto');

// ── SÉCURITÉ : clé de l'agent WhatsApp. Avant : 'edugest-wa-dev-key' en dur
// → n'importe quel processus de la machine pouvait parler à l'agent local.
// Désormais : clé aléatoire générée par installation (ou WHATSAPP_API_KEY),
// transmise identiquement au service WhatsApp ET au serveur Next.
const WA_API_KEY = process.env.WHATSAPP_API_KEY || crypto.randomBytes(24).toString('hex');

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

/** Clés VAPID (Web Push) : explicites via env, sinon générées une fois par
 *  installation et persistées dans userData. Sans elles, aucune notification
 *  push ne peut partir (ni web ni bureau). */
async function getVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const f = path.join(USER_DATA, 'vapid.json');
  try {
    const raw = JSON.parse(fs.readFileSync(f, 'utf-8'));
    if (raw.publicKey && raw.privateKey) return raw;
  } catch {}
  // ECDH P-256 via WebCrypto — même format que `web-push generateVAPIDKeys`.
  const { subtle } = require('crypto').webcrypto;
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  const pubRaw = Buffer.from(await subtle.exportKey('raw', kp.publicKey));
  const privJwk = await subtle.exportKey('jwk', kp.privateKey);
  const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const keys = { publicKey: b64url(pubRaw), privateKey: privJwk.d };
  try { fs.writeFileSync(f, JSON.stringify(keys)); } catch {}
  log('Clés VAPID générées pour cette installation.');
  return keys;
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
    ? `<img src="${logoUri}" alt="EduGest" draggable="false" style="width:140px;height:auto;display:block;filter:drop-shadow(0 8px 28px rgba(0,0,0,.5))">`
    : `<div class="fallback">EduGest</div>`;
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%;background:#0b0f0e;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden;user-select:none}
  .fallback{color:#fff;font-weight:800;font-size:24px}
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
  // Sécurité : si l'UI plante au chargement, ne pas laisser un écran noir —
  // et JOURNALISER l'URL en échec (diagnostic des pages d'erreur).
  mainWindow.webContents.on('did-fail-load', (event, code, desc, url) => {
    log('Échec chargement UI :', code, desc, '→', url);
    closeSplash();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Mises à jour : simple bannière DANS l'app (zéro popup) ─────────────────
// Le processus principal détecte/télécharge, l'interface affiche une bannière
// discrète (UpdateBanner) : disponible → téléchargement (% ) → redémarrer.
// Les données (%APPDATA%/EduGest/edugest.db) ne sont JAMAIS touchées.

/** Envoie un événement MAJ à l'interface (bannière in-app). */
function sendUpdate(type, payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('edugest-update', { type, ...(payload || {}) });
    }
  } catch {}
}

// Actions déclenchées depuis la bannière (preload → ipcRenderer).
// Installée : electron-updater (GitHub invisible). Portable : téléchargement
// direct de l'exe + relance — l'utilisateur ne voit jamais GitHub.
let pendingPortableAsset = null; // { url, version, file }
try {
  ipcMain.on('update-download', () => {
    if (pendingPortableAsset) {
      downloadPortableUpdate(pendingPortableAsset);
      return;
    }
    if (!autoUpdater) return;
    log('Téléchargement de la mise à jour…');
    autoUpdater.downloadUpdate()
      .then(() => sendUpdate('downloading', { percent: 100 }))
      .catch((e) => {
        log('Échec téléchargement MAJ :', e.message);
        sendUpdate('error', { message: e.message });
      });
  });
  ipcMain.on('update-install', () => {
    if (pendingPortableAsset && pendingPortableAsset.file && fs.existsSync(pendingPortableAsset.file)) {
      // Portable : lance le nouvel exe puis quitte (l'ancien reste à supprimer).
      const f = pendingPortableAsset.file;
      pendingPortableAsset = null;
      log('Lancement de la nouvelle version portable :', f);
      shell.openPath(f).then(() => app.quit()).catch((e) => log('Échec lancement MAJ :', e.message));
      return;
    }
    if (!autoUpdater) return;
    try { if (serverProcess) serverProcess.kill(); } catch {}
    try { if (waProcess) waProcess.kill(); } catch {}
    autoUpdater.quitAndInstall(false, true);
  });
  ipcMain.on('update-open-page', (_e, url) => {
    // ── SÉCURITÉ : allowlist — uniquement des URLs https de confiance
    // (un XSS dans l'UI ne doit pas pouvoir ouvrir un schéma arbitraire).
    try {
      if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url);
    } catch {}
  });
} catch {}

/** Télécharge le nouvel exe portable (suit les redirections GitHub),
 *  avec progression → bannière « prête ». GitHub reste invisible. */
function downloadPortableUpdate(asset) {
  const dest = path.join(app.getPath('downloads'), `EduGest-Portable-${asset.version}.exe`);
  if (fs.existsSync(dest)) {
    log('Portable déjà téléchargé :', dest);
    pendingPortableAsset.file = dest;
    sendUpdate('ready', { version: asset.version });
    return;
  }
  log('Téléchargement portable :', dest);
  sendUpdate('downloading', { percent: 0, version: asset.version });
  const get = (url, redirects) => {
    https.get(url, { headers: { 'User-Agent': 'EduGest-Desktop', Accept: 'application/octet-stream' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        get(res.headers.location, redirects - 1);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        sendUpdate('error', { message: `Téléchargement impossible (HTTP ${res.statusCode})` });
        return;
      }
      const total = Number(res.headers['content-length']) || 0;
      let received = 0;
      const out = fs.createWriteStream(dest);
      res.on('data', (c) => {
        received += c.length;
        if (total > 0) sendUpdate('downloading', { percent: Math.round((received / total) * 100), version: asset.version });
      });
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          pendingPortableAsset.file = dest;
          try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1); } catch {}
          sendUpdate('ready', { version: asset.version });
        });
      });
      out.on('error', (e) => {
        try { fs.unlinkSync(dest); } catch {}
        sendUpdate('error', { message: e.message });
      });
    }).on('error', (e) => sendUpdate('error', { message: e.message }));
  };
  get(asset.url, 5);
}

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
          pendingPortableAsset = null;
          return;
        }
        // Bannière in-app (comme l'installée) : l'asset portable est
        // téléchargé directement, GitHub reste invisible.
        const asset = (rel.assets || []).find((a) => /portable.*\.exe$/i.test(a.name || ''));
        if (!asset || !asset.browser_download_url) return;
        pendingPortableAsset = { url: asset.browser_download_url, version: latest, file: null };
        sendUpdate('available', { version: latest });
      } catch {}
    });
  });
  req.on('error', () => {});
  req.setTimeout(10000, () => req.destroy());
}

function setupAutoUpdate() {
  if (!app.isPackaged || !mainWindow || mainWindow.isDestroyed()) return;

  // — Version portable : même bannière, téléchargement direct + relance —
  if (isPortable() || !autoUpdater) {
    if (isPortable()) {
      setTimeout(() => checkPortableUpdate(false), UPDATE_CHECK_DELAY_MS);
      setInterval(() => checkPortableUpdate(false), UPDATE_CHECK_INTERVAL_MS);
    }
    return;
  }

  // — Version installée : détection + téléchargement, annonce en bannière —
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info) => {
    log('Mise à jour disponible :', info.version);
    sendUpdate('available', { version: info.version });
  });

  autoUpdater.on('download-progress', (p) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(p.percent / 100);
      }
    } catch {}
    sendUpdate('downloading', { percent: Math.round(p.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log('Mise à jour téléchargée :', info.version);
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(-1);
      }
    } catch {}
    sendUpdate('ready', { version: info.version });
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
        WHATSAPP_API_KEY: WA_API_KEY,
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
  // Clés VAPID pour les notifications push (générées une fois par installation)
  let vapidPublicKey = '';
  let vapidPrivateKey = '';
  try {
    const vk = await getVapidKeys();
    vapidPublicKey = vk.publicKey;
    vapidPrivateKey = vk.privateKey;
  } catch (e) {
    log('VAPID indisponible (push désactivé) :', e.message);
  }
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
      // Web Push : clés de cette installation (push même app fermée côté web)
      VAPID_PUBLIC_KEY: vapidPublicKey,
      VAPID_PRIVATE_KEY: vapidPrivateKey,
      VAPID_SUBJECT: 'mailto:contact@edugest.app',
      // Agent WhatsApp embarqué (ou service externe sur 3001 par défaut)
      WHATSAPP_SERVER_URL: waPort ? `http://127.0.0.1:${waPort}` : 'http://127.0.0.1:3001',
      WHATSAPP_API_KEY: WA_API_KEY,
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
