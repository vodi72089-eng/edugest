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
    const parentId = searchParams.get('parentId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};

    if (studentId) where.studentId = studentId;
    if (classId) where.classId = classId;
    if (subjectId) where.subjectId = subjectId;
    if (trimester) where.trimester = trimester;
    if (schoolYearId) where.schoolYearId = schoolYearId;
    if (parentId) where.student = { parentId };

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

    if (!studentId || !subjectId || !classId || !trimester || score === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: studentId, subjectId, classId, trimester, score' },
        { status: 400 }
      );
    }

    // Resolve schoolYearId: use provided value, or find active one, or create default
    let resolvedSchoolYearId = schoolYearId;
    if (!resolvedSchoolYearId || resolvedSchoolYearId === 'default') {
      const student = await db.student.findUnique({ where: { id: studentId } });
      if (student?.schoolYearId) {
        resolvedSchoolYearId = student.schoolYearId;
      } else {
        // Try to find active school year for the school
        const studentWithSchool = await db.student.findUnique({
          where: { id: studentId },
          select: { schoolId: true, schoolYearId: true },
        });
        if (studentWithSchool?.schoolYearId) {
          resolvedSchoolYearId = studentWithSchool.schoolYearId;
        } else {
          const activeYear = await db.schoolYear.findFirst({
            where: { schoolId: studentWithSchool?.schoolId || '', isActive: true },
            orderBy: { createdAt: 'desc' },
          });
          if (activeYear) {
            resolvedSchoolYearId = activeYear.id;
          } else if (studentWithSchool?.schoolId) {
            // Create a default school year
            const newYear = await db.schoolYear.create({
              data: {
                label: '2025-2026',
                schoolId: studentWithSchool.schoolId,
                isActive: true,
              },
            });
            resolvedSchoolYearId = newYear.id;
          } else {
            return NextResponse.json(
              { error: 'Impossible de déterminer l\'année scolaire' },
              { status: 400 }
            );
          }
        }
      }
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
          schoolYearId: resolvedSchoolYearId,
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
        schoolYearId: resolvedSchoolYearId,
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
