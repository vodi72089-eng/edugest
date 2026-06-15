import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

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

    // Verify user exists
    const existingUser = await db.user.findUnique({ where: { id: targetUserId } });
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Build update data
    const updateData: { name?: string; profileImageUrl?: string } = {};
    if (name !== undefined) updateData.name = name;
    if (profileImageUrl !== undefined) updateData.profileImageUrl = profileImageUrl;

    // Update user
    const updatedUser = await db.user.update({
      where: { id: targetUserId },
      data: updateData,
      include: {
        school: {
          select: { id: true, name: true, shortName: true, city: true, country: true },
        },
      },
    });

    const { password: _, ...userData } = updatedUser;

    return NextResponse.json({
      data: userData,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
