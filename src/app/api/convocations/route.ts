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

    const records = await db.convocation.findMany({
      where,
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        student: { select: { id: true, firstName: true, lastName: true, matricule: true, parentId: true, photoUrl: true } },
      },
    });

    return NextResponse.json({ data: records });
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
    const { studentId, parentId, motif, date, schoolId } = body;

    if (!studentId || !motif || !date || !schoolId) {
      return NextResponse.json(
        { error: 'Missing required fields: studentId, motif, date, schoolId' },
        { status: 400 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    // CRITICAL: Derive createdBy from the authenticated user's name, NOT from request body
    const createdBy = user.name;

    const record = await db.convocation.create({
      data: {
        studentId,
        parentId: parentId || null,
        motif,
        date: new Date(date),
        schoolId,
        createdBy,
        status: 'PENDING',
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, matricule: true, parentId: true, photoUrl: true } },
      },
    });

    // Envoyer notification WhatsApp au parent
    try {
      const student = record.student;
      if (student.parentId) {
        const parent = await db.user.findUnique({
          where: { id: student.parentId },
          select: { phone: true },
        });
        const school = await db.school.findUnique({
          where: { id: schoolId },
          select: { name: true },
        });
        if (parent?.phone && school) {
          await notifyConvocation({
            parentPhone: parent.phone,
            studentName: `${student.firstName} ${student.lastName}`,
            motif,
            date: new Date(date),
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
