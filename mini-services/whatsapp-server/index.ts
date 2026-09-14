/**
 * EduGest WhatsApp Server — natsu-baileys-v10 edition
 * Implémentation basée sur https://github.com/kinggggg444/natsu-baileys-v10
 *   ⚡ Pairing code rapide : 5 tentatives avec backoff, format XXXX-XXXX
 *   🛡️ Anti-logout : reconnexion sur 401/405/408/428/500/502/503/515/516 (fatal : 403)
 *   🚫 Zéro délai : retryRequestDelayMs 100ms
 * Port fixe : 3001 — démarré via `bun run dev` (bun --hot)
 */
import makeWASocketBase, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers,
  WASocket,
  DisconnectReason,
} from '@trashcore/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3001;
const AUTH_DIR = path.resolve(__dirname, '..', '..', 'whatsapp-auth');

const API_KEY = process.env.WHATSAPP_API_KEY || 'edugest-wa-dev-key';
const ALLOWED_ORIGINS = (process.env.WHATSAPP_CORS_ORIGINS || '*')
  .split(',').map(s => s.trim()).filter(Boolean);

// ─── natsu-baileys-v10 : codes de reconnexion anti-logout ───────────────────
// 401 (loggedOut-ish), 405, 408 (timedOut), 428, 500, 502, 503 (serviceUnavailable),
// 515 (restart), 516 (connectionReplaced partiel) → RECONNECTER (jamais supprimer la session)
const RECONNECT_CODES = new Set<number>([
  401, 405, 408, 428, 500, 502, 503, 515, 516,
]);
// 403 (connectionForbidden / banni) → FATAL uniquement
const FATAL_CODES = new Set<number>([403]);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Résout avec une erreur si `promise` ne se règle pas dans `ms` millisecondes. */
function withTimeout<T>(promise: Promise<T>, ms: number, label = 'opération'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Délai dépassé (${label}, ${ms}ms)`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// Logger silencieux (natsu silentLogger) — pas de pino requis
function silentLogger() {
  const noop = () => {};
  const child = () => silentLogger();
  return { info: noop, debug: noop, warn: noop, error: noop, trace: noop, fatal: noop, child };
}
const logger = silentLogger();

// ─── État global ─────────────────────────────────────────────────────────────
let sock: WASocket | null = null;
let qrDataUrl: string | null = null;
let pairingCode: string | null = null;
let pairingPhone: string | null = null;
let connectedPhone: string | null = null;
let connectionStatus: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectDelay = 5000;
// Dernière fermeture (code + horodatage) — sert au fail-fast du rate-limit 428
let lastCloseInfo: { code: number; at: number } | null = null;
let destroyed = false;
let consecutiveLoggedOut = 0;
let failedCycles = 0;   // cycles fermés sans jamais atteindre 'open' (session invalide)
let everOpened = false; // la session courante a-t-elle déjà atteint l'état 'open' ?

// Réinitialise la session (supprime les credentials) pour repartir sur un lien neuf
function wipeSession(): void {
  try {
    for (const f of fs.readdirSync(AUTH_DIR)) {
      fs.rmSync(path.join(AUTH_DIR, f), { force: true, recursive: true });
    }
    console.log('[WhatsApp] Session réinitialisée (credentials supprimés).');
  } catch { /* dossier vide ou inexistant */ }
}

// ─── natsu-baileys-v10 : makeWASocket avec defaults optimisés ───────────────
async function makeWASocketNatsu(authState: { creds: any; keys: any }) {
  let version: { version: [number, number, number]; isLatest: boolean } | undefined;
  try { version = (await fetchLatestBaileysVersion()).version ? await fetchLatestBaileysVersion() : undefined; } catch { version = undefined; }

  const browser = (() => {
    try {
      const mac = Browsers.macOS('Natsu');
      if (typeof (mac as any)?.[1] === 'string') return mac;
    } catch { /* fallback */ }
    return ['Ubuntu', 'Chrome', '120.0.0'];
  })();

  const socket = makeWASocketBase({
    version: (version as any)?.version,
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, logger as any),
    },
    connectTimeoutMs: 30_000,        // 0x7530 natsu
    defaultQueryTimeoutMs: 20_000,   // 0x4e20 natsu
    keepAliveIntervalMs: 10_000,     // 0x2710 natsu
    retryRequestDelayMs: 100,        // 0x64  natsu — zéro délai
    maxMsgRetryCount: 5,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    browser: browser as any,
    logger: logger as any,
  });
  return socket;
}

// ─── natsu-baileys-v10 : requestPairingCode patché (5 essais + backoff) ─────
async function requestPairingCodeNatsu(phoneNumber: string): Promise<string> {
  const cleaned = String(phoneNumber).replace(/[^0-9]/g, '');
  if (!cleaned || cleaned.length < 7) {
    throw new Error('Numéro de téléphone invalide (min. 7 chiffres)');
  }
  if (!sock || typeof (sock as any).requestPairingCode !== 'function') {
    throw new Error('Client WhatsApp non prêt');
  }
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      // ⚡ à chaque tentative, on résout le socket COURANT : s'il a été fermé et
      // remplacé par la reconnexion anti-logout, on utilise le nouveau socket.
      const currentSock: any = sock;
      if (!currentSock || typeof currentSock.requestPairingCode !== 'function') {
        throw new Error('Client WhatsApp fermé — attente de reconnexion');
      }
      const code = await withTimeout(Promise.resolve(currentSock.requestPairingCode(cleaned)), 12_000, 'requestPairingCode');
      if (code) {
        // natsu : formate XXXX-XXXX si code brut à 8 caractères
        if (/^[A-Z0-9]{8}$/.test(String(code))) {
          return String(code).slice(0, 4) + '-' + String(code).slice(4);
        }
        return String(code);
      }
    } catch (e) {
      lastError = e;
      console.log(`[WhatsApp] Pairing tentative ${attempt}/5 échouée: ${(e as Error)?.message || e}`);
      if (attempt < 5) await sleep(2000 * attempt); // backoff natsu : 2s, 4s, 6s, 8s
    }
  }
  throw (lastError instanceof Error ? lastError : new Error('Échec de la demande de code de parrainage après 5 tentatives'));
}

// ─── Démarrage de la session WhatsApp ────────────────────────────────────────
async function startWhatsApp(): Promise<void> {
  if (sock) return;

  // eslint-disable-next-line react-hooks/rules-of-hooks -- fonction Baileys, pas un hook React
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = await makeWASocketNatsu({ creds: (state as any).creds, keys: (state as any).keys });
  pairingCode = null;
  pairingPhone = null;
  everOpened = false;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 512 });
      connectionStatus = 'connecting';
      console.log('[WhatsApp] QR prêt — scan ou code de parrainage disponible.');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
        ?? lastDisconnect?.error?.data?.disconnect?.statusCode
        ?? lastDisconnect?.error?.statusCode ?? 0;

      // natsu : FATAL (403) → stop ; RECONNECT_CODES → reconnexion anti-logout
      if (FATAL_CODES.has(statusCode)) {
        console.log(`[WhatsApp] Déconnexion FATALE (code ${statusCode}). Session stoppée.`);
        sock = null;
        qrDataUrl = null;
        pairingCode = null;
        connectionStatus = 'disconnected';
        return;
      }

      console.log(`[WhatsApp] Fermé (code ${statusCode}). Reconnexion programmée (anti-logout natsu).`);
      lastCloseInfo = { code: statusCode, at: Date.now() };
      sock = null;
      qrDataUrl = null;
      pairingCode = null;
      connectionStatus = 'disconnected';

      if (statusCode === DisconnectReason.loggedOut) {
        consecutiveLoggedOut++;
        console.log(`[WhatsApp] loggedOut (401) ${consecutiveLoggedOut}/3 — conservation de la session (anti-logout).`);
      } else {
        consecutiveLoggedOut = 0;
      }

      // Anti-boucle : si la session n'a JAMAIS atteint 'open' et enchaîne les
      // fermetures (428/401 alternés), les creds sont invalides → réinitialisation.
      if (!everOpened) {
        failedCycles++;
        if (failedCycles >= 3) {
          failedCycles = 0;
          consecutiveLoggedOut = 0;
          console.log('[WhatsApp] 3 cycles fermés sans connexion ouverte — réinitialisation de la session.');
          wipeSession();
          reconnectDelay = 5000;
        }
      }

      if (reconnectTimer) clearTimeout(reconnectTimer);
      const delay = Math.min(reconnectDelay, 60_000);
      reconnectDelay = Math.min(reconnectDelay * 1.5, 60_000); // backoff exponentiel natsu (max 60s)
      if (!destroyed) reconnectTimer = setTimeout(() => startWhatsApp(), delay);
      return;
    }

    if (connection === 'open') {
      reconnectDelay = 5000; // reset backoff natsu
      consecutiveLoggedOut = 0;
      failedCycles = 0;
      everOpened = true;
      qrDataUrl = null;
      connectionStatus = 'connected';
      try {
        connectedPhone = (sock as any)?.user?.id?.split(':')[0]?.split('@')[0] || null;
      } catch { connectedPhone = null; }
      console.log(`[WhatsApp] Connecté !${connectedPhone ? ' Numéro : ' + connectedPhone : ''}`);
    }

    if (connection === 'connecting') {
      connectionStatus = 'connecting';
    }
  });

  sock.ev.on('messages.upsert', (upsert: any) => {
    for (const msg of upsert.messages || []) {
      if (!msg.key.fromMe && msg.message) {
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (text) console.log(`[WhatsApp] ${msg.key.remoteJid}: ${String(text).slice(0, 80)}`);
      }
    }
  });
}

// Attend que le socket atteigne un état donné (QR prêt ou connecté)
function waitForLinking(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (connectionStatus === 'connected') return resolve();
      if (qrDataUrl || connectionStatus === 'connecting') {
        // QR disponible → le client est en phase de liaison
        if (typeof (sock as any)?.requestPairingCode === 'function') return resolve();
      }
      if (!sock) return reject(new Error('Client WhatsApp non démarré'));
      if (Date.now() - started > timeoutMs) return reject(new Error('Délai dépassé pour initialiser le client WhatsApp'));
      setTimeout(check, 500);
    };
    check();
  });
}

async function sendMessage(phone: string, message: string): Promise<boolean> {
  if (!sock || connectionStatus !== 'connected') return false;
  try {
    const jid = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await sock.sendMessage(jid, { text: message });
    console.log(`[WhatsApp] Envoyé à ${phone}`);
    return true;
  } catch (error) {
    console.error('[WhatsApp] Échec envoi :', (error as Error)?.message);
    return false;
  }
}

// Envoi d'un document (PDF, image…) avec légende optionnelle
async function sendDocument(params: {
  phone: string;
  fileBase64: string;
  filename: string;
  mimetype?: string;
  caption?: string;
}): Promise<boolean> {
  if (!sock || connectionStatus !== 'connected') return false;
  try {
    const jid = params.phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    const buffer = Buffer.from(params.fileBase64, 'base64');
    if (buffer.length === 0) return false;
    // Limite de sécurité WhatsApp : ~100 Mo, on borne à 16 Mo ici
    if (buffer.length > 16 * 1024 * 1024) {
      console.error('[WhatsApp] Document trop volumineux (>16 Mo)');
      return false;
    }
    await sock.sendMessage(jid, {
      document: buffer,
      fileName: params.filename || 'document.pdf',
      mimetype: params.mimetype || 'application/pdf',
      caption: params.caption || undefined,
    });
    console.log(`[WhatsApp] Document ${params.filename} envoyé à ${params.phone} (${Math.round(buffer.length / 1024)} Ko)`);
    return true;
  } catch (error) {
    console.error('[WhatsApp] Échec envoi document :', (error as Error)?.message);
    return false;
  }
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────
function isAuthorized(req: http.IncomingMessage): boolean {
  const provided = req.headers['x-api-key'];
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(API_KEY);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (!isAuthorized(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Non autorisé' }));
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const json = (code: number, data: any) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  try {
    if (url.pathname === '/status') {
      return json(200, {
        status: connectionStatus,
        qr: qrDataUrl,
        connectedPhone,
        pairingCode,
        pairingPhone,
        server: 'natsu-baileys-v10',
      });
    }

    if (url.pathname === '/start' && req.method === 'POST') {
      await startWhatsApp();
      return json(200, { ok: true, status: connectionStatus, qr: qrDataUrl });
    }

    // ⚡ natsu-baileys-v10 : génération du code de parrainage (5 essais + backoff)
    if (url.pathname === '/pair' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const phone = String(body.phone || '').replace(/[^0-9]/g, '');

      if (!phone || phone.length < 7) {
        return json(400, { ok: false, error: 'Numéro de téléphone invalide (format international, ex: 2438XXXXXXXX)' });
      }
      if (connectionStatus === 'connected') {
        return json(409, { ok: false, error: 'WhatsApp est déjà connecté. Déconnectez-vous d\'abord.' });
      }

      // Fail-fast : si WhatsApp vient de fermer en 428 (rate-limit), inutile de
      // brûler 2 minutes de retries — on répond immédiatement avec un message clair.
      if (lastCloseInfo && lastCloseInfo.code === 428 && Date.now() - lastCloseInfo.at < 20_000) {
        return json(429, {
          ok: false,
          error: 'WhatsApp limite les demandes de code (rate-limit 428). Patientez quelques minutes puis réessayez.',
          retryAfterMs: 120_000,
        });
      }

      // Si le client est dans un état mort (fermé, en attente de reconnexion avec
      // creds potentiellement invalides), on repart sur une session neuve pour
      // garantir une phase de liaison fonctionnelle.
      if (!sock && connectionStatus === 'disconnected' && failedCycles > 0) {
        console.log('[WhatsApp] État instable détecté — nouvelle session pour le pairing.');
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        wipeSession();
        failedCycles = 0;
        consecutiveLoggedOut = 0;
        reconnectDelay = 5000;
      }

      // Démarre le client si nécessaire, attend la phase de liaison
      if (!sock) {
        await startWhatsApp();
      }
      try {
        await waitForLinking(30_000);
      } catch (e: any) {
        // Dernière chance : réinitialisation complète puis nouvel essai de liaison
        try {
          if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
          if (sock) { try { (sock as any).end?.(new Error('pair-retry')); } catch { /* ignore */ } sock = null; }
          wipeSession();
          failedCycles = 0;
          await startWhatsApp();
          await waitForLinking(30_000);
        } catch (e2: any) {
          return json(504, { ok: false, error: e2.message || 'Impossible d\'initialiser le client WhatsApp' });
        }
      }

      try {
        const code = await requestPairingCodeNatsu(phone);
        pairingCode = code;
        pairingPhone = phone;
        console.log(`[WhatsApp] Code de parrainage généré pour +${phone} : ${code}`);
        return json(200, { ok: true, pairingCode: code, phone, status: connectionStatus });
      } catch (e: any) {
        console.error('[WhatsApp] Échec pairing :', e?.message);
        return json(500, { ok: false, error: e?.message || 'Impossible de générer le code de parrainage' });
      }
    }

    if (url.pathname === '/send' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const ok = await sendMessage(body.phone, body.message);
      return json(200, { ok });
    }

    // Envoi de document (bulletins PDF, pièces jointes…)
    if (url.pathname === '/send-document' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.phone || !body.fileBase64) {
        return json(400, { ok: false, error: 'phone et fileBase64 sont requis' });
      }
      const ok = await sendDocument({
        phone: String(body.phone),
        fileBase64: String(body.fileBase64),
        filename: String(body.filename || 'document.pdf'),
        mimetype: body.mimetype ? String(body.mimetype) : 'application/pdf',
        caption: body.caption ? String(body.caption) : undefined,
      });
      return json(200, { ok });
    }

    if (url.pathname === '/logout' && req.method === 'POST') {
      destroyed = false;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (sock) {
        try { await (sock as any).logout(); } catch { /* ignore */ }
        try { (sock as any).end?.(new Error('logout')); } catch { /* ignore */ }
        sock = null;
      }
      wipeSession(); // un vrai logout efface les credentials
      qrDataUrl = null;
      pairingCode = null;
      pairingPhone = null;
      connectedPhone = null;
      connectionStatus = 'disconnected';
      return json(200, { ok: true });
    }

    // Réinitialisation manuelle de la session (sans tentative de logout réseau)
    if (url.pathname === '/reset' && req.method === 'POST') {
      destroyed = false;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (sock) {
        try { (sock as any).end?.(new Error('reset')); } catch { /* ignore */ }
        sock = null;
      }
      wipeSession();
      consecutiveLoggedOut = 0;
      reconnectDelay = 5000;
      qrDataUrl = null;
      pairingCode = null;
      pairingPhone = null;
      connectedPhone = null;
      connectionStatus = 'disconnected';
      // Relance immédiate d'un client neuf (QR + pairing disponibles)
      startWhatsApp().catch(() => {});
      return json(200, { ok: true, status: connectionStatus });
    }

    return json(404, { ok: false, error: 'Not found' });
  } catch (e: any) {
    return json(500, { ok: false, error: e?.message || 'Erreur interne' });
  }
});

server.listen(PORT, () => {
  console.log(`[WhatsApp Server] natsu-baileys-v10 démarré sur le port ${PORT}`);
  console.log(`[WhatsApp Server] Auth dir: ${AUTH_DIR}`);
  startWhatsApp().catch(e => console.error('[WhatsApp] Erreur au démarrage :', e?.message));
});
