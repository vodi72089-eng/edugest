import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createToken } from '@/lib/auth';

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

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Account is deactivated' },
        { status: 403 }
      );
    }

    if (!user.password) {
      return NextResponse.json(
        { error: 'Account has no password set' },
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

    // ── Update last login ────────────────────────────────────────────────
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // ── Create JWT Token ─────────────────────────────────────────────────
    const token = await createToken({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      schoolId: user.schoolId,
      isActive: user.isActive,
    });

    // Return user data without password + token
    const { password: _, ...userData } = user;

    const school = await db.school.findUnique({
      where: { id: user.schoolId },
      select: { id: true, name: true, shortName: true, city: true, country: true },
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
  } catch (error) {
    console.error('Error during login:', error);
    return NextResponse.json({ error: 'Login failed', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
