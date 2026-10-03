import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, sanitizeError, verifySchoolAccess } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'grades:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    const { id: gradeId } = await params;

    const grade = await db.grade.findUnique({
      where: { id: gradeId },
      include: { class: { select: { schoolId: true } } },
    });
    if (!grade) {
      return NextResponse.json({ error: 'Note non trouvée' }, { status: 404 });
    }

    // ── ISOLATION MULTI-ÉCOLES : une note n'a pas de schoolId propre →
    // scoping via la classe (avant : findUnique sans vérification du tenant
    // → écriture GradeRead cross-écoles possible).
    if (!verifySchoolAccess(user, grade.class.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette note' }, { status: 403 });
    }

    await db.gradeRead.upsert({
      where: { userId_gradeId: { userId: user.id, gradeId } },
      update: { readAt: new Date() },
      create: { userId: user.id, gradeId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking grade as read:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}