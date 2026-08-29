import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, requireAuth, requireRole, verifySchoolAccess, verifyParentAccess, sanitizeError } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'students:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    // First get the student to check access
    const studentCheck = await db.student.findUnique({
      where: { id },
      select: { schoolId: true, parentId: true },
    });

    if (!studentCheck) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Verify school access
    if (!verifySchoolAccess(user, studentCheck.schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // For PARENT, verify parent-child relationship
    if (!await verifyParentAccess(user, id)) {
      return NextResponse.json(
        { error: 'Accès non autorisé - vous ne pouvez voir que vos propres enfants' },
        { status: 403 }
      );
    }

    const student = await db.student.findUnique({
      where: { id },
      include: {
        class: { select: { id: true, name: true, section: true, level: true } },
        parent: { select: { id: true, name: true, email: true, phone: true } },
        school: { select: { id: true, name: true, shortName: true } },
        schoolYear: { select: { id: true, label: true } },
        grades: {
          include: {
            subject: { select: { id: true, name: true, coefficient: true } },
          },
          orderBy: [{ trimester: 'asc' }, { subject: { name: 'asc' } }],
        },
        disciplineRecords: { orderBy: { createdAt: 'desc' } },
        blacklistEntries: { orderBy: { addedAt: 'desc' } },
        greylistEntries: { orderBy: { addedAt: 'desc' } },
        whitelistEntries: { orderBy: { addedAt: 'desc' } },
      },
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Get payment records separately
    const paymentRecords = await db.paymentRecord.findMany({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      data: {
        ...student,
        paymentRecords,
      },
    });
  } catch (error) {
    console.error('Error getting student:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    const existing = await db.student.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Parent can only update their own children
    if (user.role === 'PARENT' && existing.parentId !== user.id) {
      return NextResponse.json(
        { error: 'Vous ne pouvez modifier que vos propres enfants' },
        { status: 403 }
      );
    }

    // Verify school access (skip for parents)
    if (user.role !== 'PARENT' && !verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'firstName', 'lastName', 'dateOfBirth', 'gender', 'address',
      'phone', 'classId', 'parentId', 'isExcluded', 'photoUrl',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = field === 'dateOfBirth' && body[field]
          ? new Date(body[field])
          : body[field];
      }
    }

    const student = await db.student.update({
      where: { id },
      data: updateData,
      include: {
        class: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ data: student });
  } catch (error) {
    console.error('Error updating student:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // DIRECTION/SECRETARY/SCHOOL_ADMIN can delete students
    const authResult = await requirePermission(request, 'students:delete');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    const existing = await db.student.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Verify school access
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Soft delete by setting isExcluded
    const student = await db.student.update({
      where: { id },
      data: { isExcluded: true },
    });

    // Update school student count
    await db.school.update({
      where: { id: existing.schoolId },
      data: { studentCount: { decrement: 1 } },
    });

    return NextResponse.json({ data: student, message: 'Student excluded successfully' });
  } catch (error) {
    console.error('Error deleting student:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
