import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';

// ─── Agent IA externe — Look School 360 ─────────────────────────────────────
// Authentification + quota + audit + validation SQL en lecture seule pour les
// endpoints /api/ai/*. L'agent s'authentifie via un token partagé
// (AI_AGENT_TOKEN, header « Authorization: Bearer <token> »).
// En développement, un token par défaut est toléré (même convention que
// l'agent WhatsApp). En production, AI_AGENT_TOKEN est OBLIGATOIRE.

export const AI_AGENT_DEV_TOKEN = 'look-school-360-agent-dev-token';
export const APP_NAME = 'Look School 360';

export function getAgentToken(): string | null {
  const fromEnv = process.env.AI_AGENT_TOKEN;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  if (process.env.NODE_ENV !== 'production') return AI_AGENT_DEV_TOKEN;
  return null; // production sans secret → agent désactivé
}

export function isAgentConfigured(): boolean {
  return getAgentToken() !== null;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Extrait le token de la requête (Bearer ou champ body.agentToken). */
export function extractAgentToken(request: NextRequest, bodyAgentToken?: unknown): string | null {
  const header = request.headers.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  if (typeof bodyAgentToken === 'string' && bodyAgentToken.trim()) return bodyAgentToken.trim();
  return null;
}

/**
 * Garde d'authentification des endpoints /api/ai/*.
 * @returns null si autorisé, sinon une NextResponse d'erreur prête à retourner.
 */
export function requireAgent(request: NextRequest, bodyAgentToken?: unknown): NextResponse | null {
  const expected = getAgentToken();
  if (!expected) {
    return NextResponse.json(
      { error: 'Agent IA non configuré : définissez AI_AGENT_TOKEN côté serveur.' },
      { status: 503 },
    );
  }
  const provided = extractAgentToken(request, bodyAgentToken);
  if (!provided) {
    return NextResponse.json(
      { error: 'Authentification requise : header « Authorization: Bearer <token> ».' },
      { status: 401 },
    );
  }
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Token agent invalide.' }, { status: 401 });
  }
  return null;
}

// ─── Quota quotidien (en mémoire, réinitialisé chaque jour) ─────────────────
const QUOTA_DEFAULT = 1000;
const quotaState = { date: '', used: 0 };

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getAgentQuota(): { remaining: number; limit: number; used: number; reset: string } {
  const limit = Number(process.env.AI_AGENT_DAILY_QUOTA) || QUOTA_DEFAULT;
  if (quotaState.date !== todayKey()) {
    quotaState.date = todayKey();
    quotaState.used = 0;
  }
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return { remaining: Math.max(0, limit - quotaState.used), limit, used: quotaState.used, reset: tomorrow.toISOString() };
}

/** Consomme 1 appel. @returns false si quota épuisé. */
export function consumeAgentQuota(): boolean {
  const q = getAgentQuota();
  if (q.remaining <= 0) return false;
  quotaState.used += 1;
  return true;
}

// ─── Audit trail ─────────────────────────────────────────────────────────────
export async function auditAgentAction(
  action: string,
  entityType: string,
  entityId: string | null,
  details: string,
  schoolId?: string | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: 'AI_AGENT',
        userName: `Agent IA (${APP_NAME})`,
        userRole: 'AI_AGENT',
        action,
        entityType,
        entityId,
        details,
        schoolId: schoolId ?? null,
        meta: meta ? JSON.stringify(meta) : undefined,
      },
    });
  } catch {
    // L'audit ne doit jamais faire échouer l'action de l'agent.
  }
}

// ─── Catalogue des endpoints exposés à l'agent ──────────────────────────────
export const AI_ENDPOINTS = {
  health: '/api/ai/health',
  status: '/api/ai/status',
  query: '/api/ai/query',
  db: '/api/ai/db/query',
  patients: '/api/ai/patients',
  discipline: '/api/ai/discipline',
  notifications: '/api/ai/notifications',
  pdf: '/api/ai/pdf',
  whatsapp: '/api/ai/whatsapp',
  payments: '/api/ai/payments',
  entrance: '/api/ai/entrance',
} as const;

/** Actions autorisées, éventuellement restreintes aux capacités demandées. */
export function resolveAuthorizedActions(requested?: unknown): string[] {
  const all = [
    'health',
    'db_status',
    'db_read',
    'query',
    'pdf',
    'whatsapp',
    'notifications',
    'discipline',
    'patients',
    'payments',
  ];
  if (Array.isArray(requested)) {
    // Alias : « db » (et « sql ») demandent l'action lecture « db_read ».
    const alias: Record<string, string> = { db: 'db_read', sql: 'db_read' };
    const set = new Set(
      requested
        .filter((c): c is string => typeof c === 'string')
        .map((c) => alias[c] ?? c),
    );
    return all.filter((a) => set.has(a));
  }
  return all;
}

