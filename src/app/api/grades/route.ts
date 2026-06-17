import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, verifyParentAccess, safeParseInt, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'grades:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || '';
    const classId = searchParams.get('classId') || '';
    const subjectId = searchParams.get('subjectId') || '';
    const trimester = searchParams.get('trimester') || '';
    const schoolYearId = searchParams.get('schoolYearId') || '';
    const schoolId = searchParams.get('schoolId') || '';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 1000);
    const limit = safeParseInt(searchParams.get('limit'), 50, 1, 200);

    // Verify school access if schoolId is provided
    if (schoolId && !verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};

    if (studentId) where.studentId = studentId;
    if (classId) where.classId = classId;
    if (subjectId) where.subjectId = subjectId;
    if (trimester) where.trimester = trimester;
    if (schoolYearId) where.schoolYearId = schoolYearId;
    if (schoolId) where.schoolId = schoolId;

    // For PARENT role, filter by parentId - only show their children's grades
    if (user.role === 'PARENT') {
      where.student = { parentId: user.id };
    }

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
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'grades:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // Only TEACHER, HEAD_TEACHER, and DIRECTION roles can create grades
    const allowedRoles = ['TEACHER', 'HEAD_TEACHER', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];
    if (!allowedRoles.includes(user.role) && user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json({ error: 'Seuls les enseignants et la direction peuvent créer des notes' }, { status: 403 });
    }

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

    // schoolYearId auto-resolved below if missing or 'default' (legacy hardcode)

    // Verify school access by checking the student's school
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });
    if (!student) {
      return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 });
    }
    if (!verifySchoolAccess(user, student.schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    // Auto-resolve active school year if not provided (fixes 'default' hardcode)
    let finalYearId = schoolYearId;
    if (!finalYearId || finalYearId === 'default') {
      const activeYear = await db.schoolYear.findFirst({
        where: { schoolId: student.schoolId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
      if (!activeYear) {
        // Fallback: most recent year for the school
        const anyYear = await db.schoolYear.findFirst({
          where: { schoolId: student.schoolId },
          orderBy: { createdAt: 'desc' },
        });
        if (!anyYear) {
          return NextResponse.json(
            { error: 'Aucune année scolaire trouvée pour cette école. Veuillez en créer une.' },
            { status: 400 }
          );
        }
        finalYearId = anyYear.id;
      } else {
        finalYearId = activeYear.id;
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
          schoolYearId: finalYearId,
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
        schoolYearId: finalYearId,
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        subject: { select: { id: true, name: true, coefficient: true } },
      },
    });

    return NextResponse.json({ data: grade });
  } catch (error) {
    console.error('Error creating/updating grade:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
