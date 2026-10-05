import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { createSession, getClientIp, getUserAgentFromRequest, SESSION_DURATION_MS } from '@/lib/auth';

// ─── Connexion Google — étape 2 : callback ──────────────────────────────────
// 1. vérifie le `state` (cookie = query, comparaison à temps constant)
// 2. échange le code contre un access_token
// 3. récupère le profil (email DOIT être vérifié par Google)
// 4. retrouve le compte local par email — v1 « match-only » : aucun compte n'est
//    créé automatiquement (un administrateur crée les comptes ; OAuth se contente
//    de prouver l'identité) → aucun risque d'injection de rôle/school.
// 5. émet la session (même mécanisme fichier que la connexion classique) et
//    redirige vers la page bridge /oauth/success qui finalise côté SPA.

const FAILURES: Record<string, string> = {
  config: 'config',
  refused: 'refused',
  state: 'state',
  introuvable: 'introuvable',
  desactive: 'desactive',
  email: 'email',
  echec: 'echec',
};

function fail(origin: string, code: keyof typeof FAILURES) {
  return NextResponse.redirect(new URL(`/oauth/success?error=${FAILURES[code]}`, origin));
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return fail(origin, 'config');

    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const googleError = request.nextUrl.searchParams.get('error');
    if (googleError) return fail(origin, 'refused'); // access_denied, etc.
    if (!code || !state) return fail(origin, 'echec');

    // ── Anti-CSRF : le state reçu doit être celui qu'on a nous-mêmes émis ──
    const expected = request.cookies.get('edugest_oauth_state')?.value;
    const a = Buffer.from(expected ?? '', 'utf8');
    const b = Buffer.from(state, 'utf8');
    if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return fail(origin, 'state');
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '');
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    // ── Échange du code ─────────────────────────────────────────────────────
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenRes.ok) {
      console.error('[google-oauth] échange du code impossible :', tokenRes.status);
      return fail(origin, 'echec');
    }
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return fail(origin, 'echec');

    // ── Profil Google ───────────────────────────────────────────────────────
    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!profileRes.ok) return fail(origin, 'echec');
    const profile = (await profileRes.json()) as { email?: string; email_verified?: boolean };
    const email = (profile.email ?? '').trim().toLowerCase();
    if (!email || profile.email_verified === false) return fail(origin, 'email');

    // ── Compte local existant uniquement (v1 match-only) ────────────────────
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });
    if (!user) return fail(origin, 'introuvable');
    if (!user.isActive) return fail(origin, 'desactive');

    // ── Session : identique à la connexion par mot de passe ─────────────────
    const token = await createSession(user.id, {
      userAgent: getUserAgentFromRequest(request),
      ip: getClientIp(request),
    });

    // SÉCURITÉ : le token n'est PLUS mis dans l'URL (?token=…) — une URL se
    // retrouve dans l'historique navigateur, les logs serveur/proxy et
    // l'en-tête Referer. La session vit uniquement dans le cookie httpOnly
    // posé ci-dessous ; à l'arrivée le frontend détecte la session via
    // GET /api/auth/me (cookie), jamais via un secret dans l'URL.
    const successUrl = new URL('/', origin);
    const response = NextResponse.redirect(successUrl);
    response.cookies.set('edugest_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(SESSION_DURATION_MS / 1000),
      path: '/',
    });
    // Consommation du state (usage unique)
    response.cookies.set('edugest_oauth_state', '', {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    return response;
  } catch (e) {
    console.error('[google-oauth] callback :', e instanceof Error ? e.message : e);
    return fail(origin, 'echec');
  }
}
