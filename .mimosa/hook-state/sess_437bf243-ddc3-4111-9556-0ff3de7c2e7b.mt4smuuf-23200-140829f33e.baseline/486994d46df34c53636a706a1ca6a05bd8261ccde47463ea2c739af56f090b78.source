import { db } from './db';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

// ─── Session store (file-based, survives HMR) ────────────────────────────
// Session file shape (v2 — supports connected-devices feature):
//   {
//     sid: string          // session id (crypto.randomUUID), safe to expose to UI
//     userId: string
//     expiresAt: number    // epoch ms
//     createdAt: number    // epoch ms
//     lastUsedAt: number   // epoch ms, refreshed (throttled) on validateSession
//     userAgent: string    // from request headers at creation
//     ip: string           // from request headers at creation
//   }
// Legacy files (v1: { userId, expiresAt }) are read transparently — missing
// fields default to '' / 0 / undefined.
const SESSIONS_DIR = path.join(process.cwd(), '.sessions');
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
// Throttle: only persist lastUsedAt if it's older than this, to avoid a disk
// write on every single API request.
const LAST_USED_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface GeoLocation {
  city: string;
  region: string;
  country: string;
  isp: string;
  lat: number;
  lon: number;
}

export interface SessionData {
  sid: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  lastUsedAt: number;
  userAgent: string;
  ip: string;
  // ── Enrichissement appareil (optionnel, écrit par /api/sessions/device) ──
  fingerprintId?: string;
  screen?: string;
  gpu?: string;
  battery?: string;
  languages?: string;
  timezone?: string;
  memory?: string;
  cores?: string;
  network?: string;
  location?: GeoLocation | null;
}

export interface SessionListItem {
  sid: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  userAgent: string;
  ip: string;
  isCurrent: boolean;
  fingerprintId?: string;
  screen?: string;
  gpu?: string;
  battery?: string;
  languages?: string;
  timezone?: string;
  memory?: string;
  cores?: string;
  network?: string;
  location?: GeoLocation | null;
}

function ensureSessionsDir() {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  } catch {
    // Fallback: if we can't create dir, we'll use in-memory only
  }
}

function getSessionPath(token: string): string {
  const dir = path.join(SESSIONS_DIR, token.slice(0, 2));
  return path.join(dir, `${token}.json`);
}

function normalizeSession(raw: any): SessionData | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.userId || typeof raw.userId !== 'string') return null;
  return {
    sid: typeof raw.sid === 'string' ? raw.sid : '',
    userId: raw.userId,
    expiresAt: typeof raw.expiresAt === 'number' ? raw.expiresAt : 0,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    lastUsedAt: typeof raw.lastUsedAt === 'number' ? raw.lastUsedAt : 0,
    userAgent: typeof raw.userAgent === 'string' ? raw.userAgent : '',
    ip: typeof raw.ip === 'string' ? raw.ip : '',
    fingerprintId: typeof raw.fingerprintId === 'string' ? raw.fingerprintId : '',
    screen: typeof raw.screen === 'string' ? raw.screen : '',
    gpu: typeof raw.gpu === 'string' ? raw.gpu : '',
    battery: typeof raw.battery === 'string' ? raw.battery : '',
    languages: typeof raw.languages === 'string' ? raw.languages : '',
    timezone: typeof raw.timezone === 'string' ? raw.timezone : '',
    memory: typeof raw.memory === 'string' ? raw.memory : '',
    cores: typeof raw.cores === 'string' ? raw.cores : '',
    network: typeof raw.network === 'string' ? raw.network : '',
    location: raw.location && typeof raw.location === 'object' ? raw.location as GeoLocation : null,
  };
}

function writeSession(token: string, data: SessionData) {
  try {
    ensureSessionsDir();
    const dir = path.join(SESSIONS_DIR, token.slice(0, 2));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getSessionPath(token), JSON.stringify(data), 'utf-8');
  } catch {
    // Silently fail — fallback to in-memory won't work but won't crash either
  }
}

