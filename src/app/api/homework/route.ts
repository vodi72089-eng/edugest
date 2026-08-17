import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, safeParseInt, sanitizeError } from '@/lib/auth';
import { notifyHomework } from '@/lib/whatsapp-agent';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'homework:read');
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
        select: { classId: true, id: true },
      });
      const classIds = [...new Set(children.map(c => c.classId).filter(Boolean))];
      // If studentId is specified, only show homework for that student's class
      if (studentId) {
        const targetStudent = children.find(c => c.id === studentId);
        if (targetStudent?.classId) {
          where.classId = targetStudent.classId;
        } else {
          return NextResponse.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
        }
      } else if (classIds.length > 0) {
        where.classId = { in: classIds };
      } else {
        // No children found, return empty
        return NextResponse.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      }
    }

    // For TEACHER/HEAD_TEACHER, default to their own homework (unless classId/schoolId explicitly set)
    if ((user.role === 'TEACHER' || user.role === 'HEAD_TEACHER') && !classId) {
      where.teacherId = user.id;
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

    // Validate due date
    const homeworkDueDate = new Date(dueDate);
    if (isNaN(homeworkDueDate.getTime())) {
      return NextResponse.json({ error: 'Date d’échéance invalide' }, { status: 400 });
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    // Verify the class belongs to the target school
    const targetClass = await db.class.findUnique({
      where: { id: classId },
      select: { schoolId: true },
    });
    if (!targetClass || targetClass.schoolId !== schoolId) {
      return NextResponse.json(
        { error: 'La classe n’appartient pas à cette école' },
        { status: 400 }
      );
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
        dueDate: homeworkDueDate,
        schoolId,
        isPublished: isPublished !== undefined ? isPublished : true,
      },
    });

    // Envoyer notifications WhatsApp aux parents de la classe
    try {
      const classStudents = await db.student.findMany({
        where: { classId },
        select: { parentId: true, firstName: true, lastName: true },
      });

      const school = await db.school.findUnique({
        where: { id: schoolId },
        select: { name: true },
      });

      if (school) {
        // Envoyer à chaque parent (évite les doublons)
        const notifiedParents = new Set<string>();
        for (const student of classStudents) {
          if (student.parentId && !notifiedParents.has(student.parentId)) {
            notifiedParents.add(student.parentId);
            const parent = await db.user.findUnique({
              where: { id: student.parentId },
              select: { phone: true },
            });
            if (parent?.phone) {
              await notifyHomework({
                parentPhone: parent.phone,
                studentName: `${student.firstName} ${student.lastName}`,
                subject: subjectName,
                title,
                dueDate: homeworkDueDate,
                schoolName: school.name,
              });
            }
          }
        }
      }
    } catch (notifError) {
      console.error('[Homework] Notification failed:', notifError);
    }

    return NextResponse.json({ data: homework }, { status: 201 });
  } catch (error) {
    console.error('Error creating homework:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
