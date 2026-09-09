import { NextRequest, NextResponse } from 'next/server';
import { sanitizeError, getTokenFromRequest, revokeSessionByToken } from '@/lib/auth';

// POST /api/auth/logout
// Destroys the current server-side session file and clears the auth cookie.
// The frontend also clears localStorage; this endpoint makes the session file
// disappear immediately so it can't be reused (previously the file lingered
// until natural expiry at 24h).
export async function POST(request: NextRequest) {
  try {
    const currentToken = getTokenFromRequest(request);
    if (currentToken) {
      revokeSessionByToken(currentToken);
    }

    const response = NextResponse.json({ data: { ok: true } });
    response.cookies.set('edugest_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('[logout] Error:', error);
    // Even on error, clear the cookie so the client is logged out.
    const response = NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
    response.cookies.set('edugest_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    return response;
  }
}
