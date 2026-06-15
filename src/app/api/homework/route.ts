import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, safeParseInt, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'homework:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const classId = searchParams.get('classId') || '';
    const studentId = searchParams.get('studentId') || '';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 1000);
    const limit = safeParseInt(searchParams.get('limit'), 20, 1, 200);

    // Verify school access if schoolId is provided
    if (schoolId && !verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};

    if (schoolId) where.schoolId = schoolId;
    if (classId) where.classId = classId;

    // For PARENT role, filter by their children's classes
    if (user.role === 'PARENT') {
      const children = await db.student.findMany({
        where: { parentId: user.id },
        select: { classId: true },
      });
      const classIds = [...new Set(children.map(c => c.classId))];
      if (classIds.length > 0) {
        where.classId = { in: classIds };
      } else {
        // No children found, return empty
        return NextResponse.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      }
    }

    const [homeworks, total] = await Promise.all([
      db.homework.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { dueDate: 'asc' },
        include: {
          school: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
        },
      }),
      db.homework.count({ where }),
    ]);

    return NextResponse.json({
      data: homeworks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing homework:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'homework:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // Only TEACHER, HEAD_TEACHER, and DIRECTION roles can create homework
    const allowedRoles = ['TEACHER', 'HEAD_TEACHER', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];
    if (!allowedRoles.includes(user.role) && user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json({ error: 'Seuls les enseignants et la direction peuvent créer des devoirs' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      description,
      subjectName,
      classId,
      isTitulaire,
      dueDate,
      schoolId,
      isPublished,
    } = body;

    if (!title || !subjectName || !classId || !dueDate || !schoolId) {
      return NextResponse.json(
        { error: 'Missing required fields: title, subjectName, classId, dueDate, schoolId' },
        { status: 400 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    // Derive teacherId and teacherName from the authenticated user
    const teacherId = user.id;
    const teacherName = user.name;

    const homework = await db.homework.create({
      data: {
        title,
        description: description || '',
        subjectName,
        classId,
        teacherName,
        teacherId,
        isTitulaire: isTitulaire || false,
        dueDate: new Date(dueDate),
        schoolId,
        isPublished: isPublished !== undefined ? isPublished : true,
      },
    });

    return NextResponse.json({ data: homework }, { status: 201 });
  } catch (error) {
    console.error('Error creating homework:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
