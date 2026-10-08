import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { sanitizeError } from '@/lib/auth';
import { checkRateLimitDb } from '@/lib/rate-limit-db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sync/token — émet UN jeton de synchronisation lié à une école.
// Corps : { email, password, schoolId? }.
// - L'email+mot de passe sont vérifiés contre les COMPTES PLATEFORME (Neon).
//   Seul un SCHOOL_ADMIN actif (école = la sienne) ou SUPER_ADMIN_GLOBAL
//   (école = body.schoolId explicite) obtient un jeton.
// - AUCUNE session créée, mot de passe jamais stocké ni journalisé.
// - Réponse générique 401 (pas d'énumération de comptes).
// - Rate-limit strict anti-bruteforce : 10 essais / heure / email.

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    let body: any = null;
    try {
      body = await request.json();
    } catch {
      return err('Corps JSON invalide', 400);
    }
    const email = String(body?.email || '').trim();
    const password = String(body?.password || '');
    if (!email || !password) return err('Identifiants refusés', 401);

    if (!(await checkRateLimitDb(`sync-token:${email}`, 10, 60 * 60 * 1000))) {
      return err('Trop de tentatives — réessayez dans une heure', 429);
    }

    const candidate = await db.user.findUnique({ where: { email } });
    const hash: string | null =
      candidate && candidate.isActive && typeof candidate.password === 'string'
        ? candidate.password
        : null;
    // Comparaison en temps quasi-constant même si compte inexistant
    // (hash poubelle) pour ne pas révéler l'existence du compte.
    const ok = await bcrypt.compare(password, hash || '$2b$12$POUBELLEPOUBELLEPOUBELLEPOUBELLEPOUBELLEPOUBE');
    if (!ok || !candidate) return err('Identifiants refusés', 401);

    let schoolId: string | null = null;
    if (candidate.role === 'SUPER_ADMIN_GLOBAL') {
      const requested = typeof body.schoolId === 'string' ? body.schoolId : '';
      if (!requested) {
        return err('École à lier requise (SAG)', 400);
      }
      schoolId = requested;
    } else if (candidate.role === 'SCHOOL_ADMIN') {
      if (!candidate.schoolId) return err('École non trouvée', 404);
      schoolId = candidate.schoolId;
    } else {
      return err('Réservé aux administrateurs d’école', 403);
    }
    if (!schoolId) return err('École non trouvée', 404);

    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, isActive: true },
    });
    if (!school || !school.isActive) return err('École non trouvée', 404);

    let issued: { token: string; expiresAt: string };
    try {
      const { issueSyncToken } = await import('@/lib/sync-token');
      issued = issueSyncToken(school.id);
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Émission impossible', 503);
    }

    return NextResponse.json({
      data: {
        token: issued.token,
        schoolId: school.id,
        schoolName: school.name,
        expiresAt: issued.expiresAt,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
