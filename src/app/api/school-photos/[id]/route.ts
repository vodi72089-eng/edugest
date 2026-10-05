import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';

// PATCH /api/school-photos/[id] — met à jour la légende d'une photo.
// DELETE /api/school-photos/[id] — supprime la photo (DB + fichier sur disque).
// Réservé SAG + SCHOOL_ADMIN (mêmes rôles que l'ajout/modification).

const MANAGE_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN'];

// Racine des fichiers servis par GET /api/upload/[...path] (même convention
// que src/app/api/upload/route.ts). La suppression du fichier reste TOUJOURS
// à l'intérieur de ce dossier (aucun ../ ne peut en sortir).
const UPLOAD_DIR = path.resolve(process.cwd(), 'upload');

/** Supprime le fichier disque correspondant à une URL /api/upload/<nom>.
 *  Retourne true si un fichier a été supprimé, false si absent/hors dossier. */
function deleteUploadFile(url: string): boolean {
  try {
    const name = (url || '').replace(/^\/api\/upload\//, '');
    // Garde anti-traversée : nom simple (jamais de séparateur ni de « .. »).
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) return false;
    const filePath = path.resolve(UPLOAD_DIR, name);
    if (!filePath.startsWith(UPLOAD_DIR + path.sep)) return false;
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  } catch {
    // Un échec de suppression disque ne doit pas masquer la suppression DB —
    // la photo resterait sinon visible avec son entrée, fichier orphelin ou non.
    return false;
  }
}

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

// DELETE /api/school-photos/[id] — supprime une photo de la galerie.
// Mêmes gardes que PATCH : authentification + rôle gestionnaire + appartenance
// à l'école de la photo. Le fichier physique est supprimé (pas d'orphelin).
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
    // Cloisonnement inter-écoles : un admin ne supprime que dans SA salle
    // (le SAG passe toujours — schoolId null côté vérification plateforme).
    if (!verifySchoolAccess(user, photo.schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    await db.schoolPhoto.delete({ where: { id } });
    const fileDeleted = deleteUploadFile(photo.url);

    return NextResponse.json({ data: { ok: true, fileDeleted } });
  } catch (error) {
    console.error('Error deleting school photo:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
