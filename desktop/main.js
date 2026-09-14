/**
 * EduGest Desktop — Application de bureau (Windows / macOS / Linux)
 *
 * Architecture :
 *  1. Au premier lancement, la base de données SQLite locale est copiée dans
 *     le dossier de données de l'utilisateur (%APPDATA%/EduGest/edugest.db).
 *  2. Le serveur Next.js standalone (généré par `npm run build`) est démarré
 *     en processus fils sur un port local libre.
 *  3. Une fenêtre Electron ouvre l'application — 100 % hors ligne,
 *     base de données connectée localement.
 *
 * Build : voir DESKTOP.md (electron-builder → installateur .exe + portable).
 */

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const crypto = require('crypto');

// ─── Chemins ─────────────────────────────────────────────────────────────────

const isPackaged = app.isPackaged;

/** Dossier contenant le serveur Next standalone */
const APP_DIR = isPackaged
  ? path.join(process.resourcesPath, 'app')
  : path.join(__dirname, '..', '.next', 'standalone');

const SERVER_JS = path.join(APP_DIR, 'server.js');

/** Base de données locale (créée au premier lancement) */
const USER_DATA = app.getPath('userData');
const DB_DIR = isPackaged ? USER_DATA : path.join(__dirname, '..', 'db');
const DB_PATH = isPackaged
  ? path.join(USER_DATA, 'edugest.db')
  : path.join(__dirname, '..', 'prisma', 'db', 'custom.db');

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

/** Importe une base de données .db dans la base locale */
async function importDatabase(mainWindow) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer une base de données EduGest',
    filters: [
      { name: 'Base de données SQLite', extensions: ['db', 'sqlite', 'sqlite3'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return;

  const srcPath = result.filePaths[0];
  try {
    // Backup de l'ancienne base
    const backupPath = DB_PATH + `.backup-${Date.now()}`;
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, backupPath);
      log('Backup créée :', backupPath);
    }
    // Copie de la nouvelle base
    fs.copyFileSync(srcPath, DB_PATH);
    log('Base de données importée depuis :', srcPath);

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Import réussi',
      message: 'La base de données a été importée avec succès.',
      detail: `L'ancienne base a été sauvegardée.\nRedémarrez l'application pour appliquer les changements.`,
    });

    // Redémarrer le serveur
    if (serverProcess) {
      try { serverProcess.kill(); } catch {}
      serverProcess = null;
    }
    const port = await startBackend();
    mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  } catch (e) {
    log('Erreur import :', e.message);
    dialog.showErrorBox('Erreur', 'Impossible d\'importer la base de données :\n' + e.message);
  }
}

/** Trouve un port TCP libre — test parallèle rapide */
function findFreePort(start) {
  return new Promise((resolve) => {
    let port = start;
    const tryNext = () => {
      const srv = net.createServer();
      srv.once('error', () => { port++; tryNext(); });
      srv.once('listening', () => srv.close(() => resolve(port)));
      srv.listen(port, '127.0.0.1');
    };
    tryNext();
  });
}

/** Attend que le serveur Next réponde — ping accéléré au démarrage */
function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let attempt = 0;
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
      attempt++;
      // Ping rapide les 10 premières secondes (100ms), puis 300ms après
      const delay = attempt < 20 ? 100 : 300;
      setTimeout(ping, delay);
    };
    ping();
  });
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

let serverProcess = null;
let mainWindow = null;
let currentPort = 0;

let splashWindow = null;

function showSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 340,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false },
  });
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:transparent}
    .card{background:linear-gradient(135deg,#1a1a2e 0%,#0a0f0d 100%);border-radius:24px;padding:48px 40px;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.08);width:440px}
    .ico{width:72px;height:72px;border-radius:18px;margin:0 auto 20px;background:linear-gradient(135deg,#c4a06e,#8a6d3b);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(200,170,110,0.3)}
    .ico span{color:#fff;font-size:28px;font-weight:800}
    h1{color:#f5f0e8;font-size:22px;font-weight:700;margin-bottom:6px}
    .sub{color:#8a8578;font-size:13px;margin-bottom:28px}
    .bar-bg{background:rgba(255,255,255,0.08);border-radius:100px;height:5px;overflow:hidden}
    .bar{height:100%;border-radius:100px;width:0%;animation:load 3s ease-in-out infinite;background:linear-gradient(90deg,#c4a06e,#d4b87e,#c4a06e)}
    @keyframes load{0%{width:0%;margin-left:0}50%{width:60%;margin-left:20%}100%{width:0%;margin-left:100%}}
  </style></head><body><div class="card">
    <div class="ico"><span>EG</span></div>
    <h1>EduGest</h1>
    <div class="sub">Chargement de l'application...</div>
    <div class="bar-bg"><div class="bar"></div></div>
  </div></body></html>`)}`);
  splashWindow.on('closed', () => { splashWindow = null; });
}

function closeSplash() {
  if (splashWindow) {
    try { splashWindow.close(); } catch {}
    splashWindow = null;
  }
}

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
      DATABASE_URL: `file:${DB_PATH}`,
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_OPTIONS: '--max-old-space-size=256',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => log('[serveur]', String(d).trim()));
  serverProcess.stderr.on('data', (d) => log('[serveur:err]', String(d).trim()));
  serverProcess.on('exit', (code) => log('Serveur arrêté (code', code, ')'));

  // 4) Attendre que le serveur soit prêt
  await waitForServer(`http://127.0.0.1:${port}/`);
  return port;
}

function createWindow(port) {
  const iconPath = isPackaged
    ? path.join(process.resourcesPath, 'app', 'public', 'edugest-logo.png')
    : path.join(__dirname, '..', 'public', 'edugest-logo.png');

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'EduGest',
    backgroundColor: '#0a0f0d',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // Afficher immédiatement dès que le chargement commence (écran blanc au lieu de rien)
  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  showSplash();

  // Menu minimal
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'EduGest',
      submenu: [
        { label: 'À propos', click: () => dialog.showMessageBox({ type: 'info', title: 'EduGest', message: 'EduGest Desktop', detail: 'La plateforme de gestion scolaire — application de bureau avec base de données locale.' }) },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Base de données',
      submenu: [
        { label: 'Importer une base...', click: () => { if (mainWindow) importDatabase(mainWindow); } },
        { label: 'Ouvrir le dossier local', click: () => { shell.openPath(DB_DIR); } },
        { type: 'separator' },
        { label: 'Ouvrir dans le navigateur', click: () => { if (currentPort) shell.openExternal(`http://127.0.0.1:${currentPort}`); } },
      ],
    },
    { label: 'Affichage', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Édition', submenu: [{ role: 'copy' }, { role: 'paste' }, { role: 'cut' }, { role: 'selectAll' }] },
  ]));

  try {
    const port = await startBackend();
    createWindow(port);
  } catch (e) {
    log('ERREUR FATALE :', e.message);
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
