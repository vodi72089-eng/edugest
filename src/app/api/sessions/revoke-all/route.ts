import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  sanitizeError,
  getTokenFromRequest,
  revokeAllUserSessionsExcept,
} from '@/lib/auth';

// POST /api/sessions/revoke-all
// Revokes ALL sessions for the current user EXCEPT the current one.
// Used by the "Disconnect all other devices" button.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const currentToken = getTokenFromRequest(request);
    if (!currentToken) {
      return NextResponse.json(
        { error: 'Session courante introuvable' },
        { status: 400 }
      );
    }

    const count = revokeAllUserSessionsExcept(user.id, currentToken);

    return NextResponse.json({
      data: { revoked: count },
      message: `${count} autre(s) appareil(s) déconnecté(s)`,
    });
  } catch (error) {
    console.error('[sessions/revoke-all] error:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
