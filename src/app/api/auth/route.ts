import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createToken, getClientIp, getUserAgentFromRequest, checkRateLimit } from '@/lib/auth';
import { checkSubscription } from '@/lib/subscription';
import { notify } from '@/lib/notify';
import { repairPlatformAdminIntegrity } from '@/lib/role-repair';

const MOBILE_ELIGIBLE_TIERS = new Set(['PREMIUM', 'ENTERPRISE', 'CORPORATE']);

function hasActiveMobileSubscription(school: {
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  subscriptionEndDate: Date | null;
} | null): boolean {
  if (!school || !MOBILE_ELIGIBLE_TIERS.has(school.subscriptionTier || 'FREEMIUM')) return false;
  if ((school.subscriptionStatus || 'ACTIVE') !== 'ACTIVE') return false;
  return !school.subscriptionEndDate || school.subscriptionEndDate >= new Date();
}

// ── Verrou progressif par compte ──────────────────────────────────────────────
// 5 échecs → 1 min ; +5 (cumul 10) → 3 min ; +3 (cumul 13) → 10 min ;
// +2 (cumul 15) → 20 min ; au-delà, chaque échec double la durée (cap 24 h).
// Le client reçoit retryAfterSeconds/lockSeconds pour désactiver le bouton
// avec un compte à rebours — plus de blocage serveur fixe de 15 minutes.
// Stocké sur globalThis : survit au rechargement des modules en dev.
const loginAttempts: Map<string, { count: number; lockedUntil: number; lastLockSeconds: number; lastAttempt: number }> =
  ((globalThis as unknown as { __edugestLoginAttempts?: Map<string, { count: number; lockedUntil: number; lastLockSeconds: number; lastAttempt: number }> }).__edugestLoginAttempts =
    (globalThis as unknown as { __edugestLoginAttempts?: Map<string, { count: number; lockedUntil: number; lastLockSeconds: number; lastAttempt: number }> }).__edugestLoginAttempts ||
    new Map());
const LOCK_SCHEDULE: Array<{ at: number; seconds: number }> = [
  { at: 5, seconds: 60 },
  { at: 10, seconds: 180 },
  { at: 13, seconds: 600 },
  { at: 15, seconds: 1200 },
];
const MAX_LOCK_SECONDS = 24 * 60 * 60;
const ATTEMPTS_TTL_MS = 24 * 60 * 60 * 1000;

function computeLockSeconds(count: number, lastLockSeconds: number): number | null {
  const step = LOCK_SCHEDULE.find(s => s.at === count);
  if (step) return step.seconds;
  if (count > LOCK_SCHEDULE[LOCK_SCHEDULE.length - 1].at) {
    return Math.min(lastLockSeconds > 0 ? lastLockSeconds * 2 : 1200, MAX_LOCK_SECONDS);
  }
  return null;
}

// Incrémente le compteur d'échecs et renvoie le verrou éventuellement déclenché.
function registerFailure(identifier: string): { lockSeconds: number; lockedUntil: number } | null {
  const prev = loginAttempts.get(identifier);
  const count = (prev?.count || 0) + 1;
  const lockSeconds = computeLockSeconds(count, prev?.lastLockSeconds || 0);
  const lockedUntil = lockSeconds ? Date.now() + lockSeconds * 1000 : 0;
  loginAttempts.set(identifier, {
    count,
    lockedUntil,
    lastLockSeconds: lockSeconds || prev?.lastLockSeconds || 0,
    lastAttempt: Date.now(),
  });
  return lockSeconds ? { lockSeconds, lockedUntil } : null;
}

