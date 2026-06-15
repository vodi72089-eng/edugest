import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, safeParseInt, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'subjects:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const classId = searchParams.get('classId') || '';
    const schoolYearId = searchParams.get('schoolYearId') || '';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 1000);
    const limit = safeParseInt(searchParams.get('limit'), 50, 1, 200);

    // Verify school access if schoolId is provided
    if (schoolId && !verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

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
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'subjects:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // Only SECRETARY, SCHOOL_ADMIN, and DIRECTION roles can create subjects
    const allowedRoles = ['SECRETARY', 'SCHOOL_ADMIN', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];
    if (!allowedRoles.includes(user.role) && user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json({ error: 'Seuls les secrétaires, administrateurs et la direction peuvent créer des matières' }, { status: 403 });
    }

    const body = await request.json();
    const { name, code, coefficient, schoolId, schoolYearId, classId } = body;

    if (!name || !schoolId || !schoolYearId || !classId) {
      return NextResponse.json(
        { error: 'Missing required fields: name, schoolId, schoolYearId, classId' },
        { status: 400 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
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
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
