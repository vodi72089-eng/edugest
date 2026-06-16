import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import crypto from 'crypto';
import { checkRateLimit, createSession } from '@/lib/auth';

// In-memory store: phone -> { code, expiresAt, attempts }
const verificationCodes = new Map<string, { code: string; expiresAt: number; attempts: number }>();

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [phone, entry] of verificationCodes.entries()) {
      if (now > entry.expiresAt) verificationCodes.delete(phone);
    }
  }, 5 * 60 * 1000);
}

function generate6DigitCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  try {
    const zai = await ZAI.create();
    await zai.functions.invoke('send_whatsapp' as any, { phone, message });
    return true;
  } catch (error) {
    console.error('[WhatsApp] Failed to send:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    // Rate limit: 3 requests per minute per IP
    if (!checkRateLimit(`wa_${ip}`, 3, 60_000)) {
      return NextResponse.json({ error: 'Trop de demandes. Réessayez dans 1 minute.' }, { status: 429 });
    }

    const body = await request.json();
    const { phone, code } = body;

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return NextResponse.json({ error: 'Le numéro de téléphone est requis' }, { status: 400 });
    }

    const trimmedPhone = phone.trim();

    // ── Phase 1: Send verification code ──
    if (!code) {
      const user = await db.user.findUnique({ where: { phone: trimmedPhone } });
      if (!user) return NextResponse.json({ error: 'Ce numéro n\'est pas enregistré' }, { status: 404 });
      if (!user.isActive) return NextResponse.json({ error: 'Compte désactivé' }, { status: 403 });

      const verificationCode = generate6DigitCode();
      verificationCodes.set(trimmedPhone, { code: verificationCode, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });

      const message = `Votre code de vérification EduGest est : ${verificationCode}\n\nCe code expire dans 10 minutes.`;
      const sent = await sendWhatsAppMessage(trimmedPhone, message);

      if (!sent) {
        verificationCodes.delete(trimmedPhone);
        return NextResponse.json({ error: 'Échec de l\'envoi WhatsApp' }, { status: 500 });
      }

      return NextResponse.json({ message: 'Code envoyé via WhatsApp', phone: trimmedPhone });
    }

    // ── Phase 2: Verify code and login ──
    if (typeof code !== 'string' || !code.trim()) {
      return NextResponse.json({ error: 'Code requis' }, { status: 400 });
    }

    const stored = verificationCodes.get(trimmedPhone);
    if (!stored) return NextResponse.json({ error: 'Aucun code trouvé. Demandez-en un nouveau.' }, { status: 400 });
    if (Date.now() > stored.expiresAt) { verificationCodes.delete(trimmedPhone); return NextResponse.json({ error: 'Code expiré' }, { status: 400 }); }

    // Brute-force protection
    if (stored.attempts >= 3) {
      verificationCodes.delete(trimmedPhone);
      return NextResponse.json({ error: 'Trop de tentatives. Demandez un nouveau code.' }, { status: 429 });
    }

    if (stored.code !== code.trim()) {
      stored.attempts++;
      return NextResponse.json({ error: 'Code incorrect' }, { status: 401 });
    }

    verificationCodes.delete(trimmedPhone);

    const user = await db.user.findUnique({ where: { phone: trimmedPhone } });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    if (!user.isActive) return NextResponse.json({ error: 'Compte désactivé' }, { status: 403 });

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const sessionToken = createSession(user.id);
    const { password: _, ...userData } = user;
    const school = await db.school.findUnique({
      where: { id: user.schoolId },
      select: { id: true, name: true, shortName: true, city: true, country: true },
    });

    return NextResponse.json({ data: { ...userData, token: sessionToken, school } });
  } catch (error) {
    console.error('[WhatsApp Auth] Error:', error);
    return NextResponse.json({ error: 'Échec de l\'authentification WhatsApp' }, { status: 500 });
  }
}