function readSession(token: string): SessionData | null {
  try {
    const sessionPath = getSessionPath(token);
    if (!fs.existsSync(sessionPath)) return null;
    const raw = fs.readFileSync(sessionPath, 'utf-8');
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

function deleteSession(token: string) {
  try {
    const sessionPath = getSessionPath(token);
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  } catch {
    // ignore
  }
}

export function createSession(userId: string, meta: SessionMeta = {}): string {
  const token = crypto.randomUUID();
  const now = Date.now();
  const session: SessionData = {
    sid: crypto.randomUUID(),
    userId,
    expiresAt: now + SESSION_DURATION_MS,
    createdAt: now,
    lastUsedAt: now,
    userAgent: meta.userAgent || '',
    ip: meta.ip || '',
  };
  writeSession(token, session);
  return token;
}

export function validateSession(token: string): { userId: string } | null {
  const session = readSession(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) { deleteSession(token); return null; }
  // Throttled refresh of lastUsedAt — avoids a disk write on every request.
  const now = Date.now();
  if (session.lastUsedAt === 0 || now - session.lastUsedAt > LAST_USED_REFRESH_MS) {
    session.lastUsedAt = now;
    writeSession(token, session);
  }
  return { userId: session.userId };
}

// ─── Session enumeration & revocation (connected-devices feature) ─────────
// Scans .sessions/** and returns all sessions belonging to `userId`.
// `currentToken` (optional) marks the calling session as isCurrent.
export function listUserSessions(userId: string, currentToken?: string): SessionListItem[] {
  const out: SessionListItem[] = [];
  try {
    ensureSessionsDir();
    const subdirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
    for (const d of subdirs) {
      if (!d.isDirectory()) continue;
      const subdirPath = path.join(SESSIONS_DIR, d.name);
      let files: string[] = [];
      try { files = fs.readdirSync(subdirPath); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const token = f.replace(/\.json$/, '');
        const sessionPath = path.join(subdirPath, f);
        try {
          const raw = fs.readFileSync(sessionPath, 'utf-8');
          const s = normalizeSession(JSON.parse(raw));
          if (!s || s.userId !== userId) continue;
          // Skip expired (don't return, and clean up)
          if (Date.now() > s.expiresAt) { try { fs.unlinkSync(sessionPath); } catch {} continue; }
          out.push({
            sid: s.sid || token.slice(0, 8),
            createdAt: s.createdAt,
            lastUsedAt: s.lastUsedAt,
            expiresAt: s.expiresAt,
            userAgent: s.userAgent,
            ip: s.ip,
            isCurrent: !!currentToken && token === currentToken,
          });
        } catch {
          // Corrupt file — skip
        }
      }
    }
  } catch {
    // Sessions dir not readable — return empty
  }
  // Most recently used first
  out.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  return out;
}

// Revoke a session by its token (used by /api/auth/logout).
export function revokeSessionByToken(token: string): boolean {
  const sessionPath = getSessionPath(token);
  try {
    if (!fs.existsSync(sessionPath)) return false;
    fs.unlinkSync(sessionPath);
    return true;
  } catch {
    return false;
  }
}

// Write device-enrichment fields (fingerprint + hardware signals) into the
// session file for a given token. Only known string fields are accepted.
export function updateSessionDeviceData(token: string, device: Record<string, unknown>): boolean {
  const session = readSession(token);
  if (!session) return false;
  const allowed = ['fingerprintId', 'screen', 'gpu', 'battery', 'languages', 'timezone', 'memory', 'cores', 'network'] as const;
  let changed = false;
  for (const key of allowed) {
    const value = device[key];
    if (typeof value === 'string' && value.trim() !== '' && session[key] !== value) {
      session[key] = value;
      changed = true;
    }
  }
  if (changed) writeSession(token, session);
  return true;
}

// Persist the resolved IP geolocation into the session file matching `sid`.
// Mirrors revokeSessionBySid's scan pattern (sid is safe to expose, tokens never leave the server).
export function updateSessionLocationBySid(userId: string, sid: string, location: GeoLocation | null): boolean {
  try {
    ensureSessionsDir();
    const subdirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
    for (const d of subdirs) {
      if (!d.isDirectory()) continue;
      const subdirPath = path.join(SESSIONS_DIR, d.name);
      let files: string[] = [];
      try { files = fs.readdirSync(subdirPath); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const token = f.replace(/\.json$/, '');
        const sessionPath = path.join(subdirPath, f);
        try {
          const raw = fs.readFileSync(sessionPath, 'utf-8');
          const s = normalizeSession(JSON.parse(raw));
          if (!s || s.userId !== userId) continue;
          const fileSid = s.sid || token.slice(0, 8);
          if (fileSid === sid) {
            s.location = location;
            writeSession(token, s);
            return true;
          }
        } catch {
          // skip corrupt
        }
      }
    }
  } catch {
    // ignore
  }
  return false;
}

// Revoke a specific session by its sid (safe — the actual auth token never
// leaves the server). Returns true if a session was found & deleted.
export function revokeSessionBySid(userId: string, sid: string): boolean {
  let revoked = false;
  try {
    ensureSessionsDir();
    const subdirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
    for (const d of subdirs) {
      if (revoked) break;
      if (!d.isDirectory()) continue;
      const subdirPath = path.join(SESSIONS_DIR, d.name);
      let files: string[] = [];
      try { files = fs.readdirSync(subdirPath); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const token = f.replace(/\.json$/, '');
        const sessionPath = path.join(subdirPath, f);
        try {
          const raw = fs.readFileSync(sessionPath, 'utf-8');
          const s = normalizeSession(JSON.parse(raw));
          if (!s || s.userId !== userId) continue;
          const fileSid = s.sid || token.slice(0, 8);
          if (fileSid === sid) {
            fs.unlinkSync(sessionPath);
            revoked = true;
            break;
          }
        } catch {
          // skip corrupt
        }
      }
    }
  } catch {
    // ignore
  }
  return revoked;
}

// Revoke ALL sessions for a user EXCEPT the current token. Used after a
// password change to force re-login on other devices.
export function revokeAllUserSessionsExcept(userId: string, exceptToken: string): number {
  let count = 0;
  try {
    ensureSessionsDir();
    const subdirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
    for (const d of subdirs) {
      if (!d.isDirectory()) continue;
      const subdirPath = path.join(SESSIONS_DIR, d.name);
      let files: string[] = [];
      try { files = fs.readdirSync(subdirPath); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const token = f.replace(/\.json$/, '');
        if (token === exceptToken) continue;
        const sessionPath = path.join(subdirPath, f);
        try {
          const raw = fs.readFileSync(sessionPath, 'utf-8');
          const s = normalizeSession(JSON.parse(raw));
          if (!s || s.userId !== userId) continue;
          fs.unlinkSync(sessionPath);
          count++;
        } catch {
          // skip corrupt
        }
      }
    }
  } catch {
    // ignore
  }
  return count;
}

// Extract the bearer token from a request (for marking isCurrent in list).
export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

// Best-effort client IP extraction from common proxy headers.
export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const xreal = request.headers.get('x-real-ip');
  if (xreal) return xreal.trim();
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return '';
}

export function getUserAgentFromRequest(request: NextRequest): string {
  return request.headers.get('user-agent') || '';
}

export async function createToken(userData: {
  id: string; name: string; email: string | null; phone: string | null;
  role: string; schoolId: string | null; isActive: boolean;
}, meta: SessionMeta = {}): Promise<string> {
  return createSession(userData.id, meta);
}

export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  return validateSession(token);
}

