import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { UPLOAD_DIR } from '@/app/api/upload/route';

// DELETE /api/school-photos/[id] — suppression d'une photo de la galerie.
// Réservé SAG + SCHOOL_ADMIN (mêmes rôles que l'ajout). Le fichier est
// retiré du disque si personne d'autre ne le référence.

const MANAGE_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN'];

export async function DELETE(
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

    await db.schoolPhoto.delete({ where: { id } });

    // Suppression du fichier du disque (best-effort : personne d'autre ne
    // doit le référencer — couverture + logo passent par d'autres champs).
    const stillUsed = await db.school.count({
      where: { OR: [{ logo: photo.url }, { coverImage: photo.url }] },
    }).catch(() => 1);
    if (stillUsed === 0 && photo.url.startsWith('/api/upload/')) {
      const name = photo.url.replace('/api/upload/', '');
      if (/^[a-zA-Z0-9._-]{1,120}$/.test(name) && !name.includes('..')) {
        const filePath = path.join(UPLOAD_DIR, name);
        if (filePath.startsWith(UPLOAD_DIR)) fs.rmSync(filePath, { force: true });
      }
    }

    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error('Error deleting school photo:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
