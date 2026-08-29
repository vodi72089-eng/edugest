import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { name, profileImageUrl, phone } = body;

    // Derive userId from session user, NOT from request body
    // Users can only update their own profile
    const targetUserId = user.id;

    // Verify user exists
    const existingUser = await db.user.findUnique({ where: { id: targetUserId } });
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Validate phone format + uniqueness if provided
    let normalizedPhone: string | undefined;
    if (phone !== undefined && phone !== null) {
      normalizedPhone = String(phone).trim();
      if (!normalizedPhone) {
        return NextResponse.json(
          { error: 'Le numéro de téléphone ne peut pas être vide' },
          { status: 400 }
        );
      }
      // Basic phone validation: digits, spaces, +, -, parentheses — at least 7 digits
      const digits = normalizedPhone.replace(/[^0-9]/g, '');
      if (digits.length < 7 || digits.length > 15) {
        return NextResponse.json(
          { error: 'Numéro de téléphone invalide' },
          { status: 400 }
        );
      }
      // Uniqueness check (exclude self)
      const existing = await db.user.findUnique({ where: { phone: normalizedPhone } });
      if (existing && existing.id !== targetUserId) {
        return NextResponse.json(
          { error: 'Ce numéro de téléphone est déjà utilisé par un autre compte' },
          { status: 409 }
        );
      }
    }

    // Build update data (whitelist — only these fields can be self-edited)
    const updateData: { name?: string; profileImageUrl?: string; phone?: string } = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (profileImageUrl !== undefined) updateData.profileImageUrl = profileImageUrl;
    if (normalizedPhone !== undefined) updateData.phone = normalizedPhone;

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
      message: 'Profil mis à jour avec succès',
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
