import { db } from '@/lib/db';
import { SignJWT, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

// ─── Configuration ──────────────────────────────────────────────────────────

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'edugest-secret-key-change-in-production-2025'
);

const TOKEN_COOKIE_NAME = 'edugest_token';
const TOKEN_EXPIRY = '24h';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: string;
  schoolId: string;
  isActive: boolean;
}

export interface AuthResult {
  user: AuthUser;
  schoolId: string;
}

// ─── Role Hierarchy & Permissions ───────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN_GLOBAL: ['*'], // All permissions
  SCHOOL_ADMIN: [
    'school:read', 'school:update',
    'users:read', 'users:create', 'users:update', 'users:delete',
    'students:read', 'students:create', 'students:update', 'students:delete',
    'classes:read', 'classes:create', 'classes:update',
    'subjects:read', 'subjects:create',
    'grades:read', 'grades:create', 'grades:update',
    'payments:read', 'payments:create', 'payments:update', 'payments:verify',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update',
    'comments:approve', 'comments:delete',
  ],
  SECRETARY: [
    'school:read',
    'users:read', 'users:create', 'users:update',
    'students:read', 'students:create', 'students:update', 'students:delete',
    'classes:read', 'classes:create',
    'subjects:read', 'subjects:create',
    'grades:read',
    'payments:read', 'payments:create', 'payments:verify',
    'discipline:read',
    'communications:read', 'communications:create',
    'homework:read',
    'convocations:read', 'convocations:create',
    'stats:read', 'profile:read', 'profile:update',
  ],
  CASHIER: [
    'school:read',
    'students:read',
    'payments:read', 'payments:create', 'payments:update', 'payments:verify',
    'stats:read', 'profile:read', 'profile:update',
  ],
  DIRECTION_MATERNELLE: [
    'school:read',
    'users:read', 'students:read', 'students:update',
    'classes:read', 'subjects:read', 'grades:read', 'grades:create', 'grades:update',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update',
  ],
  DIRECTION_PRIMAIRE: [
    'school:read',
    'users:read', 'students:read', 'students:update',
    'classes:read', 'subjects:read', 'grades:read', 'grades:create', 'grades:update',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update',
  ],
  DIRECTION_SECONDAIRE: [
    'school:read',
    'users:read', 'students:read', 'students:update',
    'classes:read', 'subjects:read', 'grades:read', 'grades:create', 'grades:update',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update',
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
  TEACHER: [
    'school:read', 'students:read',
    'classes:read', 'subjects:read', 'grades:read', 'grades:create', 'grades:update',
    'homework:read', 'homework:create',
    'communications:read',
    'profile:read', 'profile:update',
  ],
  HEAD_TEACHER: [
    'school:read', 'students:read',
    'classes:read', 'subjects:read', 'grades:read', 'grades:create', 'grades:update',
    'homework:read', 'homework:create',
    'communications:read', 'communications:create',
    'profile:read', 'profile:update',
  ],
  PARENT: [
    'school:read',
    'students:read', // Only their own children (checked separately)
    'grades:read', // Only their children's grades
    'payments:read', // Only their children's payments
    'discipline:read', // Only their children's records
    'homework:read',
    'communications:read',
    'profile:read', 'profile:update',
  ],
};

// ─── Token Management ───────────────────────────────────────────────────────

export async function createToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    id: user.id,
    name: user.name,
    role: user.role,
    schoolId: user.schoolId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    
    // Verify user still exists and is active
    const user = await db.user.findUnique({
      where: { id: payload.id as string },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        schoolId: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return null;
    }

    // Check if role has changed since token was issued
    if (user.role !== payload.role) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

// ─── Request Auth Helpers ───────────────────────────────────────────────────

export function getTokenFromRequest(request: NextRequest): string | null {
  // Check Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookie
  const cookie = request.cookies.get(TOKEN_COOKIE_NAME);
  if (cookie?.value) {
    return cookie.value;
  }

  // Check custom header (for client-side stores that send token)
  const customHeader = request.headers.get('X-Auth-Token');
  if (customHeader) {
    return customHeader;
  }

  return null;
}

/**
 * Require authentication - returns user or error response
 */
export async function requireAuth(request: NextRequest): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const token = getTokenFromRequest(request);

  if (!token) {
    return {
      error: NextResponse.json(
        { error: 'Authentification requise' },
        { status: 401 }
      ),
    };
  }

  const user = await verifyToken(token);

  if (!user) {
    return {
      error: NextResponse.json(
        { error: 'Session invalide ou expirée' },
        { status: 401 }
      ),
    };
  }

  return { user };
}

/**
 * Require a specific permission
 */
export async function requirePermission(
  request: NextRequest,
  permission: string
): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const authResult = await requireAuth(request);

  if ('error' in authResult) {
    return authResult;
  }

  const user = authResult.user;
  const permissions = ROLE_PERMISSIONS[user.role];

  if (!permissions || (!permissions.includes(permission) && !permissions.includes('*'))) {
    return {
      error: NextResponse.json(
        { error: 'Accès non autorisé' },
        { status: 403 }
      ),
    };
  }

  return { user };
}

/**
 * Require one of the specified roles
 */
export async function requireRole(
  request: NextRequest,
  roles: string[]
): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const authResult = await requireAuth(request);

  if ('error' in authResult) {
    return authResult;
  }

  const user = authResult.user;

  if (!roles.includes(user.role) && user.role !== 'SUPER_ADMIN_GLOBAL') {
    return {
      error: NextResponse.json(
        { error: 'Accès non autorisé' },
        { status: 403 }
      ),
    };
  }

  return { user };
}

/**
 * Verify school access - user must belong to the school
 */
export function verifySchoolAccess(user: AuthUser, schoolId: string): boolean {
  // SUPER_ADMIN_GLOBAL can access any school
  if (user.role === 'SUPER_ADMIN_GLOBAL') return true;
  // Other roles can only access their own school
  return user.schoolId === schoolId;
}

/**
 * Verify parent-child relationship
 */
export async function verifyParentAccess(user: AuthUser, studentId: string): Promise<boolean> {
  if (user.role !== 'PARENT') return true; // Non-parents bypass this check
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { parentId: true },
  });
  return student?.parentId === user.id;
}

// ─── Utility: Safe Parse Int ────────────────────────────────────────────────

export function safeParseInt(value: string | null, defaultValue: number, min: number = 1, max: number = 100): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value);
  if (isNaN(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, min), max);
}

// ─── Utility: Sanitize Error ────────────────────────────────────────────────

export function sanitizeError(error: unknown): string {
  if (process.env.NODE_ENV === 'production') {
    return 'Une erreur est survenue';
  }
  return error instanceof Error ? error.message : 'Unknown error';
}
