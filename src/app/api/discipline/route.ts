import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const listType = searchParams.get('listType') || '';
    const severity = searchParams.get('severity') || '';
    const studentId = searchParams.get('studentId') || '';
    const parentId = searchParams.get('parentId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: Record<string, unknown> = {};

    if (schoolId) where.schoolId = schoolId;
    if (listType) where.listType = listType;
    if (severity) where.severity = severity;
    if (studentId) where.studentId = studentId;
    if (parentId) where.student = { parentId };

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
    return NextResponse.json({ error: 'Failed to list discipline records' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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
          addedBy: 'System',
        },
      });
    } else if (listType === 'GREYLIST') {
      await db.greylist.create({
        data: {
          studentId,
          schoolId,
          reason: `${title}: ${description}`,
          addedBy: 'System',
        },
      });
    } else if (listType === 'WHITELIST') {
      await db.whitelist.create({
        data: {
          studentId,
          schoolId,
          reason: `${title}: ${description}`,
          addedBy: 'System',
        },
      });
    }

    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error) {
    console.error('Error creating discipline record:', error);
    return NextResponse.json({ error: 'Failed to create discipline record' }, { status: 500 });
  }
}