// ─── Auth helpers ──────────────────────────────────────────────────────────
export interface AuthUser {
  id: string; name: string; email: string | null; phone: string | null;
  role: string; schoolId: string | null; isActive: boolean;
}

export async function requireAuth(request: NextRequest): Promise<{ user: AuthUser } | { error: Response }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: Response.json({ error: 'Authentification requise' }, { status: 401 }) };
  }
  const token = authHeader.slice(7);
  const session = validateSession(token);
  if (!session) return { error: Response.json({ error: 'Session expirée ou invalide' }, { status: 401 }) };
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, phone: true, role: true, schoolId: true, isActive: true },
  });
  if (!user || !user.isActive) return { error: Response.json({ error: 'Compte désactivé ou introuvable' }, { status: 401 }) };
  return { user };
}

export async function requireRole(request: NextRequest, allowedRoles: string[]): Promise<{ user: AuthUser } | { error: Response }> {
  const authResult = await requireAuth(request);
  if ('error' in authResult) return authResult;
  if (!allowedRoles.includes(authResult.user.role)) return { error: Response.json({ error: 'Accès non autorisé' }, { status: 403 }) };
  return authResult;
}

// ─── Permission-based auth ─────────────────────────────────────────────────
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN_GLOBAL: ['*'],
  DIRECTION: [
    'users:read', 'users:create', 'users:update',
    'students:read', 'students:create', 'students:update',
    'payments:read', 'payments:create',
    'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'classes:create', 'classes:update',
    'subjects:read', 'subjects:create',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'stats:read', 'profile:read', 'profile:update',
    'schools:read',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
  ],
  SECRETARY: [
    'school:read',
    'users:read', 'users:create', 'users:update',
    'students:read', 'students:create', 'students:update', 'students:delete',
    'classes:read', 'classes:create',
    'subjects:read', 'subjects:create',
    'grades:read',
    'payments:read', 'payments:create', 'payments:verify',
    'discipline:read', 'communications:read', 'communications:create',
    'homework:read', 'convocations:read', 'convocations:create',
    'stats:read', 'profile:read', 'profile:update',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
  ],
  CASHIER: [
    'school:read',
    'students:read',
    'payments:read', 'payments:create', 'payments:update', 'payments:verify',
    'communications:read',
    'stats:read', 'profile:read', 'profile:update',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
  ],
  DIRECTION_MATERNELLE: [
    'school:read', 'users:read', 'students:read', 'students:update', 'students:create',
    'classes:read', 'classes:create', 'classes:update', 'classes:delete',
    'subjects:read', 'subjects:create', 'grades:read', 'grades:create', 'grades:update',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update',
  ],
  DIRECTION_PRIMAIRE: [
    'school:read', 'users:read', 'students:read', 'students:update', 'students:create',
    'classes:read', 'classes:create', 'classes:update', 'classes:delete',
    'subjects:read', 'subjects:create', 'grades:read', 'grades:create', 'grades:update',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
  ],
  DIRECTION_SECONDAIRE: [
    'school:read', 'users:read', 'students:read', 'students:update', 'students:create',
    'classes:read', 'classes:create', 'classes:update', 'classes:delete',
    'subjects:read', 'subjects:create', 'grades:read', 'grades:create', 'grades:update',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
  ],
  DISCIPLINE_MATERNELLE: [
    'school:read', 'students:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read',
    'profile:read', 'profile:update',
  ],
  DISCIPLINE_PRIMAIRE: [
    'school:read', 'students:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read',
    'profile:read', 'profile:update',
  ],
  DISCIPLINE_SECONDAIRE: [
    'school:read', 'students:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read',
    'profile:read', 'profile:update',
  ],
  HEAD_TEACHER: [
    'students:read', 'students:create', 'students:update',
    'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'classes:update',
    'subjects:read',
    'discipline:read', 'discipline:create',
    'convocations:read', 'convocations:create',
    'homework:read', 'homework:create',
    'communications:read',
    'stats:read',
  ],
  TEACHER: [
    'students:read',
    'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'subjects:read',
    'homework:read', 'homework:create',
    'discipline:read',
    'communications:read',
  ],
  PARENT: [
    'students:read', 'payments:read', 'grades:read', 'convocations:read', 'convocations:update', 'profile:read', 'profile:update',
    'communications:read', 'homework:read', 'discipline:read', 'stats:read',
  ],
  DISCIPLINE: [
    'students:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create',
    'communications:read',
    'stats:read',
  ],
  SCHOOL_ADMIN: [
    'users:read', 'users:create', 'users:update', 'users:delete',
    'students:read', 'students:create', 'students:update', 'students:delete',
    'payments:read', 'payments:create', 'payments:update', 'payments:verify',
    'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'classes:create', 'classes:update', 'classes:delete',
    'subjects:read', 'subjects:create',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'stats:read', 'profile:read', 'profile:update',
    'schools:read',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
  ],
};

