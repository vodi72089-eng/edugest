import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    return NextResponse.json({ error: 'Failed to get student' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.student.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

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
    return NextResponse.json({ error: 'Failed to update student' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.student.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
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
    return NextResponse.json({ error: 'Failed to delete student' }, { status: 500 });
  }
}