// ─── Validation SQL en lecture seule (anti-injection) ───────────────────────
export const AI_ALLOWED_TABLES: ReadonlySet<string> = new Set(
  [
    'School', 'User', 'Student', 'Class', 'TeacherAssignment', 'SchoolFee',
    'Notification', 'PushSubscription', 'SchoolYear', 'Subject', 'Grade',
    'GradeRead', 'DisciplineRecord', 'Blacklist', 'Greylist', 'Whitelist',
    'DisciplineKeyword', 'SchoolComment', 'Convocation', 'ConvocationRead',
    'Communication', 'CommunicationRead', 'PaymentRecord', 'Homework',
    'HomeworkRead', 'AttendanceRecord', 'TeacherAttendanceRecord', 'ReportCard',
    'AuditLog', 'GlobalApiConfig', 'PricingPlan', 'PaymentGatewayConfig',
    'SchoolCurrencyConfig', 'ExchangeRate', 'PaymentTransaction',
    'SettingsApproval', 'SubscriptionRequest', 'WhatsappApiConfig',
    'WhatsappMessageLog', 'VerificationToken', 'MedicalRecord', 'InfirmaryVisit',
    'MedicalDispensation', 'MedicalDocument', 'SchoolQrCode',
    'DocumentVerification', 'PlatformEvent', 'RepechageExam', 'SchoolEvent',
    'SchoolPhoto', 'PasswordResetToken', 'Corporate', 'CorporateSchool',
    'CorporateUser', 'SupportTicket', 'TicketMessage', 'EmailMessage',
    'FeatureGrant', 'ReportSchedule',
  ],
);

const SQL_FORBIDDEN = /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|reindex|replace|begin|commit|rollback|savepoint|revoke|grant)\b/i;

export interface SqlValidation {
  ok: boolean;
  error?: string;
  sql?: string;
}

/** Valide une requête SQL : SELECT seul, table connue, LIMIT borné. */
export function validateReadOnlySql(raw: string): SqlValidation {
  let sql = (raw || '').trim();
  // Retire les commentaires SQL de tête avant analyse.
  sql = sql.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))+/, '').trim();
  if (!sql) return { ok: false, error: 'Requête vide.' };
  if (/[^"'];/i.test(sql.replace(/'[^']*'|"[^"]*"/g, ''))) {
    return { ok: false, error: 'Une seule instruction autorisée (pas de « ; »).' };
  }
  if (!/^select\s/i.test(sql)) {
    return { ok: false, error: 'Seules les requêtes SELECT en lecture seule sont autorisées.' };
  }
  if (SQL_FORBIDDEN.test(sql.replace(/'[^']*'|"[^"]*"/g, ' '))) {
    return { ok: false, error: 'Mots-clés d’écriture interdits (SELECT uniquement).' };
  }
  // Tables référencées (FROM / JOIN) : whitelist stricte.
  const tableRe = /\b(?:from|join)\s+["'`[]?([A-Za-z_][A-Za-z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = tableRe.exec(sql)) !== null) {
    const t = m[1];
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    if (!AI_ALLOWED_TABLES.has(t)) {
      return { ok: false, error: `Table « ${t} » non autorisée.` };
    }
  }
  if (seen.size === 0) {
    return { ok: false, error: 'Aucune table reconnue (FROM/JOIN requis).' };
  }
  // LIMIT obligatoire et borné.
  const limitRe = /\blimit\s+(\d+)/i;
  const lm = limitRe.exec(sql);
  if (lm) {
    if (Number(lm[1]) > 500) {
      return { ok: false, error: 'LIMIT maximum : 500 lignes.' };
    }
  } else {
    sql += ' LIMIT 200';
  }
  return { ok: true, sql };
}

/** Sérialise les lignes brutes SQLite (BigInt / Date / Buffer → JSON). */
export function serializeRows(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (row === null || typeof row !== 'object') return row;
    return Object.fromEntries(
      Object.entries(row as Record<string, unknown>).map(([k, v]) => {
        if (typeof v === 'bigint') return [k, v.toString()];
        if (v instanceof Date) return [k, v.toISOString()];
        if (Buffer.isBuffer(v)) return [k, `<buffer ${v.length}o>`];
        if (v instanceof Uint8Array) return [k, `<buffer ${v.byteLength}o>`];
        return [k, v];
      }),
    );
  });
}
