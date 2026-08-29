import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { requirePermission, verifySchoolAccess, safeParseInt, sanitizeError } from '@/lib/auth';

function generateRandomPassword(length: number = 12): string {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'students:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const classId = searchParams.get('classId') || '';
    const schoolId = searchParams.get('schoolId') || '';
    const schoolYearId = searchParams.get('schoolYearId') || '';
    const parentId = searchParams.get('parentId') || '';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 1000);
    const limit = safeParseInt(searchParams.get('limit'), 20, 1, 100);

    const where: Record<string, unknown> = {};

    // For PARENT role, automatically filter by parentId from session user
    if (user.role === 'PARENT') {
      where.parentId = user.id;
    }

    // For non-SUPER_ADMIN_GLOBAL, restrict to their schoolId
    if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      where.schoolId = user.schoolId;
    } else if (schoolId) {
      where.schoolId = schoolId;
    }

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

    if (schoolYearId) {
      where.schoolYearId = schoolYearId;
    }

    // Allow explicit parentId filter only for non-PARENT users (PARENT is already filtered above)
    if (parentId && user.role !== 'PARENT') {
      where.parentId = parentId;
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
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'students:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

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

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
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
        // BUG FIX: Generate random password instead of 'parent123'
        // BUG FIX: Use bcrypt cost factor 12
        const randomPassword = parentPassword || generateRandomPassword();
        const hashedPassword = await bcrypt.hash(randomPassword, 12);
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

    // Create in-app notifications for school admins
    try {
      const adminRoles = ['SUPER_ADMIN_GLOBAL', 'SECRETARY', 'CASHIER', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];
      const schoolAdmins = await db.user.findMany({
        where: { schoolId, role: { in: adminRoles }, id: { not: user.id } },
        select: { id: true },
      });
      const className = await db.class.findUnique({ where: { id: classId }, select: { name: true } });
      for (const admin of schoolAdmins) {
        await db.notification.create({
          data: {
            type: 'STUDENT_ENROLLED',
            title: 'Nouvel élève inscrit',
            message: `${firstName} ${lastName} - ${className?.name || ''} - Matricule: ${matricule}`,
            userId: admin.id,
            schoolId,
            relatedId: student.id,
          },
        });
      }
    } catch { /* notification failed, non-critical */ }

    return NextResponse.json({ data: student }, { status: 201 });
  } catch (error) {
    console.error('Error creating student:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
