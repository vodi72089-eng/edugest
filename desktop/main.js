/**
 * EduGest Desktop — Application de bureau (Windows / macOS / Linux)
 *
 * Architecture :
 *  1. Au premier lancement, la base de données SQLite locale est copiée dans
 *     le dossier de données de l'utilisateur (%APPDATA%/EduGest/edugest.db).
 *  2. Le serveur Next.js standalone (généré par `npm run build`) est démarré
 *     en processus fils sur un port local libre.
 *  3. Un SPLASH (logo officiel) s'affiche INSTANTANÉMENT pendant que le
 *     serveur démarre — l'utilisateur voit l'app se lancer tout de suite,
 *     puis la fenêtre principale remplace le splash (démarrage perçu rapide).
 *  4. AUCUNE barre de menu système (EduGest / Affichage / Édition supprimés).
 *
 * Build : voir DESKTOP.md (electron-builder → installateur .exe + portable).
 */

const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

// ─── Chemins ─────────────────────────────────────────────────────────────────

const isPackaged = app.isPackaged;

/** Dossier contenant le serveur Next standalone */
const APP_DIR = isPackaged
  ? path.join(process.resourcesPath, 'app')
  : path.join(__dirname, '..', '.next', 'standalone');

const SERVER_JS = path.join(APP_DIR, 'server.js');

/** Logo officiel EduGest (icône fenêtre + splash) */
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

/** Attend que le serveur Next réponde */
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
      req.setTimeout(2000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error('Le serveur local n\'a pas démarré à temps'));
      setTimeout(ping, 400);
    };
    ping();
  });
}

// ─── Fenêtres ────────────────────────────────────────────────────────────────

let serverProcess = null;
let mainWindow = null;
let splashWindow = null;
let currentPort = 0;

/** Splash : logo officiel EduGest affiché instantanément au démarrage */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
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
    },
  });
  const logoUri = (() => {
    try { return 'file://' + ICON_PATH.replace(/\\/g, '/'); } catch { return ''; }
  })();
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;height:100%;background:#0a0f0d;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden;user-select:none}
  img{width:200px;height:auto;border-radius:20px;animation:pulse 1.6s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.82;transform:scale(.985)}}
  h1{color:#f5f2e8;font-size:24px;margin:18px 0 4px;font-weight:800;letter-spacing:-.5px}
  p{color:rgba(255,255,255,.45);font-size:12.5px;margin:0}
  .bar{width:180px;height:3px;background:rgba(255,255,255,.1);border-radius:2px;margin-top:20px;overflow:hidden}
  .bar span{display:block;height:100%;width:40%;background:linear-gradient(90deg,#149a80,#f5a623);border-radius:2px;animation:slide 1.1s ease-in-out infinite}
  @keyframes slide{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}
</style></head><body>
  <img src="${logoUri}" alt="EduGest" />
  <h1>Edu<span style="color:#f5a623">Gest</span></h1>
  <p>Démarrage de votre espace sécurisé…</p>
  <div class="bar"><span></span></div>
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

// ─── Démarrage ───────────────────────────────────────────────────────────────

async function startBackend() {
  // 1) Base de données locale : copie du template au premier lancement
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
  // Splash instantané (logo officiel) — AVANT tout le reste
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
