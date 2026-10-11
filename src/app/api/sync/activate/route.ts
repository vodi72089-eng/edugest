import { NextRequest, NextResponse } from 'next/server';
import { sanitizeError } from '@/lib/auth';
import { checkRateLimitDb } from '@/lib/rate-limit-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sync/activate — activation de la synchronisation DEPUIS l'exe.
//
// L'exe (renderer, origine http://127.0.0.1:PORT) ne peut pas appeler
// directement la plateforme : le navigateur bloque la requête cross-origin
// (pas d'en-têtes CORS sur /api/sync/token) → « Failed to fetch » dans les
// Réglages. Ce proxy LOCAL refait la requête serveur→serveur (pas de CORS),
// comme /api/sync/send le fait déjà pour l'envoi.
//
// Le mot de passe ne sert qu'à l'authentification plateforme (HTTPS) et n'est
// ni stocké ni journalisé ; la réponse de la plateforme est relayée telle quelle.
//
// SÉCURITÉ : même double verrou que l'import .db et le pull (user-agent
// Electron + hôte local) — aucun navigateur public n'y accède.
export async function POST(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || '';
  if (!/electron/i.test(userAgent)) {
    return NextResponse.json({ error: 'Réservé à l\'application desktop EduGest.' }, { status: 403 });
  }
  const host = (request.nextUrl.hostname || request.headers.get('host') || '').split(':')[0];
  if (!/^(127\.0\.0\.1|localhost|\[::1\])$/i.test(host)) {
    return NextResponse.json({ error: 'Réservé à l\'application de bureau EduGest (locale).' }, { status: 403 });
  }

  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')?.trim() || 'unknown';
    if (!(await checkRateLimitDb(`sync-activate:ip:${clientIp}`, 10, 60 * 60 * 1000))) {
      return NextResponse.json({ error: 'Trop de tentatives — réessayez plus tard.' }, { status: 429 });
    }

    let body: { issuerUrl?: unknown; email?: unknown; password?: unknown };
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const issuer = String(body.issuerUrl || '').trim().replace(/\/+$/, '');
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    if (!/^https?:\/\//i.test(issuer) || !email || !password) {
      return NextResponse.json(
        { error: 'Adresse de la plateforme, email et mot de passe requis.' },
        { status: 400 },
      );
    }

    let res: Response;
    try {
      res = await fetch(`${issuer}/api/sync/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return NextResponse.json(
        { error: 'Plateforme injoignable — vérifiez votre connexion internet.' },
        { status: 503 },
      );
    }
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
