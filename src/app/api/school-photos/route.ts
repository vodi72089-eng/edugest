import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError, type AuthUser } from '@/lib/auth';
import { getTierLimits } from '@/lib/subscription';

// ── Galerie photos publique de l'école ────────────────────────────────────
// POST /api/school-photos  { schoolId, url, caption? }
//   - Réservé SAG + SCHOOL_ADMIN (mêmes rôles que l'accès Paramètres)
//   - Limite forfait (getTierLimits().maxPhotos) appliquée CÔTÉ SERVEUR :
//     school:update est refusé en FREEMIUM/ESSENTIEL, on ne peut donc pas
//     s'appuyer dessus — la galerie doit rester ouverte dès FREEMIUM (1 photo).
//   - Le client envoie d'abord le fichier à POST /api/upload (multipart),
//     puis appelle cette route avec l'URL obtenue.

const MANAGE_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN'];

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'school:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!MANAGE_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Seul un administrateur peut gérer la galerie' }, { status: 403 });
    }

    const body = await request.json();
    const schoolId = typeof body.schoolId === 'string' ? body.schoolId : '';
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const caption = typeof body.caption === 'string' ? body.caption.trim().slice(0, 140) : '';
    if (!schoolId || !url) {
      return NextResponse.json({ error: 'schoolId et url requis' }, { status: 400 });
    }
    if (!url.startsWith('/api/upload/')) {
      return NextResponse.json({ error: 'URL de fichier invalide' }, { status: 400 });
    }

    // SAG : école explicite obligatoire (accès à toute école) ; rôles école :
    // scellés sur leur propre école (verifySchoolAccess refuse les autres).
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    // ── Limite forfait (réelle, côté serveur) ────────────────────────────
    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { subscriptionTier: true },
    });
    if (!school) {
      return NextResponse.json({ error: 'École inconnue' }, { status: 404 });
    }
    const maxPhotos = getTierLimits(school.subscriptionTier).maxPhotos;
    const current = await db.schoolPhoto.count({ where: { schoolId } });
    if (current >= maxPhotos) {
      return NextResponse.json({
        error: `Limite du forfait atteinte (${maxPhotos} photo${maxPhotos > 1 ? 's' : ''} maximum)`,
        featureRequired: 'photos',
        currentCount: current,
        maxPhotos,
        tier: school.subscriptionTier,
      }, { status: 403 });
    }

    const photo = await db.schoolPhoto.create({
      data: { schoolId, url, caption: caption || null },
    });

    return NextResponse.json({ data: photo, remaining: maxPhotos - current - 1 }, { status: 201 });
  } catch (error) {
    console.error('Error creating school photo:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
