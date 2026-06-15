import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, safeParseInt, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'discipline:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const listType = searchParams.get('listType') || '';
    const severity = searchParams.get('severity') || '';
    const studentId = searchParams.get('studentId') || '';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 1000);
    const limit = safeParseInt(searchParams.get('limit'), 20, 1, 200);

    // Verify school access if schoolId is provided
    if (schoolId && !verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};

    if (schoolId) where.schoolId = schoolId;
    if (listType) where.listType = listType;
    if (severity) where.severity = severity;
    if (studentId) where.studentId = studentId;

    // For PARENT role, filter by parentId - only show their children's records
    if (user.role === 'PARENT') {
      where.student = { parentId: user.id };
    }

    const [records, total] = await Promise.all([
      db.disciplineRecord.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, matricule: true },
          },
        },
      }),
      db.disciplineRecord.count({ where }),
    ]);

    return NextResponse.json({
      data: records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing discipline records:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'discipline:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const {
      studentId,
      type,
      severity,
      title,
      description,
      points,
      listType,
      status,
      schoolId,
    } = body;

    if (!studentId || !type || !severity || !title || !description || !schoolId) {
      return NextResponse.json(
        { error: 'Missing required fields: studentId, type, severity, title, description, schoolId' },
        { status: 400 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    // CRITICAL: Use authenticated user's name for 'addedBy' field instead of hardcoded 'System'
    const addedBy = user.name;

    const record = await db.disciplineRecord.create({
      data: {
        studentId,
        type,
        severity,
        title,
        description,
        points: points || 0,
        listType: listType || 'GREYLIST',
        status: status || 'PENDING',
        schoolId,
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, matricule: true } },
      },
    });

    // Also add to the corresponding list table
    if (listType === 'BLACKLIST') {
      await db.blacklist.create({
        data: {
          studentId,
          schoolId,
          reason: `${title}: ${description}`,
          addedBy,
        },
      });
    } else if (listType === 'GREYLIST') {
      await db.greylist.create({
        data: {
          studentId,
          schoolId,
          reason: `${title}: ${description}`,
          addedBy,
        },
      });
    } else if (listType === 'WHITELIST') {
      await db.whitelist.create({
        data: {
          studentId,
          schoolId,
          reason: `${title}: ${description}`,
          addedBy,
        },
      });
    }

    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error) {
    console.error('Error creating discipline record:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'discipline:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { id, type, severity, title, description, points, listType, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Discipline record ID required' }, { status: 400 });
    }

    const existing = await db.disciplineRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Discipline record not found' }, { status: 404 });
    }

    // Verify school access
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (type !== undefined) updateData.type = type;
    if (severity !== undefined) updateData.severity = severity;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (points !== undefined) updateData.points = points;
    if (listType !== undefined) updateData.listType = listType;
    if (status !== undefined) updateData.status = status;

    const updated = await db.disciplineRecord.update({
      where: { id },
      data: updateData,
      include: {
        student: { select: { id: true, firstName: true, lastName: true, matricule: true } },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Error updating discipline record:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
