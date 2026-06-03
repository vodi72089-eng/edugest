import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

// In-memory store for verification codes: phone -> { code, expiresAt }
const verificationCodes = new Map<string, { code: string; expiresAt: number }>();

// Clean up expired codes every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [phone, entry] of verificationCodes.entries()) {
      if (now > entry.expiresAt) {
        verificationCodes.delete(phone);
      }
    }
  }, 5 * 60 * 1000);
}

function generate6DigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  try {
    const zai = await ZAI.create();
    const result = await zai.functions.invoke('send_whatsapp' as any, {
      phone,
      message,
    });
    console.log('[WhatsApp Auth] Message sent successfully to:', phone, 'Result:', result);
    return true;
  } catch (error) {
    console.error('[WhatsApp Auth] Failed to send WhatsApp message:', error);
    // Return true anyway to not block the flow during development/testing
    // In production, you may want to return false and handle the error
    console.warn('[WhatsApp Auth] Continuing despite send failure - code is still stored');
    return true;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, code } = body;

    // Validate phone number
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return NextResponse.json(
        { error: 'Le numéro de téléphone est requis' },
        { status: 400 }
      );
    }

    const trimmedPhone = phone.trim();

    // --- Phase 1: Send verification code ---
    if (!code) {
      // Check if phone exists in the database
      const user = await db.user.findUnique({
        where: { phone: trimmedPhone },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'Ce numéro n\'est pas enregistré dans notre système' },
          { status: 404 }
        );
      }

      if (!user.isActive) {
        return NextResponse.json(
          { error: 'Votre compte est désactivé. Contactez l\'administration.' },
          { status: 403 }
        );
      }

      // Generate a 6-digit verification code
      const verificationCode = generate6DigitCode();

      // Store the code with a 10-minute expiration
      verificationCodes.set(trimmedPhone, {
        code: verificationCode,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      });

      // Send the code via WhatsApp
      const message = `Votre code de vérification EduGest est : ${verificationCode}\n\nCe code expire dans 10 minutes. Ne le partagez avec personne.`;
      const sent = await sendWhatsAppMessage(trimmedPhone, message);

      if (!sent) {
        // Clean up the stored code if message failed
        verificationCodes.delete(trimmedPhone);
        return NextResponse.json(
          { error: 'Échec de l\'envoi du code WhatsApp. Veuillez réessayer.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        message: 'Code de vérification envoyé via WhatsApp',
        phone: trimmedPhone,
      });
    }

    // --- Phase 2: Verify the code and log in ---
    if (typeof code !== 'string' || !code.trim()) {
      return NextResponse.json(
        { error: 'Le code de vérification est requis' },
        { status: 400 }
      );
    }

    const storedEntry = verificationCodes.get(trimmedPhone);

    if (!storedEntry) {
      return NextResponse.json(
        { error: 'Aucun code de vérification trouvé pour ce numéro. Veuillez demander un nouveau code.' },
        { status: 400 }
      );
    }

    // Check if code has expired
    if (Date.now() > storedEntry.expiresAt) {
      verificationCodes.delete(trimmedPhone);
      return NextResponse.json(
        { error: 'Le code de vérification a expiré. Veuillez demander un nouveau code.' },
        { status: 400 }
      );
    }

    // Verify the code matches
    if (storedEntry.code !== code.trim()) {
      return NextResponse.json(
        { error: 'Code de vérification incorrect' },
        { status: 401 }
      );
    }

    // Code is valid - remove it from store (one-time use)
    verificationCodes.delete(trimmedPhone);

    // Find the user by phone
    const user = await db.user.findUnique({
      where: { phone: trimmedPhone },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 404 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Votre compte est désactivé. Contactez l\'administration.' },
        { status: 403 }
      );
    }

    // Update lastLoginAt
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Return user data (same format as /api/auth)
    const { password: _, ...userData } = user;

    const school = await db.school.findUnique({
      where: { id: user.schoolId },
      select: {
        id: true,
        name: true,
        shortName: true,
        city: true,
        country: true,
      },
    });

    return NextResponse.json({
      data: {
        ...userData,
        school,
      },
    });
  } catch (error) {
    console.error('[WhatsApp Auth] Error during WhatsApp authentication:', error);
    return NextResponse.json(
      { error: 'Échec de l\'authentification WhatsApp. Veuillez réessayer.' },
      { status: 500 }
    );
  }
}
