const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

try { require('dotenv').config(); } catch {}

// Diagnostic: tous les logs vont aussi dans wa-log.txt
(function () {
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  const write = (line) => { try { fs.appendFileSync(path.join(__dirname, 'wa-log.txt'), line + '\n'); } catch {} };
  const fmt = (a) => a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
  console.log = (...a) => { origLog(...a); write(new Date().toISOString() + ' ' + fmt(a)); };
  console.error = (...a) => { origErr(...a); write(new Date().toISOString() + ' ERR ' + fmt(a)); };
})();

const PORT = parseInt(process.env.WHATSAPP_PORT || '3001');
const LINKING_CODE = 'EDUGEST1'; // Baileys exige exactement 8 caracteres
const SESSION_DIR = path.join(__dirname, 'baileys-auth');

const API_KEY = process.env.WHATSAPP_API_KEY || 'edugest-wa-dev-key';
if (!process.env.WHATSAPP_API_KEY) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[WA] WHATSAPP_API_KEY requis en production.');
    process.exit(1);
  }
  console.warn('[WA] WHATSAPP_API_KEY non defini, cle de dev utilisee.');
}
const ALLOWED_ORIGINS = (process.env.WHATSAPP_CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',').map(s => s.trim()).filter(Boolean);

function isAuthorized(req) {
  const provided = req.headers['x-api-key'];
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(API_KEY);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function generateOTP() {
  return String(crypto.randomInt(100000, 999999));
}

let sock = null;
let status = 'disconnected';
let connectedPhone = null;
let verified = false;
let verifyPhone = null;
let starting = false;
let qrData = null;
let otpEntry = null;
let clientReady = false;
let pairingCode = null;

function resetState() {
  sock = null;
  status = 'disconnected';
  connectedPhone = null;
  verified = false;
  verifyPhone = null;
  starting = false;
  qrData = null;
  otpEntry = null;
  clientReady = false;
  pairingCode = null;
}

async function initClient() {
  if (starting) { console.log('[WA] Deja en cours de demarrage...'); return; }
  starting = true;
  clientReady = false;
  qrData = null;
  pairingCode = null;
  status = 'connecting';
  console.log('[WA] Demarrage du client Baileys...');

  try {
    const baileys = require('@whiskeysockets/baileys');
    const makeWASocket = baileys.default;
    const { useMultiFileAuthState } = baileys;
    const { DisconnectReason, Browsers } = baileys;
    console.log('[WA] Baileys charge OK');
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    console.log('[WA] Auth state charge');

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: Browsers.macOS('Desktop'),
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log('[WA] connection.update:', JSON.stringify({ connection, statusCode: lastDisconnect?.error?.output?.statusCode, hasQr: !!qr }));

      if (qr) {
        console.log('[WA] QR recu');
        status = 'connecting';
        try {
          const QRCode = require('qrcode');
          qrData = await QRCode.toDataURL(qr);
          console.log('[WA] QR pret');
        } catch (e) { console.error('[WA] Erreur conversion QR:', e.message); }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log('[WA] Connexion fermee, code:', statusCode, 'reconnexion:', shouldReconnect);
        if (statusCode === DisconnectReason.loggedOut) {
          console.log('[WA] Session expiree, nettoyage...');
          resetState();
          if (fs.existsSync(SESSION_DIR)) {
            try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
          }
        } else if (shouldReconnect) {
          console.log('[WA] Reconnexion...');
          starting = false;
          await initClient();
        } else {
          resetState();
        }
      }

      if (connection === 'open') {
        console.log('[WA] Connecte!');
        status = 'connected';
        starting = false;
        clientReady = true;
        qrData = null;
        connectedPhone = sock.user?.id?.replace(/:.*@/, '@')?.split('@')[0] || null;
        console.log('[WA] Telephone:', connectedPhone);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (event) => {
      for (const msg of event.messages) {
        if (!msg.key.fromMe && event.type === 'notify') {
          console.log('[WA] Message recu de', msg.key.remoteJid, ':', msg.message?.conversation || msg.message?.extendedTextMessage?.text || '(media)');
        }
      }
    });

    console.log('[WA] Client Baileys cree, en attente de connexion...');
  } catch (e) {
    console.error('[WA] Erreur init:', e.message);
    resetState();
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url || '/', 'http://localhost:' + PORT);
  const json = (data, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };

  if (!isAuthorized(req)) {
    return json({ ok: false, error: 'Non autorise' }, 401);
  }

  try {
    // ─── GET /status ────────────────────────────────────────────────────────
    if (url.pathname === '/status') {
      json({ status, connectedPhone, verified, verifyPhone, qr: qrData, linkingCode: LINKING_CODE, clientReady });

    // ─── POST /start ────────────────────────────────────────────────────────
    } else if (url.pathname === '/start' && req.method === 'POST') {
      await initClient();
      json({ ok: true, status });

    // ─── POST /pair ─────────────────────────────────────────────────────────
    } else if (url.pathname === '/pair' && req.method === 'POST') {
      const body = await readBody(req);
      const { phone } = JSON.parse(body || '{}');
      if (!phone) return json({ ok: false, error: 'Numero requis' });

      const phoneClean = phone.replace(/[^0-9]/g, '');
      console.log('[WA] ===== DEMANDE PARRAINAGE pour', phoneClean, '=====');
      console.log('[WA] Timestamp:', new Date().toISOString());

      // Si deja connecte, on ne peut pas demander un nouveau pairing
      if (status === 'connected') {
        return json({ ok: false, error: 'Deja connecte. Deconnectez d\'abord.' });
      }

      // Si pas encore de client, en creer un
      if (!sock) {
        console.log('[WA] Creation d\'un nouveau client pour le parrainage...');
        resetState();
        await initClient();
      }

      // Attendre que le socket soit reellement pret a appairer.
      // La reception du QR prouve que le handshake avec les serveurs WhatsApp est termine ;
      // appeler requestPairingCode avant provoque "Connection Closed When Requesting Pairing Code".
      const waitStart = Date.now();
      while (Date.now() - waitStart < 45000) {
        if (status === 'connected') {
          return json({ ok: false, error: 'Deja connecte. Deconnectez d\'abord.' });
        }
        if (qrData && sock) break;
        if (status === 'disconnected' && !starting) {
          return json({ ok: false, error: 'Client plante. Reessayez.' });
        }
        await new Promise(r => setTimeout(r, 500));
      }

      if (!sock) {
        return json({ ok: false, error: 'Client non disponible.' });
      }

      // Baileys v6 genere automatiquement un code de parrainage numerique
      // On ne passe PAS de code custom — WhatsApp doit generer le sien
      console.log('[WA] Demande du code de parrainage pour', phoneClean, '...');
      let code = null;
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          code = await sock.requestPairingCode(phoneClean);
          break;
        } catch (e) {
          lastError = e;
          console.error('[WA] Erreur requestPairingCode (tentative ' + attempt + '):', e.message);
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
        }
      }
      if (code) {
        pairingCode = code;
        console.log('[WA] ===== CODE PARRAINAGE:', code, '=====');
        json({ ok: true, pairingCode: code });
      } else {
        json({ ok: false, error: 'Code indisponible: ' + (lastError?.message || 'erreur inconnue') });
      }

    // ─── POST /generate-otp ─────────────────────────────────────────────────
    } else if (url.pathname === '/generate-otp' && req.method === 'POST') {
      const body = await readBody(req);
      const { phone } = JSON.parse(body || '{}');
      if (!sock || status !== 'connected') return json({ ok: false, error: 'Bot non connecte.' });
      if (!phone) return json({ ok: false, error: 'Numero requis' });
      const otp = generateOTP();
      const phoneKey = phone.replace(/[^0-9]/g, '');
      const chatId = phoneKey + '@s.whatsapp.net';
      const message = `🔐 Code de vérification EduGest\n\nVotre code OTP est : *${otp}*\n\nValable pendant 5 minutes.`;
      try {
        await Promise.race([
          sock.sendMessage(chatId, { text: message }),
          new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 15000))
        ]);
        otpEntry = { otp, phone: phoneKey, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 };
        verifyPhone = phone;
        console.log('[WA] OTP envoye a', phone);
        json({ ok: true });
      } catch (e) { json({ ok: false, error: e.message }); }

    // ─── POST /verify-otp ───────────────────────────────────────────────────
    } else if (url.pathname === '/verify-otp' && req.method === 'POST') {
      const body = await readBody(req);
      const { code, phone } = JSON.parse(body || '{}');
      if (!otpEntry) return json({ ok: false, error: 'Aucun OTP genere. Cliquez sur "Recevoir un code" dabord.' });
      if (Date.now() > otpEntry.expiresAt) { otpEntry = null; return json({ ok: false, error: 'Code expire. Demandez-en un nouveau.' }); }
      if (otpEntry.attempts >= 5) { otpEntry = null; return json({ ok: false, error: 'Trop de tentatives. Demandez un nouveau code.' }); }
      const phoneKey = String(phone || '').replace(/[^0-9]/g, '');
      if (phoneKey && phoneKey !== otpEntry.phone) { otpEntry.attempts++; return json({ ok: false, error: 'Code incorrect' }); }
      const provided = Buffer.from(String(code || '').trim());
      const expected = Buffer.from(otpEntry.otp);
      if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        otpEntry.attempts++;
        return json({ ok: false, error: 'Code incorrect' });
      }
      verified = true;
      verifyPhone = otpEntry.phone;
      otpEntry = null;
      json({ ok: true, verified: true });

    // ─── POST /send ─────────────────────────────────────────────────────────
    } else if (url.pathname === '/send' && req.method === 'POST') {
      const body = await readBody(req);
      const { phone, message } = JSON.parse(body || '{}');
      if (!sock || status !== 'connected') return json({ ok: false, error: 'Non connecte' });
      const chatId = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      await Promise.race([
        sock.sendMessage(chatId, { text: message }),
        new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 15000))
      ]);
      console.log('[WA] Message envoye a', phone);
      json({ ok: true });

    // ─── POST /logout ───────────────────────────────────────────────────────
    } else if (url.pathname === '/logout' && req.method === 'POST') {
      if (sock) {
        try { sock.logout(); } catch {}
        try { sock.end(); } catch {}
      }
      resetState();
      if (fs.existsSync(SESSION_DIR)) {
        try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
      }
      json({ ok: true });

    // ─── GET /debug-modules ─────────────────────────────────────────────────
    } else if (url.pathname === '/debug-modules' && req.method === 'GET') {
      json({ ok: true, modules: { baileys: true, pairingCode: LINKING_CODE, version: 'baileys-custom' } });

    } else {
      res.writeHead(404); res.end('Not found');
    }
  } catch (e) {
    console.error('[WA] Erreur serveur:', e.message);
    json({ ok: false, error: e.message }, 500);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('[WA] Port ' + PORT + ' deja utilise. Tuez l\'autre processus et relancez.');
    process.exit(1);
  }
  console.error('[WA] Erreur serveur:', err.message);
});

server.listen(PORT, () => {
  console.log('[WA] Serveur Baileys sur http://localhost:' + PORT);
  console.log('[WA] Code de liaison:', LINKING_CODE);
  resetState();
  console.log('[WA] Pret — en attente d\'une demande /start ou /pair...');
});

process.on('uncaughtException', (err) => {
  console.error('[WA] Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[WA] Rejet non gere:', reason);
});
