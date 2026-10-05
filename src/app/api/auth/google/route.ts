import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ─── Connexion Google — étape 1 : redirection vers Google ───────────────────
// OAuth 2.0 / OIDC (authorization code). Un `state` aléatoire est déposé en
// cookie httpOnly puis renvoyé par Google : le callback le compare avant tout
// échange (protection CSRF). Les credentials viennent des variables
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (Coolify en prod, .env.local en dev).

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  // redirect_uri : URL publique CANONIQUE (doit correspondre au Google Console)
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '');

  if (!clientId) {
    // Non configuré : message explicite via la page bridge (jamais un écran muet)
    return NextResponse.redirect(new URL('/oauth/success?error=config', request.nextUrl.origin));
  }

  const state = crypto.randomBytes(32).toString('base64url');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
  response.cookies.set('edugest_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 900, // 15 min : laisse le temps à l'écran de consentement Google
    path: '/',
  });
  return response;
}
