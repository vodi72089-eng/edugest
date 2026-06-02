import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const schoolYearId = searchParams.get('schoolYearId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};

    if (schoolId) {
      where.schoolId = schoolId;
    }

    if (schoolYearId) {
      where.schoolYearId = schoolYearId;
    }

    const [classes, total] = await Promise.all([
      db.class.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
        include: {
          _count: { select: { students: true, subjects: true } },
          school: { select: { id: true, name: true, shortName: true } },
          schoolYear: { select: { id: true, label: true } },
        },
      }),
      db.class.count({ where }),
    ]);

    return NextResponse.json({
      data: classes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing classes:', error);
    return NextResponse.json({ error: 'Failed to list classes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, section, level, capacity, schoolId, schoolYearId, headTeacherId } = body;

    if (!name || !schoolId || !schoolYearId) {
      return NextResponse.json(
        { error: 'Missing required fields: name, schoolId, schoolYearId' },
        { status: 400 }
      );
    }

    // Check for duplicate class name in the same school year
    const existing = await db.class.findUnique({
      where: {
        name_schoolYearId: {
          name,
          schoolYearId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Class "${name}" already exists for this school year` },
        { status: 409 }
      );
    }

    const cls = await db.class.create({
      data: {
        name,
        section: section || null,
        level: level || null,
        capacity: capacity || 40,
        schoolId,
        schoolYearId,
        headTeacherId: headTeacherId || null,
      },
      include: {
        school: { select: { id: true, name: true } },
        schoolYear: { select: { id: true, label: true } },
      },
    });

    // Update school class count
    await db.school.update({
      where: { id: schoolId },
      data: { classCount: { increment: 1 } },
    });

    return NextResponse.json({ data: cls }, { status: 201 });
  } catch (error) {
    console.error('Error creating class:', error);
    return NextResponse.json({ error: 'Failed to create class' }, { status: 500 });
  }
}
