import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createToken, getClientIp, getUserAgentFromRequest, checkRateLimit } from '@/lib/auth';
import { checkSubscription } from '@/lib/subscription';
import { notify } from '@/lib/notify';

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

// Simple in-memory rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, phone, password, client } = body;

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
    if (!checkRateLimit(`login_ip_${ip}`, 30, LOGIN_WINDOW_MS)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez plus tard.' },
        { status: 429 }
      );
    }

    const identifier = email || phone;
    const attempts = loginAttempts.get(identifier);
    if (attempts) {
      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
      if (timeSinceLastAttempt < LOGIN_WINDOW_MS && attempts.count >= MAX_LOGIN_ATTEMPTS) {
        return NextResponse.json(
          { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
          { status: 429 }
        );
      }
      if (timeSinceLastAttempt >= LOGIN_WINDOW_MS) {
        loginAttempts.delete(identifier);
      }
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
      // Increment failed attempts
      const current = loginAttempts.get(identifier) || { count: 0, lastAttempt: 0 };
      loginAttempts.set(identifier, { count: current.count + 1, lastAttempt: Date.now() });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Anti-enumeration : un compte désactivé ou sans mot de passe répond
    // exactement comme un mauvais identifiant — impossible de deviner l'état
    // d'un compte de l'extérieur. Le frontend traduit ce message.
    if (!user.isActive || !user.password) {
      const current = loginAttempts.get(identifier) || { count: 0, lastAttempt: 0 };
      loginAttempts.set(identifier, { count: current.count + 1, lastAttempt: Date.now() });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // ── Verify Password ──────────────────────────────────────────────────
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      const current = loginAttempts.get(identifier) || { count: 0, lastAttempt: 0 };
      loginAttempts.set(identifier, { count: current.count + 1, lastAttempt: Date.now() });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
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
