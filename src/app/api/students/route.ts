import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const classId = searchParams.get('classId') || '';
    const schoolId = searchParams.get('schoolId') || '';
    const schoolYearId = searchParams.get('schoolYearId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { matricule: { contains: search } },
      ];
    }

    if (classId) {
      where.classId = classId;
    }

    if (schoolId) {
      where.schoolId = schoolId;
    }

    if (schoolYearId) {
      where.schoolYearId = schoolYearId;
    }

    const [students, total] = await Promise.all([
      db.student.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { lastName: 'asc' },
        include: {
          class: { select: { id: true, name: true, section: true } },
          parent: { select: { id: true, name: true, email: true, phone: true } },
          school: { select: { id: true, name: true, shortName: true } },
          schoolYear: { select: { id: true, label: true } },
        },
      }),
      db.student.count({ where }),
    ]);

    return NextResponse.json({
      data: students,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing students:', error);
    return NextResponse.json({ error: 'Failed to list students' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      address,
      phone,
      classId,
      parentId,
      schoolId,
      schoolYearId,
      parentName,
      parentEmail,
      parentPhone,
      parentPassword,
    } = body;

    if (!firstName || !lastName || !classId || !schoolId || !schoolYearId) {
      return NextResponse.json(
        { error: 'Missing required fields: firstName, lastName, classId, schoolId, schoolYearId' },
        { status: 400 }
      );
    }

    // Resolve parentId: from explicit parentId, or by creating/linking a parent user
    let resolvedParentId: string | null = parentId || null;

    if (!resolvedParentId && parentName && parentPhone) {
      // Check if a user with this phone already exists
      const existingParent = await db.user.findUnique({
        where: { phone: parentPhone },
      });

      if (existingParent) {
        // Link to existing user as parent
        resolvedParentId = existingParent.id;
      } else {
        // Create a new parent user
        const hashedPassword = await bcrypt.hash(parentPassword || 'parent123', 10);
        const newParent = await db.user.create({
          data: {
            name: parentName,
            email: parentEmail || null,
            phone: parentPhone,
            password: hashedPassword,
            role: 'PARENT',
            schoolId,
            isActive: true,
          },
        });
        resolvedParentId = newParent.id;
      }
    }

    // Get school short name for matricule generation
    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { shortName: true },
    });

    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    // Generate matricule: SHORTNAME-YYYY-NNN
    const year = new Date().getFullYear();
    const existingCount = await db.student.count({
      where: {
        schoolId,
        matricule: { startsWith: `${school.shortName}-${year}` },
      },
    });
    const matricule = `${school.shortName}-${year}-${String(existingCount + 1).padStart(3, '0')}`;

    const student = await db.student.create({
      data: {
        matricule,
        firstName,
        lastName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender: gender || null,
        address: address || null,
        phone: phone || null,
        classId,
        parentId: resolvedParentId,
        schoolId,
        schoolYearId,
      },
      include: {
        class: true,
        parent: { select: { id: true, name: true, email: true } },
      },
    });

    // Update school student count
    await db.school.update({
      where: { id: schoolId },
      data: { studentCount: { increment: 1 } },
    });

    return NextResponse.json({ data: student }, { status: 201 });
  } catch (error) {
    console.error('Error creating student:', error);
    return NextResponse.json({ error: 'Failed to create student' }, { status: 500 });
  }
}
