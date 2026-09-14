/**
 * EduGest WhatsApp Server — natsu-baileys-v10 edition
 * Implémentation basée sur https://github.com/kinggggg444/natsu-baileys-v10
 *   ⚡ Pairing code rapide : 5 tentatives avec backoff, format XXXX-XXXX
 *   🛡️ Anti-logout : reconnexion sur 401/405/408/411/428/440/500/502/503/515/516
 *      (fatal : 403) — avec garde-fous anti-boucle infinie
 *   🚫 Zéro délai : retryRequestDelayMs 100ms
 *   🔒 Version Baileys récupérée UNE seule fois par process (cache)
 *   🔒 Un seul socket par session (garde anti-condition-de-course)
 *   🔒 Rate-limit proactif sur /pair + masquage des codes dans les logs
 * Port fixe : 3001 — démarré via `bun run dev` (bun --hot)
 */
import makeWASocketBase, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
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
// Dossier de session : priorité à WHATSAPP_AUTH_DIR (utile en Docker),
// sinon <racine du projet>/whatsapp-auth (gitignoré, jamais commité).
const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR
  ? path.resolve(process.env.WHATSAPP_AUTH_DIR)
  : path.resolve(__dirname, '..', '..', 'whatsapp-auth');

const API_KEY = process.env.WHATSAPP_API_KEY || 'edugest-wa-dev-key';
const ALLOWED_ORIGINS = (process.env.WHATSAPP_CORS_ORIGINS || '*')
  .split(',').map(s => s.trim()).filter(Boolean);

// ─── natsu-baileys-v10 : stratégie de reconnexion ────────────────────────────
// Codes temporaires → RECONNECTER avec backoff (jamais supprimer la session) :
// 401 (loggedOut — conservé volontairement : anti-logout natsu, voir garde-fou),
// 405, 408 (timedOut / connectionLost), 411 (multideviceMismatch), 428
// (connectionClosed), 440 (connectionReplaced), 500 (badSession), 502, 503
// (serviceUnavailable), 515 (restartRequired), 516.
const RECONNECT_CODES = new Set<number>([
  401, 405, 408, 411, 428, 440, 500, 502, 503, 515, 516,
]);
// 403 (connectionForbidden / banni) → FATAL : arrêt propre, pas de reconnexion.
const FATAL_CODES = new Set<number>([403]);

// Garde-fous anti-boucle infinie :
const MAX_RECONNECT_DELAY_MS = 60_000;
const MAX_CONSECUTIVE_LOGGED_OUT = 5;  // après N×401 consécutifs : stop auto-reconnexion
const MAX_FAILED_CYCLES = 3;           // N cycles fermés sans jamais atteindre 'open' → wipe

// Rate-limit proactif du pairing (WhatsApp bannît les demandes trop fréquentes) :
const PAIR_MIN_INTERVAL_MS = 30_000;

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

// ─── Version Baileys : UN SEUL appel réseau par process ─────────────────────
// fetchLatestBaileysVersion() interroge les serveurs WhatsApp ; le résultat est
// mis en cache et réutilisé à chaque (re)création de socket.
let cachedBaileysVersion: { version: [number, number, number]; isLatest: boolean } | undefined;
async function getBaileysVersion(): Promise<{ version: [number, number, number]; isLatest: boolean } | undefined> {
  if (cachedBaileysVersion) return cachedBaileysVersion;
  try {
    cachedBaileysVersion = await fetchLatestBaileysVersion();
    console.log(`[WhatsApp] Version Baileys WA: ${cachedBaileysVersion.version.join('.')} (cached)`);
  } catch {
    // Offline → undefined : Baileys utilisera sa version embarquée par défaut.
  }
  return cachedBaileysVersion;
}

// ─── État global ─────────────────────────────────────────────────────────────
let sock: WASocket | null = null;
let startingPromise: Promise<void> | null = null; // garde-fou : jamais 2 sockets concurrents
let qrDataUrl: string | null = null;
let pairingCode: string | null = null;
let pairingPhone: string | null = null;
let connectedPhone: string | null = null;
let connectionStatus: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectDelay = 5000;
// Dernière fermeture (code + horodatage) — sert au fail-fast du rate-limit 428
let lastCloseInfo: { code: number; at: number } | null = null;
let consecutiveLoggedOut = 0;
let failedCycles = 0;   // cycles fermés sans jamais atteindre 'open' (session invalide)
let everOpened = false; // la session courante a-t-elle déjà atteint l'état 'open' ?
let lastPairRequestAt = 0;      // rate-limit proactif /pair
let pairingInFlight = false;    // une seule demande de pairing à la fois

/** Masque un code de pairing pour les logs (ne jamais logger un code complet). */
function maskPairingCode(code: string): string {
  const raw = code.replace(/[^A-Z0-9]/gi, '');
  if (raw.length === 8) return raw.slice(0, 4) + '-••••';
  return code.length > 4 ? code.slice(0, code.length - 4) + '••••' : '••••••';
}