export async function requirePermission(request: NextRequest, permission: string): Promise<{ user: AuthUser } | { error: Response }> {
  const authResult = await requireAuth(request);
  if ('error' in authResult) return authResult;
  const perms = ROLE_PERMISSIONS[authResult.user.role] || [];
  if (!perms.includes('*') && !perms.includes(permission)) {
    return { error: Response.json({ error: 'Permission insuffisante' }, { status: 403 }) };
  }
  return authResult;
}

// ─── School access verification ────────────────────────────────────────────
export function verifySchoolAccess(user: AuthUser, schoolId: string | null): boolean {
  if (user.role === 'SUPER_ADMIN_GLOBAL') return true;
  return user.schoolId === schoolId;
}

// ─── Parent access verification ────────────────────────────────────────────
export async function verifyParentAccess(user: AuthUser, studentId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN_GLOBAL' || user.role === 'SECRETARY' || user.role === 'DIRECTION') return true;
  if (user.role !== 'PARENT') return true;
  const student = await db.student.findUnique({ where: { id: studentId }, select: { parentId: true } });
  if (!student) return false;
  return student.parentId === user.id;
}

// ─── Safe int parser ───────────────────────────────────────────────────────
export function safeParseInt(value: string | null, defaultValue: number, min?: number, max?: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  let result = parsed;
  if (min !== undefined && result < min) result = min;
  if (max !== undefined && result > max) result = max;
  return result;
}

