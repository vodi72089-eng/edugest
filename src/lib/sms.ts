import { db } from './db';

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
    configCache = { value: merged, at: Date.now() };
    return merged;
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
export async function sendSmsViaProvider(to: string, message: string): Promise<SmsResult> {
  const cfg = await getSmsApiConfig();
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
        enqueue: 'true',
      });
      const senderId = (cfg.africastalking.senderId || '').trim();
      if (senderId) params.set('from', senderId);
      const res = await fetch('https://api.africastalking.com/version1/messaging', {
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
        // Piste évidente : en sandbox, l'username DOIT être « sandbox » —
        // sinon l'authentification échoue même avec une clé valide.
        if (!ok && /auth/i.test(errMsg) && atUsername.toLowerCase() !== 'sandbox') {
          errMsg += ' — en mode sandbox, le nom d\u2019utilisateur doit \u00eatre exactement \u00ab sandbox \u00bb';
        } else if (!ok && /auth/i.test(errMsg)) {
          // Username correct mais refus : la clé est invalide ou régénérée
          errMsg += ' — votre cl\u00e9 API semble invalide : copiez-collez-la exactement depuis africastalking.com (Settings \u2192 API Key) ou r\u00e9g\u00e9n\u00e9rez-la';
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