/** Nettoie et valide un numéro au format international (E.164 sans '+'). */
function validatePhone(input: unknown): { ok: boolean; cleaned?: string; error?: string } {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, error: 'Numéro de téléphone requis' };
  let cleaned = raw.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('00')) cleaned = cleaned.slice(2); // 00 → international
  cleaned = cleaned.replace(/[^0-9]/g, '');
  if (!/^\d{7,15}$/.test(cleaned)) {
    return { ok: false, error: 'Numéro invalide : format international requis, 7 à 15 chiffres (ex: 243812345678)' };
  }
  if (cleaned.startsWith('0')) {
    return { ok: false, error: 'Format local détecté (0 initial). Utilisez le format international sans le 0 (ex: 243812345678)' };
  }
  return { ok: true, cleaned };
}

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
  const version = (await getBaileysVersion())?.version;

  // NB : Browsers.* est inexploitable dans @trashcore/baileys 4.2.2 (build
  // minifié) → identifiant navigateur stable explicite, compatible Web multi-device.
  const browser = ['Ubuntu', 'Chrome', '120.0.0'];

  const socket = makeWASocketBase({
    version,
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
      const code = await withTimeout(Promise.resolve(currentSock.requestPairingCode(phoneNumber)), 12_000, 'requestPairingCode');
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

// ─── Démarrage de la session WhatsApp (singleton strict) ─────────────────────
async function startWhatsApp(): Promise<void> {
  if (sock) return;
  if (startingPromise) return startingPromise; // anti double-socket (course /pair ↔ reconnexion)

  startingPromise = (async () => {
    try {
      // eslint-disable-next-line react-hooks/rules-of-hooks -- fonction Baileys, pas un hook React
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      if (sock) return; // un autre appel a déjà créé le socket pendant l'await

      const s = await makeWASocketNatsu({ creds: (state as any).creds, keys: (state as any).keys });
      sock = s;
      pairingCode = null;
      pairingPhone = null;
      everOpened = false;

      s.ev.on('creds.update', saveCreds);

      s.ev.on('connection.update', async (update: any) => {
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

          // On ne neutralise le socket global que si c'est bien CE socket qui meurt
          // (un socket plus récent n'est pas invalidé par un ancien handler).
          if (sock === s) sock = null;
          qrDataUrl = null;
          pairingCode = null;
          connectedPhone = null;
          connectionStatus = 'disconnected';

          // natsu : FATAL (403) → stop définitif, aucune reconnexion
          if (FATAL_CODES.has(statusCode)) {
            console.log(`[WhatsApp] Déconnexion FATALE (code ${statusCode}). Session stoppée — utilisez /reset pour repartir de zéro.`);
            return;
          }

          console.log(`[WhatsApp] Fermé (code ${statusCode}). Reconnexion programmée (anti-logout natsu).`);
          lastCloseInfo = { code: statusCode, at: Date.now() };

          // Anti-boucle loggedOut : après MAX_CONSECUTIVE_LOGGED_OUT fermetures
          // 401 consécutives, on arrête la reconnexion automatique (session
          // conservée). /start retente, /reset repart sur un lien neuf.
          if (statusCode === DisconnectReason.loggedOut) {
            consecutiveLoggedOut++;
            console.log(`[WhatsApp] loggedOut (401) ${consecutiveLoggedOut}/${MAX_CONSECUTIVE_LOGGED_OUT} — conservation de la session (anti-logout).`);
            if (consecutiveLoggedOut >= MAX_CONSECUTIVE_LOGGED_OUT) {
              console.log('[WhatsApp] Trop de déconnexions « loggedOut » consécutives — reconnexion automatique stoppée (pas de boucle infinie). Session conservée : /start pour retenter, /reset pour refaire un lien.');
              return;
            }
          } else {
            consecutiveLoggedOut = 0;
          }

          // Anti-boucle : si la session n'a JAMAIS atteint 'open' et enchaîne les
          // fermetures (428/401 alternés), les creds sont invalides → réinitialisation.
          if (!everOpened) {
            failedCycles++;
            if (failedCycles >= MAX_FAILED_CYCLES) {
              failedCycles = 0;
              consecutiveLoggedOut = 0;
              console.log('[WhatsApp] 3 cycles fermés sans connexion ouverte — réinitialisation de la session.');
              wipeSession();
              reconnectDelay = 5000;
            }
          }

          if (reconnectTimer) clearTimeout(reconnectTimer);
          const delay = Math.min(reconnectDelay, MAX_RECONNECT_DELAY_MS);
          reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY_MS); // backoff (max 60s)
          reconnectTimer = setTimeout(() => { startWhatsApp().catch(() => {}); }, delay);
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
            connectedPhone = (s as any)?.user?.id?.split(':')[0]?.split('@')[0] || null;
          } catch { connectedPhone = null; }
          console.log(`[WhatsApp] Connecté !${connectedPhone ? ' Numéro : ' + connectedPhone : ''}`);
        }

        if (connection === 'connecting') {
          connectionStatus = 'connecting';
        }
      });

      s.ev.on('messages.upsert', (upsert: any) => {
        for (const msg of upsert.messages || []) {
          if (!msg.key.fromMe && msg.message) {
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            if (text) console.log(`[WhatsApp] ${msg.key.remoteJid}: ${String(text).slice(0, 80)}`);
          }
        }
      });
    } finally {
      startingPromise = null;
    }
  })();
  return startingPromise;
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
      consecutiveLoggedOut = 0; // relance manuelle : on repart à zéro
      await startWhatsApp();
      return json(200, { ok: true, status: connectionStatus, qr: qrDataUrl });
    }

    // ⚡ natsu-baileys-v10 : génération du code de parrainage (5 essais + backoff)
    if (url.pathname === '/pair' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');

      // 1) Validation stricte du numéro (format international)
      const validation = validatePhone(body.phone);
      if (!validation.ok) {
        return json(400, { ok: false, error: validation.error });
      }
      const phone = validation.cleaned!;

      // 2) Déjà connecté ?
      if (connectionStatus === 'connected') {
        return json(409, { ok: false, error: 'WhatsApp est déjà connecté. Déconnectez-vous d\'abord.' });
      }

      // 3) Rate-limit proactif : une seule demande de code par intervalle,
      //    et jamais deux demandes concurrentes.
      const sinceMs = lastPairRequestAt > 0 ? Date.now() - lastPairRequestAt : Infinity;
      if (pairingInFlight) {
        return json(409, { ok: false, error: 'Une demande de code de parrainage est déjà en cours.' });
      }
      if (sinceMs < PAIR_MIN_INTERVAL_MS) {
        const retryAfterMs = PAIR_MIN_INTERVAL_MS - sinceMs;
        return json(429, {
          ok: false,
          error: `Trop de demandes de code — réessayez dans ${Math.ceil(retryAfterMs / 1000)}s.`,
          retryAfterMs,
        });
      }

      // 4) Fail-fast : si WhatsApp vient de fermer en 428 (rate-limit), inutile
      //    de brûler 2 minutes de retries — réponse immédiate et claire.
      if (lastCloseInfo && lastCloseInfo.code === 428 && Date.now() - lastCloseInfo.at < 20_000) {
        return json(429, {
          ok: false,
          error: 'WhatsApp limite les demandes de code (rate-limit 428). Patientez quelques minutes puis réessayez.',
          retryAfterMs: 120_000,
        });
      }

      // 5) Si le client est dans un état mort (fermé, en attente de reconnexion
      //    avec creds potentiellement invalides), on repart sur une session neuve.
      if (!sock && connectionStatus === 'disconnected' && failedCycles > 0) {
        console.log('[WhatsApp] État instable détecté — nouvelle session pour le pairing.');
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        wipeSession();
        failedCycles = 0;
        consecutiveLoggedOut = 0;
        reconnectDelay = 5000;
      }

      // 6) Démarre le client si nécessaire (singleton), attend la phase de liaison
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

      // 7) Demande du code (1 seule à la fois, rate-limitée)
      pairingInFlight = true;
      lastPairRequestAt = Date.now();
      try {
        const code = await requestPairingCodeNatsu(phone);
        pairingCode = code;
        pairingPhone = phone;
        // ⚠️ Le code complet n'est JAMAIS loggé (masqué) — il est renvoyé
        // uniquement dans la réponse HTTP authentifiée.
        console.log(`[WhatsApp] Code de parrainage généré pour +${phone} : ${maskPairingCode(code)}`);
        return json(200, { ok: true, pairingCode: code, phone, status: connectionStatus });
      } catch (e: any) {
        console.error('[WhatsApp] Échec pairing :', e?.message);
        return json(500, { ok: false, error: e?.message || 'Impossible de générer le code de parrainage' });
      } finally {
        pairingInFlight = false;
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
      consecutiveLoggedOut = 0;
      connectionStatus = 'disconnected';
      return json(200, { ok: true });
    }

    // Réinitialisation manuelle de la session (sans tentative de logout réseau)
    if (url.pathname === '/reset' && req.method === 'POST') {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (sock) {
        try { (sock as any).end?.(new Error('reset')); } catch { /* ignore */ }
        sock = null;
      }
      wipeSession();
      consecutiveLoggedOut = 0;
      failedCycles = 0;
      lastCloseInfo = null;
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

// ─── Arrêt propre (Docker / Ctrl-C) : pas de socket orphelin, pas de reconnexion
function shutdown(): void {
  console.log('[WhatsApp Server] Arrêt propre...');
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  try { (sock as any)?.end?.(new Error('shutdown')); } catch { /* ignore */ }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
