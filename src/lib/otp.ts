import { db } from '@/lib/db';
import crypto from 'crypto';

const OTP_LENGTH = 6;
const OTP_MIN = 100000;
const OTP_MAX = 999999;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 3;

export interface OtpResult {
  success: boolean;
  code?: string;
  error?: string;
}

export interface VerifyResult {
  success: boolean;
  error?: string;
  userId?: string;
}

/**
 * Generate a 6-digit OTP and store it in the database.
 * Returns the plaintext code (to be sent via WhatsApp/Email).
 */
export async function generateOtp(
  userId: string,
  channel: 'whatsapp' | 'email',
  purpose: string = 'registration'
): Promise<OtpResult> {
  // Invalidate any existing unused tokens for this user+channel+purpose
  await db.verificationToken.updateMany({
    where: { userId, channel, purpose, used: false },
    data: { used: true },
  });

  const code = crypto.randomInt(OTP_MIN, OTP_MAX + 1).toString();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await db.verificationToken.create({
    data: {
      userId,
      code,
      channel,
      purpose,
      expiresAt,
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      used: false,
    },
  });

  return { success: true, code };
}

/**
 * Verify an OTP code. Returns the userId on success.
 */
export async function verifyOtp(
  userId: string,
  code: string,
  channel: 'whatsapp' | 'email',
  purpose: string = 'registration'
): Promise<VerifyResult> {
  const token = await db.verificationToken.findFirst({
    where: {
      userId,
      channel,
      purpose,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!token) {
    return { success: false, error: 'Code expiré ou introuvable. Demandez un nouveau code.' };
  }

  if (token.attempts >= token.maxAttempts) {
    // Mark as used to prevent further attempts
    await db.verificationToken.update({
      where: { id: token.id },
      data: { used: true },
    });
    return { success: false, error: 'Trop de tentatives. Demandez un nouveau code.' };
  }

  // Increment attempts
  await db.verificationToken.update({
    where: { id: token.id },
    data: { attempts: token.attempts + 1 },
  });

  // Constant-time comparison to prevent timing attacks
  const tokenBuf = Buffer.from(token.code, 'utf-8');
  const codeBuf = Buffer.from(code, 'utf-8');
  if (tokenBuf.length !== codeBuf.length || !crypto.timingSafeEqual(tokenBuf, codeBuf)) {
    return { success: false, error: `Code incorrect. ${OTP_MAX_ATTEMPTS - token.attempts - 1} tentative(s) restante(s).` };
  }

  // Mark as used
  await db.verificationToken.update({
    where: { id: token.id },
    data: { used: true },
  });

  // Update user verification status
  const now = new Date();
  const updateData: Record<string, unknown> = { isVerified: true };
  if (channel === 'email') updateData.emailVerifiedAt = now;
  if (channel === 'whatsapp') updateData.phoneVerifiedAt = now;

  await db.user.update({
    where: { id: userId },
    data: updateData,
  });

  return { success: true, userId };
}

/**
 * Check if a user is verified (email or phone).
 */
export async function isUserVerified(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isVerified: true, emailVerifiedAt: true, phoneVerifiedAt: true },
  });
  return user?.isVerified ?? false;
}
