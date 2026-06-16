import { db } from './db';
import { NextRequest } from 'next/server';

// ─── Session store (in-memory) ────────────────────────────────────────────
const sessionStore = new Map<string, { userId: string; expiresAt: number }>();
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export function createSession(userId: string): string {
  const token = crypto.randomUUID();
  sessionStore.set(token, { userId, expiresAt: Date.now() + SESSION_DURATION_MS });
  return token;
}

export function validateSession(token: string): { userId: string } | null {
  const session = sessionStore.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) { sessionStore.delete(token); return null; }
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
