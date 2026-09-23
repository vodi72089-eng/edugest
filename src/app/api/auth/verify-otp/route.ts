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

    // ── SÉCURITÉ (HexStrike/OTP-hardening) : rate limit par IP en complément
    // du plafond de 3 tentatives par code (lib/otp.ts). Sans cela, un attaquant
    // pouvait marteler l'endpoint (spam/énumération de userId) même si le
    // brute force du code lui-même reste plafonné côté base.
    const { checkRateLimit } = await import('@/lib/auth');
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(`verify-otp:ip:${clientIp}`, 20, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, { status: 429 });
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
