import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createToken, getClientIp, getUserAgentFromRequest, checkRateLimit } from '@/lib/auth';

// Simple in-memory rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, phone, password } = body;

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
    const user = email
      ? await db.user.findUnique({ where: { email } })
      : await db.user.findUnique({ where: { phone } });

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

    // ── Clear rate limit on success ──────────────────────────────────────
    loginAttempts.delete(identifier);

    // ── Check account verification ─────────────────────────────────────
    // First user (SUPER_ADMIN_GLOBAL) is auto-verified during school creation
    // Other users must verify via OTP before logging in
    if (!user.isVerified && user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json(
        {
          error: 'Compte non vérifié. Vérifiez votre email ou téléphone.',
          requiresVerification: true,
          userId: user.id,
          phone: user.phone,
          email: user.email,
        },
        { status: 403 }
      );
    }

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

    // Return user data without password + token
    const { password: _, ...userData } = user;

    const school = await db.school.findUnique({
      where: { id: user.schoolId },
      select: { id: true, name: true, shortName: true, city: true, country: true, subscriptionTier: true },
    });

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
