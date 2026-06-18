import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { checkRateLimit, createSession } from '@/lib/auth';

const WA_SERVER = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001';

const verificationCodes = new Map<string, { code: string; expiresAt: number; attempts: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of verificationCodes.entries()) {
    if (now > entry.expiresAt) verificationCodes.delete(phone);
  }
}, 5 * 60 * 1000);

function generate6DigitCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 28000);
    const res = await fetch(`${WA_SERVER}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    return data.ok === true;
  } catch {
    console.warn('[WhatsApp] Server not reachable or timeout.');
    return false;
  }
}

async function getWhatsAppStatus(): Promise<string> {
  try {
    const res = await fetch(`${WA_SERVER}/status`);
    const data = await res.json();
    return data.status || 'disconnected';
  } catch {
    return 'disconnected';
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    if (!checkRateLimit(`wa_${ip}`, 3, 60_000)) {
      return NextResponse.json({ error: 'Trop de demandes. Réessayez dans 1 minute.' }, { status: 429 });
    }

    const body = await request.json();
    const { phone, code } = body;

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return NextResponse.json({ error: 'Le numéro de téléphone est requis' }, { status: 400 });
    }

    const trimmedPhone = phone.trim().replace(/[\s\-().]/g, '');

    // ── Phase 1: Send verification code ──
    if (!code) {
      let user = await db.user.findUnique({ where: { phone: trimmedPhone } });
      if (!user) {
        const allUsers = await db.user.findMany({ select: { id: true, phone: true } });
        const normalized = trimmedPhone.replace(/^\+/, '');
        user = allUsers.find(u => u.phone?.replace(/[\s\-().]/g, '').replace(/^\+/, '') === normalized) || null;
      }
      if (!user) return NextResponse.json({ error: 'Ce numéro n\'est pas enregistré' }, { status: 404 });
      if (!user.isActive) return NextResponse.json({ error: 'Compte désactivé' }, { status: 403 });

      const verificationCode = generate6DigitCode();
      verificationCodes.set(trimmedPhone, { code: verificationCode, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });

      const status = await getWhatsAppStatus();
      if (status !== 'connected') {
        // TEST MODE: return code in response when WhatsApp not connected
        console.log(`[WhatsApp TEST] Code for ${trimmedPhone}: ${verificationCode}`);
        return NextResponse.json({
          message: 'Mode test — WhatsApp non connecté. Code retourné dans la réponse.',
          phone: trimmedPhone,
          testCode: verificationCode,
          whatsappStatus: status,
        });
      }

      const message = `🔐 Code EduGest: ${verificationCode}\n⏱ Expire dans 10 min`;
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

    if (stored.attempts >= 3) {
      verificationCodes.delete(trimmedPhone);
      return NextResponse.json({ error: 'Trop de tentatives.' }, { status: 429 });
    }

    if (stored.code !== code.trim()) {
      stored.attempts++;
      return NextResponse.json({ error: 'Code incorrect' }, { status: 401 });
    }

    verificationCodes.delete(trimmedPhone);

    let user = await db.user.findUnique({ where: { phone: trimmedPhone } });
    if (!user) {
      const allUsers = await db.user.findMany({ select: { id: true, phone: true } });
      const normalized = trimmedPhone.replace(/^\+/, '');
      const found = allUsers.find(u => u.phone?.replace(/[\s\-().]/g, '').replace(/^\+/, '') === normalized);
      if (found) user = await db.user.findUnique({ where: { id: found.id } });
    }
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
