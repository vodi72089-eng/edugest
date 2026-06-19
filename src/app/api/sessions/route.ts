import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  sanitizeError,
  getTokenFromRequest,
  listUserSessions,
  revokeSessionBySid,
  revokeAllUserSessionsExcept,
} from '@/lib/auth';

// GET /api/sessions — list the current user's active sessions (connected
// devices). The current session is flagged with isCurrent=true.
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const currentToken = getTokenFromRequest(request) || undefined;
    const sessions = listUserSessions(user.id, currentToken);

    return NextResponse.json({ data: sessions });
  } catch (error) {
    console.error('[sessions] GET error:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
