const { Client, LocalAuth } = require('whatsapp-web.js');
const http = require('http');
const qrcode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

try { require('dotenv').config(); } catch {}

const PORT = parseInt(process.env.WHATSAPP_PORT || '3001');
const LINKING_CODE = 'EDUGEST1';

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

function findBrowserPath() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of candidates) { if (fs.existsSync(p)) return p; }
  return undefined;
}

const BROWSER_PATH = findBrowserPath();
if (BROWSER_PATH) console.log('[WA] Browser:', BROWSER_PATH);

let client = null;
let status = 'disconnected';
let connectedPhone = null;
let verified = false;
let verifyPhone = null;
let starting = false;
let qrData = null;
let otpEntry = null;
let clientReady = false;
let pairingError = null;

function destroyClient() {
  if (client) { try { client.destroy(); } catch {} client = null; }
  status = 'disconnected';
  connectedPhone = null;
  verified = false;
  verifyPhone = null;
  starting = false;
  clientReady = false;
  qrData = null;
  otpEntry = null;
  pairingError = null;
}

function initClient() {
  if (starting) { console.log('[WA] Deja en cours de demarrage...'); return; }
  if (client) { console.log('[WA] Client existant, destruction...'); destroyClient(); }
  starting = true;
  clientReady = false;
  qrData = null;
  pairingError = null;
  status = 'connecting';
  console.log('[WA] Demarrage du client WhatsApp...');
  console.log('[WA] Navigateur:', BROWSER_PATH || 'defaut');

  try {
    client = new Client({
      authStrategy: new LocalAuth({ dataPath: path.join(__dirname, 'whatsapp-auth') }),
      puppeteer: {
        headless: true,
        executablePath: BROWSER_PATH || undefined,
        protocolTimeout: 120000,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      },
    });

    client.on('qr', async (qr) => {
      console.log('[WA] QR recu, conversion...');
      status = 'connecting';
      try {
        qrData = await qrcode.toDataURL(qr);
        console.log('[WA] QR pret, longueur:', qrData.length);
      } catch (e) { console.error('[WA] Erreur conversion QR:', e.message); }
    });

    client.on('ready', () => {
      console.log('[WA] Connecte!');
      status = 'connected';
      starting = false;
      clientReady = true;
      qrData = null;
      if (client.info && client.info.wid) connectedPhone = client.info.wid.user;
    });

    client.on('authenticated', () => console.log('[WA] Authentifie'));
    client.on('auth_failure', (msg) => { console.error('[WA] Echec auth:', msg); pairingError = msg; destroyClient(); });
    client.on('disconnected', (reason) => { console.log('[WA] Deconnecte:', reason); pairingError = reason; destroyClient(); });
    client.on('error', (err) => console.error('[WA] Erreur client:', err.message));

    client.initialize().then(() => {
      console.log('[WA] Client initialise, attente QR ou pret...');
    }).catch(e => {
      console.error('[WA] Echec init:', e.message);
      destroyClient();
    });
  } catch (e) {
    console.error('[WA] Echec creation client:', e.message);
    destroyClient();
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
      initClient();
      json({ ok: true, status });

    // ─── POST /pair ─────────────────────────────────────────────────────────
    } else if (url.pathname === '/pair' && req.method === 'POST') {
      const body = await readBody(req);
      const { phone } = JSON.parse(body || '{}');
      if (!phone) return json({ ok: false, error: 'Numero requis' });

      const phoneClean = phone.replace(/[^0-9]/g, '');
      console.log('[WA] ===== DEMANDE PARRAINAGE pour', phoneClean, '=====');

      // 1) Si un client tourne deja, tenter requestPairingCode directement
      if (client && client.pupPage && (status === 'connecting' || status === 'connected')) {
        console.log('[WA] Client deja en cours (status=' + status + '), tentative directe...');
        try {
          const code = await client.requestPairingCode(phoneClean);
          console.log('[WA] ===== CODE PARRAINAGE:', code, '=====');
          return json({ ok: true, pairingCode: code });
        } catch (e) {
          console.error('[WA] Tentative directe echouee:', e.message);
        }
      }

      // 2) Sinon, detruire le client existant
      if (client) {
        console.log('[WA] Destruction du client existant...');
        destroyClient();
        await new Promise(r => setTimeout(r, 1500));
      }

      // 3) Nettoyer les sessions WhatsApp
      const sessionDir = path.join(__dirname, 'whatsapp-auth');
      if (fs.existsSync(sessionDir)) {
        console.log('[WA] Nettoyage des sessions...');
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
      }

      // 4) Demarrer un client frais
      console.log('[WA] Demarrage d\'un client frais...');
      pairingError = null;
      initClient();

      // 5) Attendre que pupPage soit disponible (max 45s)
      console.log('[WA] Attente du navigateur...');
      const pageStart = Date.now();
      while (Date.now() - pageStart < 45000) {
        if (client && client.pupPage) {
          console.log('[WA] Navigateur pret apres', Date.now() - pageStart, 'ms');
          break;
        }
        if (pairingError) {
          return json({ ok: false, error: 'Client plante: ' + pairingError + '. Reessayez.' });
        }
        await new Promise(r => setTimeout(r, 500));
      }

      if (!client || !client.pupPage) {
        return json({ ok: false, error: 'Navigateur non disponible (timeout 45s).' });
      }

      // 6) Attendre que WhatsApp Web soit charge (max 30s)
      console.log('[WA] Attente du chargement WhatsApp Web...');
      const loadStart = Date.now();
      while (Date.now() - loadStart < 30000) {
        try {
          const loaded = await client.pupPage.evaluate(() => {
            return !!(window.AuthStore && window.AuthStore.PairingCodeLinkUtils);
          });
          if (loaded) {
            console.log('[WA] WhatsApp Web + AuthStore.PairingCodeLinkUtils charges apres', Date.now() - loadStart, 'ms');
            break;
          }
        } catch {}
        if (pairingError) {
          return json({ ok: false, error: 'Client plante: ' + pairingError + '. Reessayez.' });
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      // 7) Appeler requestPairingCode
      console.log('[WA] Demande du code de parrainage...');
      try {
        const code = await client.requestPairingCode(phoneClean);
        console.log('[WA] ===== CODE PARRAINAGE:', code, '=====');
        json({ ok: true, pairingCode: code });
      } catch (e) {
        console.error('[WA] Erreur requestPairingCode:', e.message);
        json({ ok: false, error: 'Code indisponible: ' + e.message });
      }

    // ─── POST /generate-otp ─────────────────────────────────────────────────
    } else if (url.pathname === '/generate-otp' && req.method === 'POST') {
      const body = await readBody(req);
      const { phone } = JSON.parse(body || '{}');
      if (!client || status !== 'connected') return json({ ok: false, error: 'Bot non connecte.' });
      if (!phone) return json({ ok: false, error: 'Numero requis' });
      const otp = generateOTP();
      const phoneKey = phone.replace(/[^0-9]/g, '');
      const chatId = phoneKey + '@c.us';
      const message = `🔐 Code de vérification EduGest\n\nVotre code OTP est : *${otp}*\n\nValable pendant 5 minutes.`;
      try {
        await Promise.race([client.sendMessage(chatId, message), new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 15000))]);
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

    // ─── GET /debug-modules ─────────────────────────────────────────────────
    } else if (url.pathname === '/debug-modules' && req.method === 'GET') {
      if (!client || !client.pupPage) return json({ ok: false, error: 'Pas de client' });
      try {
        const modules = await client.pupPage.evaluate(() => {
          const results = {};
          const moduleNames = ['WAWebAltDeviceLinkingApi', 'WAWebSocketModel', 'WAWebCmd', 'WAWebConnModel', 'WABase64', 'WAWebCompanionRegClientUtils', 'WAWebAdvSignatureApi', 'WAWebUserPrefsInfoStore', 'WAWebSignalStoreApi', 'WAWebPairingCode'];
          for (const name of moduleNames) {
            try { results[name] = typeof window.require(name); } catch { results[name] = 'not found'; }
          }
          try { results['AuthStore'] = window.AuthStore ? Object.keys(window.AuthStore) : 'undefined'; } catch { results['AuthStore'] = 'error'; }
          return results;
        });
        json({ ok: true, modules });
      } catch (e) { json({ ok: false, error: e.message }); }

    // ─── POST /send ─────────────────────────────────────────────────────────
    } else if (url.pathname === '/send' && req.method === 'POST') {
      const body = await readBody(req);
      const { phone, message } = JSON.parse(body || '{}');
      if (!client || status !== 'connected') return json({ ok: false, error: 'Non connecte' });
      const chatId = phone.replace(/[^0-9]/g, '') + '@c.us';
      await Promise.race([client.sendMessage(chatId, message), new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 15000))]);
      console.log('[WA] Message envoye a', phone);
      json({ ok: true });

    // ─── POST /logout ───────────────────────────────────────────────────────
    } else if (url.pathname === '/logout' && req.method === 'POST') {
      if (client) { try { client.logout(); } catch {} }
      destroyClient();
      const sessionDir = path.join(__dirname, 'whatsapp-auth');
      if (fs.existsSync(sessionDir)) {
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
      }
      json({ ok: true });

    } else {
      res.writeHead(404); res.end('Not found');
    }
  } catch (e) {
    console.error('[WA] Erreur serveur:', e.message);
    json({ ok: false, error: e.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log('[WA] Serveur sur http://localhost:' + PORT);
  console.log('[WA] Code de liaison:', LINKING_CODE);
  destroyClient();
  console.log('[WA] Pret — en attente d\'une demande /start ou /pair...');
});
server.on('error', (err) => console.error('[WA] Erreur serveur:', err.message));
process.on('uncaughtException', (err) => console.error('[WA] Exception:', err.message));
