import { db } from './db';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

// ─── Session store (file-based, survives HMR) ────────────────────────────
const SESSIONS_DIR = path.join(process.cwd(), '.sessions');
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

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

function writeSession(token: string, data: { userId: string; expiresAt: number }) {
  try {
    ensureSessionsDir();
    const dir = path.join(SESSIONS_DIR, token.slice(0, 2));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getSessionPath(token), JSON.stringify(data), 'utf-8');
  } catch {
    // Silently fail — fallback to in-memory won't work but won't crash either
  }
}

function readSession(token: string): { userId: string; expiresAt: number } | null {
  try {
    const sessionPath = getSessionPath(token);
    if (!fs.existsSync(sessionPath)) return null;
    const raw = fs.readFileSync(sessionPath, 'utf-8');
    return JSON.parse(raw);
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

export function createSession(userId: string): string {
  const token = crypto.randomUUID();
  const session = { userId, expiresAt: Date.now() + SESSION_DURATION_MS };
  writeSession(token, session);
  return token;
}

export function validateSession(token: string): { userId: string } | null {
  const session = readSession(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) { deleteSession(token); return null; }
  return { userId: session.userId };
}

export async function createToken(userData: {
  id: string; name: string; email: string | null; phone: string | null;
  role: string; schoolId: string | null; isActive: boolean;
}): Promise<string> {
  return createSession(userData.id);
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
  const session = validateSession(authHeader.slice(7));
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
    'profile:read', 'profile:update',
  ],
  DISCIPLINE_PRIMAIRE: [
    'school:read', 'students:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
    'profile:read', 'profile:update',
  ],
  DISCIPLINE_SECONDAIRE: [
    'school:read', 'students:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
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
    'stats:read',
  ],
  TEACHER: [
    'students:read',
    'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'subjects:read',
    'homework:read', 'homework:create',
    'discipline:read',
  ],
  PARENT: [
    'students:read', 'payments:read', 'grades:read', 'convocations:read', 'profile:read', 'profile:update',
  ],
  DISCIPLINE: [
    'students:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create',
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

export function canCreateRole(creatorRole: string, targetRole: string): boolean {
  if (creatorRole === 'SUPER_ADMIN_GLOBAL') return true;
  if (creatorRole === 'SECRETARY' || creatorRole === 'DIRECTION') return ALLOWED_CREATION_ROLES.includes(targetRole);
  return false;
}

export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return process.env.NODE_ENV === 'production' ? 'Une erreur interne est survenue' : error.message;
  }
  return 'Une erreur inconnue est survenue';
}
