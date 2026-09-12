import { db } from './db';
import { decryptSecret } from './gateway-keys';

// ─── API WhatsApp personnelle du client (Meta WhatsApp Cloud API) ───────────
// Si l'école configure sa propre API WhatsApp (Phone Number ID + token Meta),
// tous les messages de l'application partent via SON numéro et SON token :
//   → plus de limite mensuelle EduGest
//   → le client n'est limité que par les tokens qu'il achète auprès de Meta

export const WHATSAPP_GRAPH_VERSION = 'v21.0';
const WHATSAPP_GRAPH_BASE = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}`;

export interface SchoolWhatsappApiConfig {
  id: string;
  schoolId: string;
  provider: string;
  phoneNumberId: string;
  accessToken: string; // déchiffré
  businessAccountId: string | null;
  webhookVerifyToken: string | null;
  isActive: boolean;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
}

// Cache en mémoire (60 s) pour éviter une lecture DB à chaque envoi
const configCache: Map<string, { config: SchoolWhatsappApiConfig | null; timestamp: number }> = new Map();
const CACHE_TTL = 60_000;

/** Récupère la config API WhatsApp d'une école (token déchiffré). Cache 60 s. */
export async function getSchoolWhatsappApiConfig(
  schoolId: string | null | undefined
): Promise<SchoolWhatsappApiConfig | null> {
  if (!schoolId) return null;

  const cached = configCache.get(schoolId);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL) return cached.config;

  try {
    const row = await db.whatsappApiConfig.findUnique({ where: { schoolId } });
    if (!row || !row.phoneNumberId || !row.accessToken) {
      configCache.set(schoolId, { config: null, timestamp: now });
      return null;
    }
    let accessToken = row.accessToken;
    try {
      accessToken = decryptSecret(row.accessToken) || row.accessToken;
    } catch {
      console.warn('[WhatsApp API] Token illisible (clé de chiffrement changée ?) — école', schoolId);
      configCache.set(schoolId, { config: null, timestamp: now });
      return null;
    }
    const config: SchoolWhatsappApiConfig = {
      id: row.id,
      schoolId: row.schoolId,
      provider: row.provider,
      phoneNumberId: row.phoneNumberId,
      accessToken,
      businessAccountId: row.businessAccountId,
      webhookVerifyToken: row.webhookVerifyToken,
      isActive: row.isActive,
      lastTestAt: row.lastTestAt,
      lastTestOk: row.lastTestOk,
    };
    configCache.set(schoolId, { config, timestamp: now });
    return config;
  } catch (error) {
    console.error('[WhatsApp API] Error loading config:', error);
    return null;
  }
}

export function invalidateWhatsappApiConfigCache(schoolId: string): void {
  configCache.delete(schoolId);
}

export interface CloudApiSendResult {
  ok: boolean;
  error?: string;
  /** Vrai si l'erreur vient du token Meta (quota de tokens épuisé, etc.) */
  tokenError?: boolean;
}

/** Normalise un numéro pour l'API Meta : chiffres uniquement, sans + ni 00 */
function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s\-().]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  return p;
}

/**
 * Envoie un message texte via l'API Cloud WhatsApp du client.
 * Documente l'erreur exacte renvoyée par Meta (token expiré, quota Meta…).
 */
export async function sendViaWhatsappApi(
  config: SchoolWhatsappApiConfig,
  phone: string,
  message: string
): Promise<CloudApiSendResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 28000);

    const res = await fetch(`${WHATSAPP_GRAPH_BASE}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(phone),
        type: 'text',
        text: { preview_url: false, body: message },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => ({}));
    if (res.ok && !data?.error) return { ok: true };

    const errMessage = data?.error?.message || `HTTP ${res.status}`;
    const errCode = data?.error?.code;
    const tokenError =
      res.status === 401 || res.status === 403 || errCode === 190 || errCode === 102;
    console.warn(`[WhatsApp API] Send failed (${config.schoolId}): ${errCode || res.status} — ${errMessage}`);
    return { ok: false, error: errMessage, tokenError };
  } catch (error) {
    console.warn('[WhatsApp API] Send error:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur réseau' };
  }
}

/**
 * Envoie un document (base64) via l'API Cloud WhatsApp du client.
 */
export async function sendDocumentViaWhatsappApi(
  config: SchoolWhatsappApiConfig,
  phone: string,
  fileBase64: string,
  filename: string,
  mimetype: string,
  caption?: string
): Promise<CloudApiSendResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40000);

    const document: Record<string, unknown> = {
      link: `data:${mimetype};name=${encodeURIComponent(filename)};base64,${fileBase64}`,
      filename,
    };
    if (caption) document.caption = caption;

    const res = await fetch(`${WHATSAPP_GRAPH_BASE}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(phone),
        type: 'document',
        document,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => ({}));
    if (res.ok && !data?.error) return { ok: true };

    const errMessage = data?.error?.message || `HTTP ${res.status}`;
    const errCode = data?.error?.code;
    const tokenError = res.status === 401 || res.status === 403 || errCode === 190;
    console.warn(`[WhatsApp API] Document send failed (${config.schoolId}): ${errCode || res.status} — ${errMessage}`);
    return { ok: false, error: errMessage, tokenError };
  } catch (error) {
    console.warn('[WhatsApp API] Document send error:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur réseau' };
  }
}
