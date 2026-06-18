const { Client, LocalAuth } = require('whatsapp-web.js');
const http = require('http');
const qrcode = require('qrcode');
const path = require('path');

const PORT = parseInt(process.env.WHATSAPP_PORT || '3001');

let client = null;
let qrDataUrl = null;
let status = 'disconnected';

function initClient() {
  if (client) return;

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, 'whatsapp-auth') }),
    puppeteer: {
      headless: true,
      executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=WebRtcHideLocalIpsWithMdns',
      ],
    },
  });

  client.on('qr', async (qr) => {
    console.log('[WhatsApp] QR received');
    try {
      qrDataUrl = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
      status = 'connecting';
    } catch (e) {
      console.error('[WhatsApp] QR generate error:', e.message);
    }
  });

  client.on('ready', () => {
    console.log('[WhatsApp] Connected!');
    qrDataUrl = null;
    status = 'connected';
  });

  client.on('authenticated', () => {
    console.log('[WhatsApp] Authenticated');
  });

  client.on('auth_failure', (msg) => {
    console.error('[WhatsApp] Auth failure:', msg);
    status = 'disconnected';
    qrDataUrl = null;
  });

  client.on('disconnected', (reason) => {
    console.log('[WhatsApp] Disconnected:', reason);
    status = 'disconnected';
    qrDataUrl = null;
    client = null;
  });

  console.log('[WhatsApp] Starting client...');
  client.initialize().catch(e => {
    console.error('[WhatsApp] Init error:', e.message);
    client = null;
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status, qr: qrDataUrl }));

  } else if (url.pathname === '/qr-page') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>EduGest - Connexion WhatsApp</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0f0d; color: #e8e0d4; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #1a1f1e; border-radius: 20px; padding: 40px; text-align: center; max-width: 420px; width: 90%; border: 1px solid rgba(255,255,255,0.08); }
    .logo { font-size: 28px; font-weight: 800; background: linear-gradient(135deg, #F5A623, #D4941C); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px; }
    .subtitle { color: rgba(255,255,255,0.5); font-size: 14px; margin-bottom: 30px; }
    #status-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
    .status-connecting { background: rgba(245,166,35,0.15); color: #F5A623; }
    .status-connected { background: rgba(37,211,102,0.15); color: #25D366; }
    .status-disconnected { background: rgba(255,59,48,0.15); color: #ff3b30; }
    #qr-container { margin: 20px 0; }
    #qr-container img { width: 280px; height: 280px; border-radius: 16px; border: 2px solid rgba(255,255,255,0.1); }
    .steps { text-align: left; margin-top: 24px; padding: 16px; background: rgba(255,255,255,0.03); border-radius: 12px; }
    .steps h3 { font-size: 13px; color: rgba(255,255,255,0.5); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .steps ol { padding-left: 20px; }
    .steps li { font-size: 14px; color: rgba(255,255,255,0.7); margin-bottom: 8px; line-height: 1.5; }
    .spinner { width: 40px; height: 40px; border: 3px solid rgba(245,166,35,0.2); border-top-color: #F5A623; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 20px auto; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .refresh-note { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">EduGest</div>
    <div class="subtitle">Connexion WhatsApp Bot</div>
    <div id="status-badge" class="status-connecting">En attente...</div>
    <div id="qr-container"><div class="spinner"></div></div>
    <div class="steps">
      <h3>Instructions</h3>
      <ol>
        <li>Ouvrez <strong>WhatsApp</strong> sur votre téléphone</li>
        <li>Allez dans <strong>Paramètres</strong> → <strong>Appareils connectés</strong></li>
        <li>Appuyez sur <strong>Connecter un appareil</strong></li>
        <li>Scannez le QR code ci-dessus</li>
      </ol>
    </div>
    <div class="refresh-note">Le QR code se rafraîchit automatiquement</div>
  </div>
  <script>
    async function updateQR() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        const badge = document.getElementById('status-badge');
        const container = document.getElementById('qr-container');

        if (data.status === 'connected') {
          badge.className = 'status-connected';
          badge.textContent = '✅ Connecté !';
          container.innerHTML = '<div style="font-size:64px;margin:20px 0">✅</div><p style="color:#25D366;font-weight:600">WhatsApp est connecté !</p><p style="color:rgba(255,255,255,0.5);margin-top:8px">Les OTP seront envoyés via ce téléphone.</p>';
        } else if (data.qr) {
          badge.className = 'status-connecting';
          badge.textContent = '📱 Scannez le QR code';
          container.innerHTML = '<img src="' + data.qr + '" />';
        } else {
          badge.className = 'status-disconnected';
          badge.textContent = '⏳ Initialisation...';
          container.innerHTML = '<div class="spinner"></div>';
        }
      } catch (e) {
        document.getElementById('status-badge').textContent = '❌ Serveur WhatsApp non lancé';
        document.getElementById('status-badge').className = 'status-disconnected';
      }
    }
    updateQR();
    setInterval(updateQR, 3000);
  </script>
</body>
</html>`);

  } else if (url.pathname === '/start' && req.method === 'POST') {
    initClient();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status, qr: qrDataUrl }));

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
        await client.sendMessage(chatId, message);
        console.log(`[WhatsApp] Sent to ${phone}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error('[WhatsApp] Send error:', e.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });

  } else if (url.pathname === '/logout' && req.method === 'POST') {
    if (client) { try { await client.logout(); } catch {} client = null; }
    qrDataUrl = null;
    status = 'disconnected';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));

  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`[WhatsApp Server] http://localhost:${PORT}`);
  console.log(`[WhatsApp QR Page] http://localhost:${PORT}/qr-page`);
  initClient();
});
