import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || '';
    const classId = searchParams.get('classId') || '';
    const subjectId = searchParams.get('subjectId') || '';
    const trimester = searchParams.get('trimester') || '';
    const schoolYearId = searchParams.get('schoolYearId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};

    if (studentId) where.studentId = studentId;
    if (classId) where.classId = classId;
    if (subjectId) where.subjectId = subjectId;
    if (trimester) where.trimester = trimester;
    if (schoolYearId) where.schoolYearId = schoolYearId;

    const [grades, total] = await Promise.all([
      db.grade.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ trimester: 'asc' }, { subject: { name: 'asc' } }],
        include: {
          student: { select: { id: true, firstName: true, lastName: true, matricule: true } },
          subject: { select: { id: true, name: true, coefficient: true } },
          class: { select: { id: true, name: true } },
        },
      }),
      db.grade.count({ where }),
    ]);

    return NextResponse.json({
      data: grades,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing grades:', error);
    return NextResponse.json({ error: 'Failed to list grades' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      studentId,
      subjectId,
      classId,
      trimester,
      score,
      comment,
      schoolYearId,
    } = body;

    if (!studentId || !subjectId || !classId || !trimester || score === undefined || !schoolYearId) {
      return NextResponse.json(
        { error: 'Missing required fields: studentId, subjectId, classId, trimester, score, schoolYearId' },
        { status: 400 }
      );
    }

    // Validate score range
    if (score < 0 || score > 20) {
      return NextResponse.json(
        { error: 'Score must be between 0 and 20' },
        { status: 400 }
      );
    }

    // Upsert grade based on unique constraint
    const grade = await db.grade.upsert({
      where: {
        studentId_subjectId_trimester_schoolYearId: {
          studentId,
          subjectId,
          trimester,
          schoolYearId,
        },
      },
      update: {
        score,
        comment: comment || null,
        classId,
      },
      create: {
        studentId,
        subjectId,
        classId,
        trimester,
        score,
        comment: comment || null,
        schoolYearId,
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        subject: { select: { id: true, name: true, coefficient: true } },
      },
    });

    return NextResponse.json({ data: grade });
  } catch (error) {
    console.error('Error creating/updating grade:', error);
    return NextResponse.json({ error: 'Failed to create/update grade' }, { status: 500 });
  }
}
