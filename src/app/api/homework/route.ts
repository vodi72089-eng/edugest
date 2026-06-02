import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const classId = searchParams.get('classId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: Record<string, unknown> = {};

    if (schoolId) where.schoolId = schoolId;
    if (classId) where.classId = classId;

    const [homeworks, total] = await Promise.all([
      db.homework.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { dueDate: 'asc' },
        include: {
          school: { select: { id: true, name: true } },
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
    return NextResponse.json({ error: 'Failed to list homework' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      description,
      subjectName,
      classId,
      teacherName,
      dueDate,
      schoolId,
      isPublished,
    } = body;

    if (!title || !description || !subjectName || !classId || !teacherName || !dueDate || !schoolId) {
      return NextResponse.json(
        { error: 'Missing required fields: title, description, subjectName, classId, teacherName, dueDate, schoolId' },
        { status: 400 }
      );
    }

    const homework = await db.homework.create({
      data: {
        title,
        description,
        subjectName,
        classId,
        teacherName,
        dueDate: new Date(dueDate),
        schoolId,
        isPublished: isPublished !== undefined ? isPublished : true,
      },
    });

    return NextResponse.json({ data: homework }, { status: 201 });
  } catch (error) {
    console.error('Error creating homework:', error);
    return NextResponse.json({ error: 'Failed to create homework' }, { status: 500 });
  }
}
