import { db } from './db';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL D'ACTIVITÉ PLATEFORME — prêt pour l'agent HERMES (production)
//
// Chaque action sensible passe par logAudit() :
//   1. Écriture locale dans AuditLog (toujours, y compris en dev)
//   2. En production, si HERMES_AGENT_CONFIG est configuré (GlobalApiConfig),
//      l'entrée est relayée en fire-and-forget vers le webhook Hermes avec une
//      signature HMAC-SHA256 (en-tête X-EduGest-Signature) pour vérification
//      côté agent.
//
// Config attendue (clé GlobalApiConfig « HERMES_AGENT_CONFIG ») :
//   { "enabled": true, "webhookUrl": "https://hermes.exemple.cd/hook/...",
//     "secret": "partage entre la plateforme et l'agent", "minLevel": "INFO" }
// En dev (aucune config) : journalisation locale uniquement — aucune fuite
// réseau, aucune erreur si Hermes n'existe pas encore.
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditEntry {
  action: string;            // AUTH_LOGIN, CORP_CREATED, GRANT_SENT, EMAIL_SENT, TICKET_REPLY…
  userId: string;            // id de l'auteur ('system' si automatique)
  userName: string;
  userRole: string;
  entityType?: string;
  entityId?: string | null;
  details?: string;          // résumé lisible (français)
  schoolId?: string | null;
  meta?: Record<string, unknown>; // payload structuré pour Hermes
}

let hermesCache: { value: { enabled: boolean; webhookUrl: string; secret: string; minLevel: string } | null; at: number } | null = null;

async function getHermesConfig(force = false) {
  if (!force && hermesCache && Date.now() - hermesCache.at < 30_000) return hermesCache.value;
  try {
    const row = await db.globalApiConfig.findUnique({ where: { key: 'HERMES_AGENT_CONFIG' } });
    const parsed = row ? JSON.parse(row.value) : null;
    hermesCache = {
      value: parsed && parsed.enabled && parsed.webhookUrl
        ? { enabled: true, webhookUrl: String(parsed.webhookUrl), secret: String(parsed.secret || ''), minLevel: String(parsed.minLevel || 'INFO') }
        : null,
      at: Date.now(),
    };
  } catch {
    hermesCache = { value: null, at: Date.now() };
  }
  return hermesCache.value;
}

function invalidateHermesCache() {
  hermesCache = null;
}
export { invalidateHermesCache as invalidateHermesConfigCache };

// Relais Hermes : jamais bloquant, jamais d'erreur propagée (best-effort).
async function forwardToHermes(entry: AuditEntry & { loggedAt: string }) {
  try {
    const cfg = await getHermesConfig();
    if (!cfg) return; // pas configuré (dev) → journalisation locale uniquement
    const body = JSON.stringify({
      source: 'edugest',
      agent: 'hermes',
      version: 1,
      action: entry.action,
      actor: { id: entry.userId, name: entry.userName, role: entry.userRole },
      entity: entry.entityType ? { type: entry.entityType, id: entry.entityId } : null,
      schoolId: entry.schoolId ?? null,
      details: entry.details ?? null,
      meta: entry.meta ?? null,
      timestamp: entry.loggedAt,
    });
    const signature = cfg.secret
      ? crypto.createHmac('sha256', cfg.secret).update(body).digest('hex')
      : null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(signature ? { 'X-EduGest-Signature': `sha256=${signature}` } : {}),
      },
      body,
      signal: controller.signal,
    }).catch(() => {});
    clearTimeout(timeout);
  } catch (e) {
    console.warn('[AUDIT] Relais Hermes impossible (ignoré):', e);
  }
}

// Log audit principal : toujours écrit en DB, relais Hermes optionnel (prod).
export async function logAudit(entry: AuditEntry): Promise<void> {
  const loggedAt = new Date().toISOString();
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId || 'system',
        userName: entry.userName || 'Système',
        userRole: entry.userRole || 'SYSTEM',
        action: entry.action,
        entityType: entry.entityType || 'SYSTEM',
        entityId: entry.entityId,
        details: entry.details,
        schoolId: entry.schoolId || null,
        meta: entry.meta ? JSON.stringify(entry.meta) : null,
      },
    });
  } catch (e) {
    // Ne JAMAIS faire échouer la requête métier à cause du journal
    console.error('[AUDIT] Écriture AuditLog impossible:', e);
  }
  void forwardToHermes({ ...entry, loggedAt });
}

// Lecture (admin plateforme + support) avec filtres simples.
export async function listAuditLogs(opts: { action?: string; limit?: number; cursor?: string }) {
  const limit = Math.min(opts.limit || 100, 300);
  return db.auditLog.findMany({
    where: {
      ...(opts.action ? { action: { startsWith: opts.action } } : {}),
    },
    orderBy: { createdAt: 'desc' as const },
    take: limit,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
  });
}
