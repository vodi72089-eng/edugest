import { db } from './db';
import { decryptSecret } from './gateway-keys';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION SMS — vérification par SMS (codes de réinitialisation,
// notifications). Fournisseurs supportés (offres d'essai gratuites) :
//   - Africa's Talking : sandbox gratuit — recommandé pour la RDC
//   - Twilio           : essai gratuit (crédits offerts) — api.twilio.com
//   - Vonage           : essai gratuit — rest.nexmo.com
//   - Webhook custom   : toute API SMS HTTP (POST { to, message })
// Stocké en base (GlobalApiConfig.SMS_CONFIG), configuré depuis
// Contrôle plateforme → « Communication & notifications ».
// ═══════════════════════════════════════════════════════════════════════════

const SMS_CONFIG_KEY = 'SMS_CONFIG';

// Champs secrets par fournisseur — SOURCE DE VÉRITÉ partagée (route sms-config
// et ce module) : ces champs sont CHIFFRÉS (AES-256-GCM) à l'écriture et
// DÉCHIFFRÉS à la lecture. En base, ils ne sont jamais lisibles en clair.
export const SMS_SECRET_FIELDS: Record<string, string[]> = {
  twilio: ['authToken'],
  africastalking: ['apiKey'],
  vonage: ['apiSecret'],
  custom: ['webhookToken'],
};

/** Déchiffre les champs secrets d'une config lue depuis la base (au memoire
 *  uniquement en clair, jamais ré-envoyée telle quelle au client). Les valeurs
 *  historiques non préfixées « enc:v1: » passent telles quelles (compat). */
function decryptConfigSecrets(cfg: SmsApiConfig): SmsApiConfig {
  const out: SmsApiConfig = { ...cfg };
  for (const p of Object.keys(SMS_SECRET_FIELDS)) {
    const section = { ...(out[p as keyof SmsApiConfig] as Record<string, string>) };
    for (const k of SMS_SECRET_FIELDS[p]) {
      if (section[k]) section[k] = decryptSecret(section[k]) ?? '';
    }
    (out[p as keyof SmsApiConfig] as Record<string, string>) = section;
  }
  return out;
}

export type SmsProvider = 'africastalking' | 'twilio' | 'vonage' | 'custom';

export interface SmsApiConfig {
  enabled: boolean;
  provider: SmsProvider;
  africastalking: { username: string; apiKey: string; senderId: string };
  twilio: { accountSid: string; authToken: string; fromPhone: string };
  vonage: { apiKey: string; apiSecret: string; from: string };
  custom: { webhookUrl: string; webhookToken: string };
}

export const DEFAULT_SMS_CONFIG: SmsApiConfig = {
  enabled: false,
  provider: 'africastalking',
  africastalking: { username: '', apiKey: '', senderId: '' },
  twilio: { accountSid: '', authToken: '', fromPhone: '' },
  vonage: { apiKey: '', apiSecret: '', from: '' },
  custom: { webhookUrl: '', webhookToken: '' },
};

export interface SmsResult {
  success: boolean;
  error?: string;
  provider?: SmsProvider;
}

// Africa's Talking : statuts « message accepté » (recipient.status).
// « Success » en sandbox, « Sent »/« Enqueued »/« Processed » selon la file —
// tout le reste (InvalidPhoneNumber, NotCached…) est un échec réel.
const OK_STATUSES = new Set(['success', 'sent', 'enqueued', 'processed']);

// ── Lecture de la configuration (cache 30 s pour éviter une requête DB
//    à chaque envoi) ─────────────────────────────────────────────────────────
let configCache: { value: SmsApiConfig | null; at: number } | null = null;

export async function getSmsApiConfig(force: boolean = false): Promise<SmsApiConfig | null> {
  if (!force && configCache && Date.now() - configCache.at < 30_000) {
    return configCache.value;
  }
  try {
    const row = await db.globalApiConfig.findUnique({ where: { key: SMS_CONFIG_KEY } });
    if (!row) {
      configCache = { value: null, at: Date.now() };
      return null;
    }
    const parsed = JSON.parse(row.value) as Partial<SmsApiConfig>;
    // Fusion avec les valeurs par défaut pour tolérer les clés manquantes
    const merged: SmsApiConfig = {
      ...DEFAULT_SMS_CONFIG,
      ...parsed,
      africastalking: { ...DEFAULT_SMS_CONFIG.africastalking, ...(parsed.africastalking || {}) },
      twilio: { ...DEFAULT_SMS_CONFIG.twilio, ...(parsed.twilio || {}) },
      vonage: { ...DEFAULT_SMS_CONFIG.vonage, ...(parsed.vonage || {}) },
      custom: { ...DEFAULT_SMS_CONFIG.custom, ...(parsed.custom || {}) },
    };
    // DÉCHIFFREMENT des secrets stockés (chiffrés à l'écriture) : la config en
    // mémoire est en clair pour l'envoi SMS — jamais renvoyée telle quelle.
    const decrypted = decryptConfigSecrets(merged);
    configCache = { value: decrypted, at: Date.now() };
    return decrypted;
  } catch (e) {
    console.warn('[SMS] Lecture config impossible:', e);
    return null;
  }
}

export function invalidateSmsConfigCache() {
  configCache = null;
}

// Normalisation légère : supprime espaces/tirets, 00 → +, ajoute + si absent
export function normalizePhone(to: string): string {
  let p = (to || '').trim().replace(/[\s\-().]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+')) p = '+' + p;
  return p;
}

// Vérifie que les identifiants du fournisseur actif sont complets
export function hasProviderCredentials(cfg: SmsApiConfig): boolean {
  switch (cfg.provider) {
    case 'twilio':
      return !!(cfg.twilio.accountSid && cfg.twilio.authToken && cfg.twilio.fromPhone);
    case 'africastalking':
      return !!(cfg.africastalking.username && cfg.africastalking.apiKey);
    case 'vonage':
      return !!(cfg.vonage.apiKey && cfg.vonage.apiSecret && cfg.vonage.from);
    case 'custom':
      return !!cfg.custom.webhookUrl;
    default:
      return false;
  }
}

export async function isSmsActive(): Promise<boolean> {
  const cfg = await getSmsApiConfig();
  return !!cfg && cfg.enabled && hasProviderCredentials(cfg);
}

// ── Envoi via le fournisseur configuré ──────────────────────────────────────
// cfgOverride : permet de tester des identifiants SAISIS (formulaire) sans
// les enregistrer — une clé invalide n'écrase jamais une config fonctionnante.
export async function sendSmsViaProvider(to: string, message: string, cfgOverride?: SmsApiConfig): Promise<SmsResult> {
  const cfg = cfgOverride ?? await getSmsApiConfig();
  if (!cfg) return { success: false, error: 'SMS non configuré (Contrôle plateforme → Communication & notifications)' };
  if (!cfg.enabled) return { success: false, error: "L'envoi de SMS est désactivé" };
  if (!hasProviderCredentials(cfg)) {
    return { success: false, error: 'Identifiants du fournisseur SMS incomplets', provider: cfg.provider };
  }

  const dest = normalizePhone(to);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    let ok = false;
    let errMsg = '';

    if (cfg.provider === 'twilio') {
      const sid = cfg.twilio.accountSid;
      const params = new URLSearchParams({
        To: dest,
        From: cfg.twilio.fromPhone.startsWith('+') ? cfg.twilio.fromPhone : '+' + cfg.twilio.fromPhone,
        Body: message,
      });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${sid}:${cfg.twilio.authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({} as any));
      if (res.ok && json?.sid) {
        ok = true;
      } else {
        errMsg = json?.message || `HTTP ${res.status}`;
      }
    } else if (cfg.provider === 'africastalking') {
      // ⚠️ L'API Africa's Talking exige du form-urlencoded — le JSON renvoie
      // systématiquement HTTP 415 (Unsupported Media Type).
      // .trim() défensif : une clé collée avec espace/saut de ligne échouerait
      // en authentification sans explication claire.
      const atUsername = (cfg.africastalking.username || '').trim();
      const atKey = (cfg.africastalking.apiKey || '').trim();
      const headers: Record<string, string> = {
        'apiKey': atKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      };
      const params = new URLSearchParams({
        username: atUsername,
        to: dest,
        message,
        // AT exige un NOMBRE ici : « true » → HTTP 400 « enqueue was malformed ».
        enqueue: '1',
      });
      const senderId = (cfg.africastalking.senderId || '').trim();
      // En sandbox, AUCUN sender ID custom n'est autorisé — on ne l'envoie
      // jamais (sinon la requête peut être refusée par AT).
      if (senderId && atUsername.toLowerCase() !== 'sandbox') params.set('from', senderId);
      // AT dispose d'une HÔTESSE SANDBOX distincte : username « sandbox » +
      // clé sandbox renvoient systématiquement 401 sur api.africastalking.com
      // (hôtesse live) alors que les MÊMES identifiants répondent en 200/201 sur
      // api.sandbox.africastalking.com. L'hôtesse est donc choisie d'après le
      // username — vérifié en direct : 201 « Success » sur l'hôtesse sandbox.
      const atHost = atUsername.toLowerCase() === 'sandbox'
        ? 'https://api.sandbox.africastalking.com'
        : 'https://api.africastalking.com';
      const res = await fetch(`${atHost}/version1/messaging`, {
        method: 'POST',
        headers,
        body: params.toString(),
        signal: controller.signal,
      });
      // Corps lu UNE seule fois : l'API renvoie du JSON en cas de succès,
      // mais parfois du texte brut en cas d'erreur (ex. 401 authentication).
      const rawBody = await res.text().catch(() => '');
      let json: any = {};
      try { json = rawBody ? JSON.parse(rawBody) : {}; } catch { /* texte brut */ }
      const recipient = json?.SMSMessageData?.Recipients?.[0];
      // Statuts acceptés par AT quand le message est pris en charge
      // (« Success » en sandbox ; « Sent »/« Enqueued » selon la file) —
      // tout autre statut (InvalidPhoneNumber…) est bien une erreur.
      const atStatus = String(recipient?.status || '').toLowerCase();
      const accepted = OK_STATUSES.has(atStatus);
      if (res.ok && recipient && accepted) {
        ok = true;
      } else {
        const rawText = (json && Object.keys(json).length) ? '' : rawBody.trim();
        const baseMsg = recipient?.status || json?.errorMessage || rawText || `HTTP ${res.status}`;
        // Code AT inclus (ex. « [401] … ») : accélère énormément le diagnostic à distance
        errMsg = recipient?.statusCode ? `[${recipient.statusCode}] ${baseMsg}` : baseMsg;
        // HTTP 401 : l'hôtesse (choisie d'après le username) refuse le couple
        // username + clé — soit une clé live avec username « sandbox », soit une
        // clé sandbox avec un nom d'utilisateur d'application.
        if (!ok && res.status === 401) {
          errMsg += atUsername.toLowerCase() === 'sandbox'
            ? ' — identifiants refus\u00e9s par l\u2019h\u00f4tesse sandbox d\u2019AT : recopiez la cl\u00e9 exactement (Settings \u2192 API Key) ou r\u00e9g\u00e9n\u00e9rez-la puis patientez ~5 min'
            : ' — identifiants refus\u00e9s par l\u2019h\u00f4tesse live d\u2019AT : si votre compte est en sandbox, mettez username \u00ab sandbox \u00bb (l\u2019h\u00f4tesse sandbox sera alors utilis\u00e9e automatiquement) ; sinon v\u00e9rifiez votre nom d\u2019utilisateur d\u2019application + cl\u00e9';
        } else if (!ok && /auth/i.test(errMsg)) {
          errMsg += ' — v\u00e9rifiez le couple username + cl\u00e9 (Settings \u2192 API Key)';
        }
      }
    } else if (cfg.provider === 'vonage') {
      const res = await fetch('https://rest.nexmo.com/sms/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: cfg.vonage.apiKey,
          api_secret: cfg.vonage.apiSecret,
          to: dest.replace(/^\+/, ''),
          from: cfg.vonage.from,
          text: message,
        }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({} as any));
      const msg = json?.messages?.[0];
      if (res.ok && msg && msg.status === '0') {
        ok = true;
      } else {
        errMsg = msg ? `${msg['status']}: ${msg['error-text'] || 'Erreur Vonage'}` : `HTTP ${res.status}`;
      }
    } else {
      // Webhook personnalisé : POST { to, message } — réponse HTTP 2xx = succès
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (cfg.custom.webhookToken) headers['Authorization'] = `Bearer ${cfg.custom.webhookToken}`;
      const res = await fetch(cfg.custom.webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ to: dest, message }),
        signal: controller.signal,
      });
      if (res.ok) {
        ok = true;
      } else {
        errMsg = `HTTP ${res.status}`;
      }
    }

    if (ok) {
      console.log(`[SMS] Envoyé à ${dest} via ${cfg.provider}`);
      return { success: true, provider: cfg.provider };
    }
    console.error(`[SMS][${cfg.provider}] Échec:`, errMsg);
    return { success: false, error: errMsg, provider: cfg.provider };
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Délai dépassé (20s)' : (e?.message || 'Erreur réseau SMS');
    console.error(`[SMS][${cfg.provider}] Échec:`, msg);
    return { success: false, error: msg, provider: cfg.provider };
  } finally {
    clearTimeout(timeout);
  }
}
