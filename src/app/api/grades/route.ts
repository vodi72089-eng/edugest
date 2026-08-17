import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, verifyParentAccess, safeParseInt, sanitizeError } from '@/lib/auth';
import { notifyGrade } from '@/lib/whatsapp-agent';

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
    let schoolId = searchParams.get('schoolId') || '';
    if (!schoolId && user.role !== 'SUPER_ADMIN_GLOBAL') {
      schoolId = user.schoolId || '';
    }
    if (!schoolId) {
      return NextResponse.json({ error: 'School ID required' }, { status: 403 });
    }
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
    // Grade model has no schoolId field — scope via the related class's school
    if (schoolId) where.class = { schoolId };

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
          student: { select: { id: true, firstName: true, lastName: true, matricule: true, photoUrl: true } },
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

    // Validate score is a finite number (prevents Prisma type errors)
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return NextResponse.json({ error: 'Score invalide' }, { status: 400 });
    }

    // Validate score range
    if (score < 0 || score > 20) {
      return NextResponse.json(
        { error: 'Score must be between 0 and 20' },
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

    // Verify the class and subject belong to the student's school
    const [cls, subject] = await Promise.all([
      db.class.findUnique({ where: { id: classId }, select: { schoolId: true } }),
      db.subject.findUnique({ where: { id: subjectId }, select: { schoolId: true } }),
    ]);
    if (!cls || cls.schoolId !== student.schoolId) {
      return NextResponse.json({ error: 'Classe invalide pour cet élève' }, { status: 400 });
    }
    if (!subject || subject.schoolId !== student.schoolId) {
      return NextResponse.json({ error: 'Matière invalide pour cette école' }, { status: 400 });
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
    } else {
      // Validate a user-provided school year belongs to the student's school
      const providedYear = await db.schoolYear.findUnique({
        where: { id: finalYearId },
        select: { schoolId: true },
      });
      if (!providedYear || providedYear.schoolId !== student.schoolId) {
        return NextResponse.json({ error: 'Année scolaire invalide pour cette école' }, { status: 400 });
      }
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

    // Envoyer notification WhatsApp au parent
    try {
      const student = await db.student.findUnique({
        where: { id: studentId },
        select: { parentId: true, firstName: true, lastName: true, schoolId: true },
      });
      if (student?.parentId) {
        const parent = await db.user.findUnique({
          where: { id: student.parentId },
          select: { phone: true },
        });
        const school = await db.school.findUnique({
          where: { id: student.schoolId },
          select: { name: true },
        });
        if (parent?.phone && school) {
          await notifyGrade({
            parentPhone: parent.phone,
            studentName: `${student.firstName} ${student.lastName}`,
            subject: grade.subject.name,
            score,
            maxScore: 20,
            trimester,
            schoolName: school.name,
          });
        }
      }
    } catch (notifError) {
      console.error('[Grade] Notification failed:', notifError);
    }

    return NextResponse.json({ data: grade });
  } catch (error) {
    console.error('Error creating/updating grade:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
