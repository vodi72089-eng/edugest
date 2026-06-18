import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import pino from 'pino';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = pino({ level: 'warn' });
const AUTH_DIR = path.resolve(__dirname, '..', 'whatsapp-auth');

let sock: WASocket | null = null;
let qrCode: string | null = null;
let connectionStatus: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
let reconnectTimer: NodeJS.Timeout | null = null;

async function startWhatsApp(): Promise<void> {
  if (sock) return;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: true,
    browser: ['EduGest', 'Chrome', '4.0.0'],
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCode = qr;
      connectionStatus = 'connecting';
      console.log('[WhatsApp] QR ready. Scan with your phone.');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[WhatsApp] Closed. Code: ${statusCode}. Reconnect: ${shouldReconnect}`);

      sock = null;

      if (shouldReconnect) {
        qrCode = null;
        connectionStatus = 'disconnected';
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => startWhatsApp(), 5000);
      } else {
        qrCode = null;
        connectionStatus = 'disconnected';
        console.log('[WhatsApp] Logged out. Scan QR again.');
      }
    }

    if (connection === 'open') {
      qrCode = null;
      connectionStatus = 'connected';
      console.log('[WhatsApp] Connected!');
    }
  });

  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.message) {
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (text) console.log(`[WhatsApp] ${msg.key.remoteJid}: ${text}`);
      }
    }
  });
}

async function sendMessage(phone: string, message: string): Promise<boolean> {
  if (!sock || connectionStatus !== 'connected') return false;
  try {
    const jid = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await sock.sendMessage(jid, { text: message });
    console.log(`[WhatsApp] Sent to ${phone}`);
    return true;
  } catch (error) {
    console.error('[WhatsApp] Send failed:', error);
    return false;
  }
}

// ─── HTTP Server ──────────────────────────────────────────────────────────
import http from 'http';
const PORT = parseInt(process.env.WHATSAPP_PORT || '3001');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: connectionStatus, qr: qrCode }));
  } else if (url.pathname === '/start' && req.method === 'POST') {
    await startWhatsApp();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: connectionStatus, qr: qrCode }));
  } else if (url.pathname === '/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { phone, message } = JSON.parse(body);
        const ok = await sendMessage(phone, message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok }));
      } catch (e: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  } else if (url.pathname === '/logout' && req.method === 'POST') {
    if (sock) { await sock.logout(); sock = null; }
    if (reconnectTimer) clearTimeout(reconnectTimer);
    qrCode = null;
    connectionStatus = 'disconnected';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`[WhatsApp Server] http://localhost:${PORT}`);
  startWhatsApp();
});
