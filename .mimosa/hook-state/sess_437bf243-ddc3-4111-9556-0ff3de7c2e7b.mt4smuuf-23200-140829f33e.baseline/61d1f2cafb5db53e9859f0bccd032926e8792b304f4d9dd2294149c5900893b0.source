import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, safeParseInt, sanitizeError } from '@/lib/auth';
import { notifyConvocation } from '@/lib/whatsapp-agent';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'convocations:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    let schoolId = searchParams.get('schoolId') || '';
    if (!schoolId && user.role !== 'SUPER_ADMIN_GLOBAL') {
      schoolId = user.schoolId || '';
    }
    if (!schoolId) {
      return NextResponse.json({ error: 'School ID required' }, { status: 403 });
    }
    const studentId = searchParams.get('studentId') || '';
    const status = searchParams.get('status') || '';
    const limit = safeParseInt(searchParams.get('limit'), 50, 1, 200);

    // Verify school access if schoolId is provided
    if (schoolId && !verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};
    if (schoolId) where.schoolId = schoolId;
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;

    // For PARENT role, only show convocations for their children
    if (user.role === 'PARENT') {
      where.student = { parentId: user.id };
    }

    const [records, totalUsers] = await Promise.all([
      db.convocation.findMany({
        where,
        orderBy: { date: 'desc' },
        take: limit,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, matricule: true, parentId: true, photoUrl: true } },
          reads: {
            include: { user: { select: { id: true, name: true, role: true } } },
            orderBy: { readAt: 'desc' },
          },
        },
      }),
      db.user.count({ where: { schoolId, isActive: true } }),
    ]);

    // For PARENT role: auto-mark all convocations as read
    if (user.role === 'PARENT') {
      try {
        const convocationIds = records.map(c => c.id);
        if (convocationIds.length > 0) {
          await Promise.all(
            convocationIds.map(convocationId =>
              db.convocationRead.upsert({
                where: { userId_convocationId: { userId: user.id, convocationId } },
                update: { readAt: new Date() },
                create: { userId: user.id, convocationId },
              })
            )
          );
          // Update the reads array for each convocation
          records.forEach(convocation => {
            const alreadyRead = convocation.reads?.some(r => r.userId === user.id);
            if (!alreadyRead) {
              if (!convocation.reads) convocation.reads = [];
              convocation.reads.push({
                id: 'temp',
                userId: user.id,
                convocationId: convocation.id,
                readAt: new Date(),
                user: { id: user.id, name: user.name, role: user.role },
              });
            }
          });
        }
      } catch (readError) {
        console.error('Error marking convocations as read:', readError);
      }
    }

    return NextResponse.json({ data: records, totalUsers });
  } catch (error) {
    console.error('Error listing convocations:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'convocations:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { studentId, motif, date, schoolId } = body;

    if (!studentId || !motif || !date || !schoolId) {
      return NextResponse.json(
        { error: 'Missing required fields: studentId, motif, date, schoolId' },
        { status: 400 }
      );
    }

    // Validate date
    const convocationDate = new Date(date);
    if (isNaN(convocationDate.getTime())) {
      return NextResponse.json({ error: 'Date de convocation invalide' }, { status: 400 });
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    // Verify the student exists and belongs to the target school
    const studentRecord = await db.student.findUnique({
      where: { id: studentId },
      select: { schoolId: true, parentId: true },
    });
    if (!studentRecord) {
      return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 });
    }
    if (studentRecord.schoolId !== schoolId) {
      return NextResponse.json(
        { error: "L'élève n'appartient pas à cette école" },
        { status: 403 }
      );
    }

    // CRITICAL: Derive createdBy from the authenticated user's name and parentId
    // from the student's record, NOT from request body (prevents identity spoofing)
    const createdBy = user.name;

    const record = await db.convocation.create({
      data: {
        studentId,
        parentId: studentRecord.parentId,
        motif,
        date: convocationDate,
        schoolId,
        createdBy,
        status: 'PENDING',
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, matricule: true, parentId: true, photoUrl: true } },
      },
    });

    // Envoyer notification WhatsApp + notification in-app au parent
    try {
      const student = record.student;
      if (student.parentId) {
        const parent = await db.user.findUnique({
          where: { id: student.parentId },
          select: { phone: true, name: true },
        });
        const school = await db.school.findUnique({
          where: { id: schoolId },
          select: { name: true },
        });

        // Notification in-app pour le parent
        await db.notification.create({
          data: {
            userId: student.parentId,
            type: 'CONVOCATION',
            title: 'Nouvelle convocation',
            message: `Votre enfant ${student.firstName} ${student.lastName} a été convoqué pour ${motif} le ${convocationDate.toLocaleDateString('fr-FR')}`,
            schoolId,
            metadata: JSON.stringify({ convocationId: record.id, studentId: student.id }),
          },
        });

        // Notification WhatsApp
        if (parent?.phone && school) {
          await notifyConvocation({
            parentPhone: parent.phone,
            studentName: `${student.firstName} ${student.lastName}`,
            motif,
            date: convocationDate,
            schoolName: school.name,
          });
        }
      }
    } catch (notifError) {
      console.error('[Convocation] Notification failed:', notifError);
    }

    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error) {
    console.error('Error creating convocation:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'convocations:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { id, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Convocation ID required' }, { status: 400 });
    }

    // Verify school access - check the convocation belongs to user's school
    const existing = await db.convocation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Convocation non trouvée' }, { status: 404 });
    }
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const updated = await db.convocation.update({
      where: { id },
      data: { status: status || 'CONFIRMED' },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, matricule: true, parentId: true, photoUrl: true } },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Error updating convocation:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
