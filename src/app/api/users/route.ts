import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { requirePermission, requireRole, verifySchoolAccess, canCreateRole, canChangeUserRole, canManageUserAccount, safeParseInt, sanitizeError } from '@/lib/auth';

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

    // L'admin PLATEFORME n'appartient à aucune école : schoolId est attendu
    // absent/null pour ce rôle — obligatoire pour tous les autres.
    const isPlatformAdminRole = role === 'SUPER_ADMIN_GLOBAL';
    if (!name || !role || (!schoolId && !isPlatformAdminRole)) {
      return NextResponse.json(
        { error: 'Champs obligatoires manquants: name, role, schoolId' },
        { status: 400 }
      );
    }
    const effectiveSchoolId: string | null = isPlatformAdminRole ? null : schoolId;

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

    // Check role creation permissions
    if (!canCreateRole(user.role, role)) {
      return NextResponse.json(
        { error: `Vous ne pouvez pas créer de compte avec le rôle ${role}` },
        { status: 403 }
      );
    }

    // Others can only assign roles within their school
    // (l'admin plateforme est créé HORS école : pas de vérification d'accès)
    if (effectiveSchoolId && !verifySchoolAccess(user, effectiveSchoolId)) {
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
    const school = effectiveSchoolId ? await db.school.findUnique({ where: { id: effectiveSchoolId } }) : null;
    if (effectiveSchoolId && !school) {
      return NextResponse.json(
        { error: 'École non trouvée' },
        { status: 404 }
      );
    }

    // ── Tier limit: maxAdmins / maxTeachers ────────────────────────────
    const { checkCanCreateUser } = await import('@/lib/subscription');
    const tierCheck = effectiveSchoolId ? await checkCanCreateUser(effectiveSchoolId, role) : { ok: true as const };
    if (!tierCheck.ok) {
      return NextResponse.json({ error: tierCheck.error, limit: tierCheck.limit, current: tierCheck.current, tierLimit: true }, { status: 403 });
    }

    // Generate random password if none provided
    // Use bcrypt cost 12
    const rawPassword = password || generateRandomPassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    // EPS se comporte comme un TEACHER (matière, classes occupées, titulaire)
    const isTeacherRole = role === 'TEACHER' || role === 'HEAD_TEACHER' || role === 'EPS';

    const newUser = await db.user.create({
      data: {
        name,
        email: email || null,
        phone: phone || `user_${Date.now()}`,
        password: hashedPassword,
        role,
        schoolId: effectiveSchoolId,
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

    // If teacher is titulaire and classNames provided, link as head teacher for the first class
    if (isTeacherRole && isTitulaire && classNames) {
      const firstClassName = classNames.split(',').map(s => s.trim()).filter(Boolean)[0];
      if (firstClassName) {
        const targetClass = await db.class.findFirst({
          where: { name: firstClassName, schoolId },
        });
        if (targetClass) {
          await db.class.update({
            where: { id: targetClass.id },
            data: { headTeacherId: newUser.id },
          });
        }
      }
    }

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
    const { id, name, email, phone, role, isActive, password, subjectName, classNames, isTitulaire, schoolId } = body;

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

    // ── SÉCURITÉ : le schoolId d'un compte est immuable pour tout non-SAG.
    // Un utilisateur ne peut jamais déplacer un compte vers une autre école.
    if (schoolId !== undefined && schoolId !== null && schoolId !== existing.schoolId) {
      if (user.role !== 'SUPER_ADMIN_GLOBAL') {
        return NextResponse.json(
          { error: 'Le changement d\'école d\'un compte est réservé au SUPER_ADMIN_GLOBAL' },
          { status: 403 }
        );
      }
      const targetSchool = await db.school.findUnique({ where: { id: schoolId }, select: { id: true } });
      if (!targetSchool) {
        return NextResponse.json({ error: 'École cible non trouvée' }, { status: 404 });
      }
    }

    // ── SÉCURITÉ : toute modification de compte exige que l'acteur ait un
    // niveau >= à la cible (empêche un SECRETARY de modifier/réinitialiser
    // le mot de passe d'un DIRECTION, SCHOOL_ADMIN, etc.).
    if (!canManageUserAccount(user, existing)) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas modifier un compte de niveau supérieur au vôtre' },
        { status: 403 }
      );
    }

    // ── SÉCURITÉ CRITIQUE : changement de rôle contrôlé par canChangeUserRole
    // (avant : seul SUPER_ADMIN_GLOBAL était protégé → un SECRETARY pouvait
    // se promouvoir lui-même ou n'importe quel compte en DIRECTION/SCHOOL_ADMIN).
    if (role !== undefined && role !== existing.role) {
      if (!canChangeUserRole(user, existing, role)) {
        return NextResponse.json(
          { error: `Changement de rôle vers « ${role} » non autorisé pour votre rôle` },
          { status: 403 }
        );
      }
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
    // schoolId ne passe JAMAIS par le body non-sécurisé : si un SAG a demandé
    // un transfert d'école (validé plus haut), on l'applique ici.
    if (schoolId !== undefined && schoolId !== null && schoolId !== existing.schoolId && user.role === 'SUPER_ADMIN_GLOBAL') {
      data.schoolId = schoolId;
    }

    // Handle teacher-specific fields (EPS se comporte comme un TEACHER)
    const targetRole = role || existing.role;
    const isTeacherRole = targetRole === 'TEACHER' || targetRole === 'HEAD_TEACHER' || targetRole === 'EPS';
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

    // If teacher is titulaire and classNames provided, link as head teacher for the first class
    if (isTeacherRole && isTitulaire !== undefined && isTitulaire && (classNames !== undefined ? classNames : existing.classNames)) {
      const effectiveClassNames = classNames !== undefined ? classNames : existing.classNames;
      if (effectiveClassNames) {
        const firstClassName = effectiveClassNames.split(',').map((s: string) => s.trim()).filter(Boolean)[0];
        if (firstClassName) {
          const targetClass = await db.class.findFirst({
            where: { name: firstClassName, schoolId: existing.schoolId || undefined },
          });
          if (targetClass) {
            await db.class.update({
              where: { id: targetClass.id },
              data: { headTeacherId: updatedUser.id },
            });
          }
        }
      }
    } else if (isTeacherRole && isTitulaire === false) {
      // If titulaire status removed, clear headTeacherId on classes where this user was head
      await db.class.updateMany({
        where: { headTeacherId: id },
        data: { headTeacherId: null },
      });
    }

    return NextResponse.json({ data: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // users:delete — SUPER_ADMIN_GLOBAL ('*') + SCHOOL_ADMIN hors forfaits qui
    // le retirent (FREEMIUM/ESSENTIEL). Avant : requireRole(['SCHOOL_ADMIN'])
    // contournait la restriction d'abonnement et excluait le super admin.
    const authResult = await requirePermission(request, 'users:delete');
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

    // Hiérarchie : impossible de désactiver un compte de niveau supérieur
    // (ex. un DIRECTION ne peut pas désactiver un SCHOOL_ADMIN).
    if (!canManageUserAccount(user, existing)) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas désactiver un compte de niveau supérieur au vôtre' },
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
