import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  requireAuth,
  sanitizeError,
  getTokenFromRequest,
  revokeAllUserSessionsExcept,
  checkRateLimit,
} from '@/lib/auth';

// POST /api/auth/change-password
// Body: { currentPassword, newPassword }
// Self-service password change for the authenticated user.
// After a successful change, all OTHER sessions are revoked (the current
// session is kept so the user isn't logged out immediately).
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // Rate limit: max 5 attempts / 15 min per user (brute-force protection on
    // the current password).
    if (!checkRateLimit(`change-pw:${user.id}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { currentPassword, newPassword } = body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Le mot de passe actuel et le nouveau mot de passe sont requis' },
        { status: 400 }
      );
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' },
        { status: 400 }
      );
    }

    if (newPassword.length > 128) {
      return NextResponse.json(
        { error: 'Le mot de passe ne peut pas dépasser 128 caractères' },
        { status: 400 }
      );
    }

    // Fetch the stored hash
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    });
    if (!dbUser || !dbUser.password) {
      return NextResponse.json(
        { error: 'Aucun mot de passe défini sur ce compte' },
        { status: 400 }
      );
    }

    // Verify current password
    const ok = await bcrypt.compare(currentPassword, dbUser.password);
    if (!ok) {
      return NextResponse.json(
        { error: 'Le mot de passe actuel est incorrect' },
        { status: 401 }
      );
    }

    // Reject "new == current" to avoid no-op changes
    const sameAsCurrent = await bcrypt.compare(newPassword, dbUser.password);
    if (sameAsCurrent) {
      return NextResponse.json(
        { error: 'Le nouveau mot de passe doit être différent du mot de passe actuel' },
        { status: 400 }
      );
    }

    // Hash & persist
    const hashed = await bcrypt.hash(newPassword, 12);
    await db.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    // Revoke all other sessions (force re-login on other devices)
    const currentToken = getTokenFromRequest(request);
    let revokedCount = 0;
    if (currentToken) {
      revokedCount = revokeAllUserSessionsExcept(user.id, currentToken);
    }

    return NextResponse.json({
      data: {
        revokedSessions: revokedCount,
      },
      message: 'Mot de passe modifié avec succès. Les autres appareils ont été déconnectés.',
    });
  } catch (error) {
    console.error('[change-password] Error:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
