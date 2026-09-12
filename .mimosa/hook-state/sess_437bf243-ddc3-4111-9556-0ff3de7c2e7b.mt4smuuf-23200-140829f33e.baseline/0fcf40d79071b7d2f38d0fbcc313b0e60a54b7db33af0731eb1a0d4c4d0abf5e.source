import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'convocations:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    const { id: convocationId } = await params;

    const body = await request.json();
    const { newDate } = body;

    if (!newDate) {
      return NextResponse.json(
        { error: 'Nouvelle date requise' },
        { status: 400 }
      );
    }

    const newConvocationDate = new Date(newDate);
    if (isNaN(newConvocationDate.getTime())) {
      return NextResponse.json(
        { error: 'Date invalide' },
        { status: 400 }
      );
    }

    const convocation = await db.convocation.findUnique({
      where: { id: convocationId },
      include: { student: { select: { schoolId: true, parentId: true } } },
    });

    if (!convocation) {
      return NextResponse.json({ error: 'Convocation non trouvée' }, { status: 404 });
    }

    if (!verifySchoolAccess(user, convocation.schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const updatedConvocation = await db.convocation.update({
      where: { id: convocationId },
      data: {
        rescheduledTo: newConvocationDate,
        rescheduledBy: user.name,
        date: newConvocationDate,
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, matricule: true, parentId: true, photoUrl: true } },
      },
    });

    // Create notification for the parent
    try {
      if (convocation.student.parentId) {
        await db.notification.create({
          data: {
            type: 'CONVOCATION_RESCHEDULED',
            title: 'Convocation reportée',
            message: `La convocation de ${convocation.student.firstName} ${convocation.student.lastName} a été reportée au ${newConvocationDate.toLocaleDateString('fr-FR')}`,
            userId: convocation.student.parentId,
            schoolId: convocation.schoolId,
            relatedId: convocationId,
          },
        });
      }
    } catch (notifError) {
      console.error('[Convocation] Notification failed:', notifError);
    }

    return NextResponse.json({ data: updatedConvocation });
  } catch (error) {
    console.error('Error rescheduling convocation:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}