import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'school:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    // Verify school access
    if (!verifySchoolAccess(user, id)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const school = await db.school.findUnique({
      where: { id },
      include: {
        classes: {
          include: {
            _count: { select: { students: true } },
          },
          orderBy: { name: 'asc' },
        },
        schoolYears: { orderBy: { createdAt: 'desc' } },
        users: {
          select: { id: true, name: true, email: true, role: true, isActive: true },
        },
        comments: {
          where: { isApproved: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: { students: true, classes: true, users: true },
        },
      },
    });

    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    return NextResponse.json({ data: school });
  } catch (error) {
    console.error('Error getting school:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'school:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // Only SUPER_ADMIN_GLOBAL can update schools
    if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json(
        { error: 'Seul un SUPER_ADMIN_GLOBAL peut modifier une école' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Verify school access
    if (!verifySchoolAccess(user, id)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const existing = await db.school.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    // FIX: Mass assignment vulnerability - use explicit allowlist of fields
    const allowedFields = [
      'name', 'shortName', 'email', 'phone', 'address', 'city', 'province',
      'country', 'latitude', 'longitude', 'description', 'history', 'mission',
      'establishmentYear', 'schoolType', 'schoolCategory', 'logo', 'coverImage',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const school = await db.school.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ data: school });
  } catch (error) {
    console.error('Error updating school:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Only SUPER_ADMIN_GLOBAL can delete schools
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    // Verify school access
    if (!verifySchoolAccess(user, id)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const existing = await db.school.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    // Soft delete
    const school = await db.school.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ data: school, message: 'School deactivated successfully' });
  } catch (error) {
    console.error('Error deleting school:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