// ─── Rate limiter ──────────────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) { rateLimitStore.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// ─── Role validation ───────────────────────────────────────────────────────
const ALLOWED_CREATION_ROLES = ['SECRETARY', 'CASHIER', 'TEACHER', 'HEAD_TEACHER', 'PARENT', 'DISCIPLINE', 'DIRECTION'];
const DIRECTION_ROLES = ['DIRECTION', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];
const DISCIPLINE_ROLES = ['DISCIPLINE', 'DISCIPLINE_MATERNELLE', 'DISCIPLINE_PRIMAIRE', 'DISCIPLINE_SECONDAIRE'];

export function canCreateRole(creatorRole: string, targetRole: string): boolean {
  if (creatorRole === 'SUPER_ADMIN_GLOBAL') return true;
  // DIRECTION, DIRECTION_*, and SCHOOL_ADMIN can create most roles
  if (DIRECTION_ROLES.includes(creatorRole) || creatorRole === 'SCHOOL_ADMIN') return ALLOWED_CREATION_ROLES.includes(targetRole);
  // SECRETARY can create most roles
  if (creatorRole === 'SECRETARY') return ALLOWED_CREATION_ROLES.includes(targetRole);
  // DISCIPLINE_* can only create TEACHER and HEAD_TEACHER
  if (DISCIPLINE_ROLES.includes(creatorRole)) {
    return ['TEACHER', 'HEAD_TEACHER'].includes(targetRole);
  }
  return false;
}

export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return process.env.NODE_ENV === 'production' ? 'Une erreur interne est survenue' : error.message;
  }
  return 'Une erreur inconnue est survenue';
}
