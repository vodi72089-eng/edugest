import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyOtp } from '@/lib/otp';

/**
 * POST /api/auth/verify-otp
 * Body: { userId: string, code: string, channel: 'whatsapp' | 'email' }
 * Verifies the OTP and marks the user as verified.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, code, channel } = body;

    if (!userId || !code || !channel) {
      return NextResponse.json({ error: 'userId, code et channel requis' }, { status: 400 });
    }

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Le code doit être un nombre à 6 chiffres' }, { status: 400 });
    }

    const result = await verifyOtp(userId, code, channel, 'registration');

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Fetch updated user
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        schoolId: true, isVerified: true, emailVerifiedAt: true, phoneVerifiedAt: true,
      },
    });

    return NextResponse.json({
      data: {
        verified: true,
        user,
        message: 'Compte vérifié avec succès',
      },
    });
  } catch (error) {
    console.error('[VerifyOTP] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
