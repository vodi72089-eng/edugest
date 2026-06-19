const { Client, LocalAuth } = require('whatsapp-web.js');
const http = require('http');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.env.WHATSAPP_PORT || '3001');

function findBrowserPath() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const BROWSER_PATH = findBrowserPath();
if (BROWSER_PATH) {
  console.log('[WA] Browser:', BROWSER_PATH);
} else {
  console.warn('[WA] No browser found');
}

let client = null;
let qrDataUrl = null;
let status = 'disconnected';
let connectedPhone = null;

function initClient() {
  if (client) {
    console.log('[WA] Client already exists, skipping init');
    return;
  }

  console.log('[WA] Creating WhatsApp client...');
  try {
    client = new Client({
      authStrategy: new LocalAuth({ dataPath: path.join(__dirname, 'whatsapp-auth') }),
      puppeteer: {
        headless: true,
        executablePath: BROWSER_PATH || undefined,
        protocolTimeout: 120000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
        ],
      },
    });

    client.on('qr', async (qr) => {
      console.log('[WA] QR received');
      try {
        qrDataUrl = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
        status = 'connecting';
      } catch (e) {
        console.error('[WA] QR error:', e.message);
      }
    });

    client.on('ready', () => {
      console.log('[WA] Connected!');
      qrDataUrl = null;
      status = 'connected';
      if (client.info && client.info.wid) {
        connectedPhone = client.info.wid.user;
      }
    });

    client.on('authenticated', () => {
      console.log('[WA] Authenticated');
    });

    client.on('auth_failure', (msg) => {
      console.error('[WA] Auth failure:', msg);
      status = 'disconnected';
      qrDataUrl = null;
      client = null;
    });

    client.on('disconnected', (reason) => {
      console.log('[WA] Disconnected:', reason);
      status = 'disconnected';
      qrDataUrl = null;
      connectedPhone = null;
      client = null;
    });

    client.on('error', (err) => {
      console.error('[WA] Client error:', err.message);
    });

    console.log('[WA] Initializing client...');
    client.initialize().catch(e => {
      console.error('[WA] Init failed:', e.message);
      client = null;
      status = 'disconnected';
    });
  } catch (e) {
    console.error('[WA] Failed to create client:', e.message);
    client = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// HTTP Server — simple handler, no async at top level
// ═══════════════════════════════════════════════════════════════

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost:' + PORT);

  if (url.pathname === '/status') {
    const data = { status, qr: qrDataUrl, connectedPhone };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));

  } else if (url.pathname === '/qr-page') {
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>EduGest WhatsApp</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#0a0f0d;color:#e8e0d4;display:flex;justify-content:center;align-items:center;min-height:100vh}.card{background:#1a1f1e;border-radius:20px;padding:40px;text-align:center;max-width:420px;width:90%;border:1px solid rgba(255,255,255,0.08)}.logo{font-size:28px;font-weight:800;color:#F5A623;margin-bottom:8px}.subtitle{color:rgba(255,255,255,0.5);font-size:14px;margin-bottom:30px}#badge{display:inline-block;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:24px}.ok{background:rgba(37,211,102,0.15);color:#25D366}.wait{background:rgba(245,166,35,0.15);color:#F5A623}.err{background:rgba(255,59,48,0.15);color:#ff3b30}#qr{margin:20px 0}#qr img{width:280px;height:280px;border-radius:16px;border:2px solid rgba(255,255,255,0.1)}.spin{width:40px;height:40px;border:3px solid rgba(245,166,35,0.2);border-top-color:#F5A623;border-radius:50%;animation:s .8s linear infinite;margin:20px auto}@keyframes s{to{transform:rotate(360deg)}}.steps{text-align:left;margin-top:24px;padding:16px;background:rgba(255,255,255,0.03);border-radius:12px}.steps h3{font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:12px;text-transform:uppercase;letter-spacing:1px}.steps ol{padding-left:20px}.steps li{font-size:14px;color:rgba(255,255,255,0.7);margin-bottom:8px;line-height:1.5}</style></head><body><div class="card"><div class="logo">EduGest</div><div class="subtitle">Connexion WhatsApp Bot</div><div id="badge" class="wait">En attente...</div><div id="qr"><div class="spin"></div></div><div class="steps"><h3>Instructions</h3><ol><li>Ouvrez WhatsApp sur votre telephone</li><li>Allez dans Parametres &rarr; Appareils connectes</li><li>Appuyez sur Connecter un appareil</li><li>Scannez le QR code ci-dessus</li></ol></div></div><script>async function u(){try{var r=await fetch("/status");var d=await r.json();var b=document.getElementById("badge");var q=document.getElementById("qr");if(d.status==="connected"){b.className="ok";b.textContent="Connecte !";q.innerHTML="<div style=font-size:64px;margin:20px 0>&#x2705;</div><p style=color:#25D366;font-weight:600>WhatsApp est connecte !</p>"}else if(d.qr){b.className="wait";b.textContent="Scannez le QR code";q.innerHTML="<img src=\""+d.qr+"\" />"}else{b.className="err";b.textContent="Initialisation...";q.innerHTML="<div class=spin></div>"}}catch(e){document.getElementById("badge").textContent="Serveur WhatsApp non lance";document.getElementById("badge").className="err"}}u();setInterval(u,3000)</script></body></html>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);

  } else if (url.pathname === '/start' && req.method === 'POST') {
    initClient();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, status, qr: qrDataUrl }));

  } else if (url.pathname === '/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { phone, message } = JSON.parse(body);
        if (!client || status !== 'connected') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Not connected' }));
          return;
        }
        const chatId = phone.replace(/[^0-9]/g, '') + '@c.us';
        const sendPromise = client.sendMessage(chatId, message);
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Send timeout')), 15000));
        await Promise.race([sendPromise, timeout]);
        console.log('[WA] Sent to', phone);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error('[WA] Send error:', e.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });

  } else if (url.pathname === '/pair-code' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { phone } = JSON.parse(body);
        if (!client || status !== 'connected') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Client non connecte. Scannez le QR d\'abord.' }));
          return;
        }
        const code = await client.requestPairingCode(phone.replace(/[^0-9]/g, ''));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, code }));
      } catch (e) {
        console.error('[WA] Pair code error:', e.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });

  } else if (url.pathname === '/logout' && req.method === 'POST') {
    if (client) { try { client.logout(); } catch {} client = null; }
    qrDataUrl = null;
    status = 'disconnected';
    connectedPhone = null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));

  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// ═══════════════════════════════════════════════════════════════
// Lancer le serveur HTTP d'abord, puis WhatsApp après
// ═══════════════════════════════════════════════════════════════

server.listen(PORT, () => {
  console.log('[WA] HTTP server listening on http://localhost:' + PORT);
  // Lancer WhatsApp avec un léger délai pour ne pas bloquer le bind
  setTimeout(initClient, 500);
});

server.on('error', (err) => {
  console.error('[WA] Server error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error('[WA] Port ' + PORT + ' is already in use');
  }
});

process.on('uncaughtException', (err) => {
  console.error('[WA] Uncaught:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[WA] Unhandled rejection:', reason);
});
