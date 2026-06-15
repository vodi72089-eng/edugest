import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { requirePermission, requireRole, verifySchoolAccess, safeParseInt, sanitizeError } from '@/lib/auth';

function generateRandomPassword(length: number = 12): string {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'users:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    let schoolId = searchParams.get('schoolId');
    const role = searchParams.get('role');
    const search = searchParams.get('search') || '';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 1000);
    const limit = safeParseInt(searchParams.get('limit'), 50, 1, 100);

    // Non-SUPER_ADMIN_GLOBAL restricted to their schoolId
    if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      schoolId = user.schoolId;
    }

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    }

    // Verify school access for SUPER_ADMIN_GLOBAL too
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const where: Record<string, unknown> = { schoolId };

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          profileImageUrl: true,
          lastLoginAt: true,
          createdAt: true,
          schoolId: true,
          subjectName: true,
          classNames: true,
          isTitulaire: true,
        },
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({
      data: users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error listing users:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'users:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { name, email, phone, password, role, schoolId, isActive, subjectName, classNames, isTitulaire } = body;

    if (!name || !role || !schoolId) {
      return NextResponse.json(
        { error: 'Champs obligatoires manquants: name, role, schoolId' },
        { status: 400 }
      );
    }

    if (!email && !phone) {
      return NextResponse.json(
        { error: 'Email ou téléphone est requis' },
        { status: 400 }
      );
    }

    // CRITICAL: Only SUPER_ADMIN_GLOBAL can assign SUPER_ADMIN_GLOBAL role
    if (role === 'SUPER_ADMIN_GLOBAL' && user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json(
        { error: 'Seul un SUPER_ADMIN_GLOBAL peut attribuer le rôle SUPER_ADMIN_GLOBAL' },
        { status: 403 }
      );
    }

    // Others can only assign roles within their school
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Check for duplicate email
    if (email) {
      const existingEmail = await db.user.findUnique({ where: { email } });
      if (existingEmail) {
        return NextResponse.json(
          { error: 'Un utilisateur avec cet email existe déjà' },
          { status: 409 }
        );
      }
    }

    // Check for duplicate phone
    if (phone) {
      const existingPhone = await db.user.findUnique({ where: { phone } });
      if (existingPhone) {
        return NextResponse.json(
          { error: 'Un utilisateur avec ce téléphone existe déjà' },
          { status: 409 }
        );
      }
    }

    // Verify school exists
    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      return NextResponse.json(
        { error: 'École non trouvée' },
        { status: 404 }
      );
    }

    // Generate random password if none provided
    // Use bcrypt cost 12
    const rawPassword = password || generateRandomPassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    const isTeacherRole = role === 'TEACHER' || role === 'HEAD_TEACHER';

    const newUser = await db.user.create({
      data: {
        name,
        email: email || null,
        phone: phone || `user_${Date.now()}`,
        password: hashedPassword,
        role,
        schoolId,
        isActive: isActive !== undefined ? isActive : true,
        subjectName: isTeacherRole ? (subjectName || null) : null,
        classNames: isTeacherRole ? (classNames || null) : null,
        isTitulaire: isTeacherRole ? (isTitulaire || false) : false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        profileImageUrl: true,
        lastLoginAt: true,
        createdAt: true,
        schoolId: true,
        subjectName: true,
        classNames: true,
        isTitulaire: true,
      },
    });

    return NextResponse.json({ data: newUser }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'users:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { id, name, email, phone, role, isActive, password, subjectName, classNames, isTitulaire } = body;

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    // Verify school access
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Only SUPER_ADMIN_GLOBAL can assign SUPER_ADMIN_GLOBAL role
    if (role === 'SUPER_ADMIN_GLOBAL' && user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json(
        { error: 'Seul un SUPER_ADMIN_GLOBAL peut attribuer le rôle SUPER_ADMIN_GLOBAL' },
        { status: 403 }
      );
    }

    // Also check if trying to change an existing SUPER_ADMIN_GLOBAL user's role
    if (existing.role === 'SUPER_ADMIN_GLOBAL' && role && role !== 'SUPER_ADMIN_GLOBAL' && user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json(
        { error: 'Seul un SUPER_ADMIN_GLOBAL peut modifier le rôle d\'un SUPER_ADMIN_GLOBAL' },
        { status: 403 }
      );
    }

    // Check for duplicate email (if changing)
    if (email && email !== existing.email) {
      const dup = await db.user.findUnique({ where: { email } });
      if (dup) {
        return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 });
      }
    }

    // Check for duplicate phone (if changing)
    if (phone && phone !== existing.phone) {
      const dup = await db.user.findUnique({ where: { phone } });
      if (dup) {
        return NextResponse.json({ error: 'Ce téléphone est déjà utilisé' }, { status: 409 });
      }
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (role !== undefined) data.role = role;
    if (isActive !== undefined) data.isActive = isActive;
    if (password) data.password = await bcrypt.hash(password, 12);

    // Handle teacher-specific fields
    const targetRole = role || existing.role;
    const isTeacherRole = targetRole === 'TEACHER' || targetRole === 'HEAD_TEACHER';
    if (isTeacherRole) {
      if (subjectName !== undefined) data.subjectName = subjectName || null;
      if (classNames !== undefined) data.classNames = classNames || null;
      if (isTitulaire !== undefined) data.isTitulaire = isTitulaire;
    } else {
      data.subjectName = null;
      data.classNames = null;
      data.isTitulaire = false;
    }

    const updatedUser = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        profileImageUrl: true,
        lastLoginAt: true,
        createdAt: true,
        schoolId: true,
        subjectName: true,
        classNames: true,
        isTitulaire: true,
      },
    });

    return NextResponse.json({ data: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // SCHOOL_ADMIN/SUPER_ADMIN_GLOBAL only
    const authResult = await requireRole(request, ['SCHOOL_ADMIN']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    // Verify school access
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Soft delete: deactivate instead of deleting
    const deletedUser = await db.user.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
      },
    });

    return NextResponse.json({ data: deletedUser });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
