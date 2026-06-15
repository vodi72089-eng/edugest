import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const classId = searchParams.get('classId') || '';
    const schoolYearId = searchParams.get('schoolYearId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};

    if (schoolId) where.schoolId = schoolId;
    if (classId) where.classId = classId;
    if (schoolYearId) where.schoolYearId = schoolYearId;

    const [subjects, total] = await Promise.all([
      db.subject.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          class: { select: { id: true, name: true } },
          school: { select: { id: true, name: true } },
        },
      }),
      db.subject.count({ where }),
    ]);

    return NextResponse.json({
      data: subjects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing subjects:', error);
    return NextResponse.json({ error: 'Failed to list subjects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, code, coefficient, schoolId, schoolYearId, classId } = body;

    if (!name || !schoolId || !schoolYearId || !classId) {
      return NextResponse.json(
        { error: 'Missing required fields: name, schoolId, schoolYearId, classId' },
        { status: 400 }
      );
    }

    const subject = await db.subject.create({
      data: {
        name,
        code: code || null,
        coefficient: coefficient || 1,
        schoolId,
        schoolYearId,
        classId,
      },
      include: {
        class: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ data: subject }, { status: 201 });
  } catch (error) {
    console.error('Error creating subject:', error);
    return NextResponse.json({ error: 'Failed to create subject' }, { status: 500 });
  }
}
