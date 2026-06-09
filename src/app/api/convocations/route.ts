import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const studentId = searchParams.get('studentId') || '';
    const status = searchParams.get('status') || '';
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};
    if (schoolId) where.schoolId = schoolId;
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;

    const records = await db.convocation.findMany({
      where,
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        student: { select: { id: true, firstName: true, lastName: true, matricule: true, parentId: true } },
      },
    });

    return NextResponse.json({ data: records });
  } catch (error) {
    console.error('Error listing convocations:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to list convocations', detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, parentId, motif, date, schoolId, createdBy } = body;

    if (!studentId || !motif || !date || !schoolId) {
      return NextResponse.json(
        { error: 'Missing required fields: studentId, motif, date, schoolId' },
        { status: 400 }
      );
    }

    const record = await db.convocation.create({
      data: {
        studentId,
        parentId: parentId || null,
        motif,
        date: new Date(date),
        schoolId,
        createdBy: createdBy || null,
        status: 'PENDING',
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, matricule: true, parentId: true } },
      },
    });

    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error) {
    console.error('Error creating convocation:', error);
    return NextResponse.json({ error: 'Failed to create convocation' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Convocation ID required' }, { status: 400 });
    }

    const updated = await db.convocation.update({
      where: { id },
      data: { status: status || 'CONFIRMED' },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, matricule: true, parentId: true } },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Error updating convocation:', error);
    return NextResponse.json({ error: 'Failed to update convocation' }, { status: 500 });
  }
}
