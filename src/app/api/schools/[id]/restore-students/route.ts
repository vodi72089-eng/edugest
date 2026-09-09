import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { restoreArchivedStudents } from '@/lib/archive';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'students:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    // Vérifier l'accès à l'école
    if (!verifySchoolAccess(user, id)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Récupérer le tier actuel de l'école
    const school = await db.school.findUnique({
      where: { id },
      select: { subscriptionTier: true },
    });

    if (!school) {
      return NextResponse.json({ error: 'École introuvable' }, { status: 404 });
    }

    const tier = school.subscriptionTier || 'FREEMIUM';
    const result = await restoreArchivedStudents(id, tier);

    return NextResponse.json({ 
      data: result,
      message: result.restored > 0 
        ? `${result.restored} élève(s) restauré(s)` 
        : 'Aucun élève à restaurer'
    });
  } catch (error) {
    console.error('Error restoring students:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
