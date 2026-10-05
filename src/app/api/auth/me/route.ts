import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthTokenFromRequest, validateSession } from '@/lib/auth';

// GET /api/auth/me — « qui suis-je » à partir du COOKIE httpOnly.
// Utilisé par le frontend pour amorcer une session quand le localStorage est
// vide (connexion Google, changement de machine, navigation privée) : le
// token n'étant plus exposé au JavaScript, c'est le seul moyen de retrouver
// l'utilisateur connecté. Ne renvoie JAMAIS le token — uniquement le profil.

export async function GET(request: NextRequest) {
  try {
    const token = getAuthTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const session = await validateSession(token);
    if (!session) {
      return NextResponse.json({ error: 'Session expirée ou invalide' }, { status: 401 });
    }
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, phone: true, role: true, schoolId: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Compte désactivé ou introuvable' }, { status: 401 });
    }

    // École : enrichissement non-bloquant (même contrat que la connexion).
    let school: { id: string; name: string; shortName: string; subscriptionTier: string; logo: string | null } | null = null;
    if (user.schoolId) {
      try {
        school = await db.school.findUnique({
          where: { id: user.schoolId },
          select: { id: true, name: true, shortName: true, subscriptionTier: true, logo: true },
        });
      } catch (e) {
        console.error('[auth:me] école introuvable (non-bloquant) :', (e as Error)?.message);
      }
    }

    return NextResponse.json({ data: { user, school } });
  } catch (error) {
    console.error('[auth:me] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
