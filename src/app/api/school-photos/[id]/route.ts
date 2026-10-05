import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';

// PATCH /api/school-photos/[id] — met à jour la légende d'une photo.
// Réservé SAG + SCHOOL_ADMIN (mêmes rôles que l'ajout/suppression).

const MANAGE_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'school:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!MANAGE_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Seul un administrateur peut gérer la galerie' }, { status: 403 });
    }

    const { id } = await params;
    const photo = await db.schoolPhoto.findUnique({ where: { id } });
    if (!photo) {
      return NextResponse.json({ error: 'Photo introuvable' }, { status: 404 });
    }
    if (!verifySchoolAccess(user, photo.schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const body = await request.json();
    const caption = typeof body.caption === 'string' ? body.caption.trim().slice(0, 140) : '';

    const updated = await db.schoolPhoto.update({
      where: { id },
      data: { caption: caption || null },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Error updating school photo caption:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
