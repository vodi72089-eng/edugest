import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, name, profileImageUrl } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Verify user exists
    const existingUser = await db.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Build update data
    const updateData: { name?: string; profileImageUrl?: string } = {};
    if (name !== undefined) updateData.name = name;
    if (profileImageUrl !== undefined) updateData.profileImageUrl = profileImageUrl;

    // Update user
    const updatedUser = await db.user.update({
      where: { id: userId },
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
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
