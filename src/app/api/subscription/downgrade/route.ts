import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { archiveExcessStudents } from '@/lib/archive';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { schoolId, newTier } = body;

    if (!schoolId || !newTier) {
      return NextResponse.json(
        { error: 'schoolId et newTier requis' },
        { status: 400 }
      );
    }

    // Vérifier l'accès à l'école
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Vérifier que le nouveau tier est valide
    const validTiers = ['FREEMIUM', 'ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];
    if (!validTiers.includes(newTier)) {
      return NextResponse.json(
        { error: 'Tier invalide' },
        { status: 400 }
      );
    }

    // Archiver les élèves excédentaires
    const archiveResult = await archiveExcessStudents(schoolId, newTier);

    // Mettre à jour le tier de l'école
    await db.school.update({
      where: { id: schoolId },
      data: { subscriptionTier: newTier },
    });

    return NextResponse.json({
      data: {
        newTier,
        archived: archiveResult.archived,
      },
      message: archiveResult.archived > 0
        ? `Tier changé en ${newTier}. ${archiveResult.archived} élève(s) archivé(s).`
        : `Tier changé en ${newTier}. Aucun élève à archiver.`,
    });
  } catch (error) {
    console.error('Error during downgrade:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
