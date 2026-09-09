import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateOtp } from '@/lib/otp';
import { sendOtpEmail } from '@/lib/email';

const WA_SERVER = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001';
const WA_API_KEY = process.env.WHATSAPP_API_KEY || 'edugest-wa-dev-key';

async function sendWhatsAppOtp(phone: string, code: string): Promise<boolean> {
  try {
    const message = `🔐 Code de vérification EduGest: ${code}\n\nCe code expire dans 10 minutes. Ne le partagez avec personne.`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 28000);
    const res = await fetch(`${WA_SERVER}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WA_API_KEY },
      body: JSON.stringify({ phone, message }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    return data.ok === true;
  } catch (error) {
    console.warn('[SendOTP] WhatsApp send failed:', error);
    return false;
  }
}

/**
 * POST /api/auth/send-otp
 * Body: { userId: string, channel: 'whatsapp' | 'email' | 'both' }
 * Sends OTP via the requested channel(s).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, channel } = body;

    if (!userId || !channel) {
      return NextResponse.json({ error: 'userId et channel requis' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, name: true, isVerified: true, schoolId: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    if (user.isVerified) {
      return NextResponse.json({ error: 'Compte déjà vérifié' }, { status: 400 });
    }

    const school = await db.school.findUnique({
      where: { id: user.schoolId },
      select: { name: true },
    });

    const results: Record<string, { sent: boolean; error?: string }> = {};

    // Send via WhatsApp
    if (channel === 'whatsapp' || channel === 'both') {
      if (!user.phone) {
        results.whatsapp = { sent: false, error: 'Numéro de téléphone manquant' };
      } else {
        const otpResult = await generateOtp(user.id, 'whatsapp', 'registration');
        if (otpResult.success && otpResult.code) {
          const sent = await sendWhatsAppOtp(user.phone, otpResult.code);
          results.whatsapp = { sent, error: sent ? undefined : 'Échec envoi WhatsApp' };
        } else {
          results.whatsapp = { sent: false, error: otpResult.error };
        }
      }
    }

    // Send via Email
    if (channel === 'email' || channel === 'both') {
      if (!user.email) {
        results.email = { sent: false, error: 'Adresse email manquante' };
      } else {
        const otpResult = await generateOtp(user.id, 'email', 'registration');
        if (otpResult.success && otpResult.code) {
          const emailResult = await sendOtpEmail(user.email, otpResult.code, school?.name || 'EduGest');
          results.email = { sent: emailResult.success, error: emailResult.error };
        } else {
          results.email = { sent: false, error: otpResult.error };
        }
      }
    }

    return NextResponse.json({ data: results });
  } catch (error) {
    console.error('[SendOTP] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
