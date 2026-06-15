import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // Derive userId from session user, NOT from request params
    // Users can only view their own profile (unless SUPER_ADMIN_GLOBAL)
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');

    const targetUserId = (user.role === 'SUPER_ADMIN_GLOBAL' && requestedUserId)
      ? requestedUserId
      : user.id;

    const userProfile = await db.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        schoolId: true,
        profileImageUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        school: {
          select: { id: true, name: true, shortName: true, city: true, country: true },
        },
      },
    });

    if (!userProfile) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    return NextResponse.json({ data: userProfile });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { name, profileImageUrl } = body;

    // Derive userId from session user, NOT from request body
    // Users can only update their own profile
    const targetUserId = user.id;

    // Build update data
    const updateData: { name?: string; profileImageUrl?: string | null } = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Le nom ne peut pas être vide' }, { status: 400 });
      }
      updateData.name = name.trim();
    }
    if (profileImageUrl !== undefined) {
      updateData.profileImageUrl = profileImageUrl;
    }

    // If nothing to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Aucune donnée à mettre à jour' }, { status: 400 });
    }

    // Verify user exists
    const existingUser = await db.user.findUnique({ where: { id: targetUserId } });
    if (!existingUser) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    // Update user
    const updatedUser = await db.user.update({
      where: { id: targetUserId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        schoolId: true,
        profileImageUrl: true,
        isActive: true,
        school: {
          select: { id: true, name: true, shortName: true, city: true, country: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedUser,
      message: 'Profil mis à jour avec succès',
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
