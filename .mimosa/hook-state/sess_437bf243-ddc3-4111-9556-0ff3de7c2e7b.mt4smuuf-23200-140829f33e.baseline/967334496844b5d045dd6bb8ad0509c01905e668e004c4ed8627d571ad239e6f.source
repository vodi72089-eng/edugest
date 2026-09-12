import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  sanitizeError,
  revokeSessionBySid,
} from '@/lib/auth';

// POST /api/sessions/revoke
// Body: { sid } — revoke a single session by its public sid.
// The current session CANNOT be revoked via this endpoint (must use /api/auth/logout
// instead) to avoid accidental self-lockout.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json().catch(() => ({}));
    const { sid } = body as { sid?: string };

    if (!sid || typeof sid !== 'string') {
      return NextResponse.json(
        { error: 'Le paramètre sid est requis' },
        { status: 400 }
      );
    }

    // Fetch current sessions to ensure we don't revoke the current one.
    const { getTokenFromRequest, listUserSessions } = await import('@/lib/auth');
    const currentToken = getTokenFromRequest(request) || undefined;
    const sessions = listUserSessions(user.id, currentToken);
    const target = sessions.find((s) => s.sid === sid);
    if (!target) {
      return NextResponse.json(
        { error: 'Session introuvable ou déjà révoquée' },
        { status: 404 }
      );
    }
    if (target.isCurrent) {
      return NextResponse.json(
        { error: 'Utilisez "Se déconnecter" pour terminer la session actuelle' },
        { status: 400 }
      );
    }

    const revoked = revokeSessionBySid(user.id, sid);
    if (!revoked) {
      return NextResponse.json(
        { error: 'Impossible de révoquer la session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { ok: true },
      message: 'Appareil déconnecté',
    });
  } catch (error) {
    console.error('[sessions/revoke] error:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
