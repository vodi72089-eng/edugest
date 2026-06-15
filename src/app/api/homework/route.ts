import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const classId = searchParams.get('classId') || '';
    const parentId = searchParams.get('parentId') || '';
    const studentId = searchParams.get('studentId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: Record<string, unknown> = {};

    if (schoolId) where.schoolId = schoolId;
    if (classId) where.classId = classId;

    // If parentId is provided, find homework for the parent's children
    if (parentId) {
      const children = await db.student.findMany({
        where: { parentId },
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
      teacherId,
      isTitulaire,
      dueDate,
      schoolId,
      isPublished,
    } = body;

    if (!title || !subjectName || !classId || !teacherName || !dueDate || !schoolId) {
      return NextResponse.json(
        { error: 'Missing required fields: title, subjectName, classId, teacherName, dueDate, schoolId' },
        { status: 400 }
      );
    }

    const homework = await db.homework.create({
      data: {
        title,
        description: description || '',
        subjectName,
        classId,
        teacherName,
        teacherId: teacherId || null,
        isTitulaire: isTitulaire || false,
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
