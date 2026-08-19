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
    const { response, message } = body;

    if (!response || !['PRESENT', 'ABSENT', 'CUSTOM'].includes(response)) {
      return NextResponse.json(
        { error: 'Réponse invalide. Doit être PRESENT, ABSENT ou CUSTOM' },
        { status: 400 }
      );
    }

    if (response === 'CUSTOM' && !message?.trim()) {
      return NextResponse.json(
        { error: 'Un message est requis pour une réponse personnalisée' },
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
        parentResponse: response,
        parentResponseMessage: response === 'CUSTOM' ? message?.trim() : null,
        parentResponseAt: new Date(),
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, matricule: true, parentId: true, photoUrl: true } },
      },
    });

    // Create notification for admin/direction users in the school
    try {
      const adminRoles = ['SUPER_ADMIN_GLOBAL', 'SECRETARY', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];
      const schoolAdmins = await db.user.findMany({
        where: { schoolId: convocation.schoolId, role: { in: adminRoles }, id: { not: user.id } },
        select: { id: true },
      });

      const responseLabel = response === 'PRESENT' ? 'Présent' : response === 'ABSENT' ? 'Absent' : 'Autre réponse';
      for (const admin of schoolAdmins) {
        await db.notification.create({
          data: {
            type: 'CONVOCATION_RESPONSE',
            title: 'Réponse à la convocation',
            message: `${convocation.student.firstName} ${convocation.student.lastName} - ${responseLabel}${response === 'CUSTOM' ? `: ${message}` : ''}`,
            userId: admin.id,
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
    console.error('Error responding to convocation:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}