function getRemainingLock(identifier: string): number {
  const entry = loginAttempts.get(identifier);
  if (!entry) return 0;
  if (entry.lastAttempt && Date.now() - entry.lastAttempt > ATTEMPTS_TTL_MS) {
    loginAttempts.delete(identifier);
    return 0;
  }
  return entry.lockedUntil > Date.now() ? Math.ceil((entry.lockedUntil - Date.now()) / 1000) : 0;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Trim défensif : un espace copié-collé ne doit jamais invalider un identifiant
    const rawEmail = typeof body.email === 'string' ? body.email.trim() : body.email;
    const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : body.phone;
    const { password, client } = body;
    const email = rawEmail;
    const phone = rawPhone;

    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    if (!email && !phone) {
      return NextResponse.json(
        { error: 'Email or phone is required' },
        { status: 400 }
      );
    }

    // ── Rate Limiting ────────────────────────────────────────────────────
    // IP-based limit: prevents distributed brute-force that rotates emails/phones
    const ip = getClientIp(request) || 'unknown';
    if (!checkRateLimit(`login_ip_${ip}`, 30, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez plus tard.' },
        { status: 429 }
      );
    }

    const identifier = (email || phone || '').toLowerCase();
    const remainingLock = getRemainingLock(identifier);
    if (remainingLock > 0) {
      return NextResponse.json(
        {
          error: `Trop de tentatives. Réessayez dans ${Math.ceil(remainingLock / 60)} minute${remainingLock > 120 ? 's' : ''}.`,
          retryAfterSeconds: remainingLock,
        },
        { status: 429 }
      );
    }

    // ── Find User ────────────────────────────────────────────────────────
    // Le champ « email » peut contenir un email OU un numéro WhatsApp
    // (connexion parent par téléphone) — fallback phone si l'email est inconnu.
    let user: Awaited<ReturnType<typeof db.user.findUnique>> = null;
    if (email) {
      user = await db.user.findUnique({ where: { email } });
      if (!user) {
        user = await db.user.findUnique({ where: { phone: email } });
      }
    } else if (phone) {
      user = await db.user.findUnique({ where: { phone } });
    }

    if (!user) {
      // Échec : incrémente le compteur et déclenche éventuellement un verrou progressif
      const lock = registerFailure(identifier);
      const payload: Record<string, unknown> = { error: 'Invalid credentials' };
      if (lock) {
        payload.lockSeconds = lock.lockSeconds;
        payload.lockedUntil = new Date(lock.lockedUntil).toISOString();
      }
      return NextResponse.json(payload, { status: 401 });
    }

    // Anti-enumeration : un compte désactivé ou sans mot de passe répond
    // exactement comme un mauvais identifiant — impossible de deviner l'état
    // d'un compte de l'extérieur. Le frontend traduit ce message.
    if (!user.isActive || !user.password) {
      // Anti-énumération : même traitement qu'un mauvais mot de passe
      const lock = registerFailure(identifier);
      const payload: Record<string, unknown> = { error: 'Invalid credentials' };
      if (lock) {
        payload.lockSeconds = lock.lockSeconds;
        payload.lockedUntil = new Date(lock.lockedUntil).toISOString();
      }
      return NextResponse.json(payload, { status: 401 });
    }

    // ── Verify Password ──────────────────────────────────────────────────
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      const lock = registerFailure(identifier);
      const payload: Record<string, unknown> = { error: 'Invalid credentials' };
      if (lock) {
        payload.lockSeconds = lock.lockSeconds;
        payload.lockedUntil = new Date(lock.lockedUntil).toISOString();
      }
      return NextResponse.json(payload, { status: 401 });
    }

    // ── Integrity repair : roles administratifs ─────────────────────────
    // Le SUPER_ADMIN_GLOBAL est l'admin de la PLATEFORME : il ne doit être
    // rattaché à aucune école (bug historique des anciens seeds — il passait
    // pour l'admin de la 1re école). Réparation idempotente + garantie que
    // chaque école dispose d'un admin d'école (SCHOOL_ADMIN). Non bloquant.
    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      try {
        await repairPlatformAdminIntegrity();
        // Relecture : schoolId (et compte) peuvent avoir été corrigés juste au-dessus.
        const fresh = await db.user.findUnique({ where: { id: user.id } });
        if (fresh) user = fresh;
      } catch (e) {
        console.error('[auth] réparation rôles (non bloquante) :', (e as Error)?.message);
      }
    }

    // L'application mobile est une offre Premium : cette règle est appliquée
    // côté serveur afin qu'elle ne puisse pas être contournée par l'interface.
    if (client === 'mobile') {
      const mobileSchool = user.schoolId
        ? await db.school.findUnique({
            where: { id: user.schoolId },
            select: { subscriptionTier: true, subscriptionStatus: true, subscriptionEndDate: true },
          })
        : null;

      if (!hasActiveMobileSubscription(mobileSchool)) {
        return NextResponse.json(
          {
            error: "L'application mobile est réservée aux écoles disposant d'un abonnement Professionnel actif ou supérieur.",
            mobileAccessDenied: true,
          },
          { status: 403 }
        );
      }
    }

    // ── Clear rate limit on success ──────────────────────────────────────
    loginAttempts.delete(identifier);

    // ── Check account verification ─────────────────────────────────────
    // OTP verification disabled: allow all users to login
    // if (!user.isVerified && user.role !== 'SUPER_ADMIN_GLOBAL') {
    //   return NextResponse.json(
    //     {
    //       error: 'Compte non vérifié. Vérifiez votre email ou téléphone.',
    //       requiresVerification: true,
    //       userId: user.id,
    //       phone: user.phone,
    //       email: user.email,
    //     },
    //     { status: 403 }
    //   );
    // }

    // ── Update last login ────────────────────────────────────────────────
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // ── Create session token (with device metadata for connected-devices list) ─
    const token = await createToken({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      schoolId: user.schoolId,
      isActive: user.isActive,
    }, {
      userAgent: getUserAgentFromRequest(request),
      ip: getClientIp(request),
    });

    // ── Rappel d'expiration d'abonnement (non-bloquant) ──────────────────
    // Si la formule payante de l'école expire dans ≤ 14 jours, une notification
    // est créée (dédupliquée : pas de doublon tant qu'une non-lue existe).
    void (async () => {
      try {
        const sub = await checkSubscription(user.schoolId);
        if (sub.tier === 'FREEMIUM' || sub.daysRemaining === null || sub.daysRemaining > 14) return;
        const existing = await db.notification.findFirst({
          where: { userId: user.id, type: 'SUBSCRIPTION_EXPIRING', isRead: false },
          select: { id: true },
        });
        if (existing) return;
        const when =
          sub.daysRemaining <= 0
            ? "expire aujourd'hui"
            : sub.daysRemaining === 1
              ? 'expire demain'
              : `expire dans ${sub.daysRemaining} jours`;
        await notify({
          data: {
            userId: user.id,
            schoolId: user.schoolId,
            type: 'SUBSCRIPTION_EXPIRING',
            title: 'Abonnement bientôt expiré',
            message: `Votre abonnement ${sub.tier} ${when}. Renouvelez-le pour garder l'accès complet.`,
          },
        });
      } catch (e) {
        console.error('[auth] rappel abonnement (non-bloquant) :', (e as Error)?.message);
      }
    })();

    // Return user data without password + token
    const { password: _, ...userData } = user;

    // École : enrichissement non-bloquant — un schéma local en retard ne doit
    // jamais empêcher la connexion (le login est un chemin critique).
    const LOGIN_SCHOOL_SELECT = {
      id: true, name: true, shortName: true, city: true, country: true,
      subscriptionTier: true, logo: true,
      designPrimary: true, designAccent: true, designGold: true,
    } as const;
    let school: Prisma.SchoolGetPayload<{ select: typeof LOGIN_SCHOOL_SELECT }> | null = null;
    try {
      school = user.schoolId ? await db.school.findUnique({
        where: { id: user.schoolId },
        select: LOGIN_SCHOOL_SELECT,
      }) : null;
    } catch (e) {
      console.error('[auth] école introuvable (non-bloquant) :', (e as Error)?.message);
    }

    const response = NextResponse.json({
      data: {
        ...userData,
        school,
        token,
      },
    });

    // Set HTTP-only cookie
    response.cookies.set('edugest_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Error during login:', error?.message, error?.stack);
    return NextResponse.json({ error: 'Login failed', detail: error?.message }, { status: 500 });
  }
}
