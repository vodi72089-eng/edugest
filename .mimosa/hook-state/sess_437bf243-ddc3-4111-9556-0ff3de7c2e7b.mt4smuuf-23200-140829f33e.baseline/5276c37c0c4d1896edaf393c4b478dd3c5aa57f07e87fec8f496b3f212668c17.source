import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { verifyResetToken } from '@/lib/reset-tokens'
import { revokeAllUserSessionsExcept, getClientIp, checkRateLimit } from '@/lib/auth'

// POST /api/auth/reset-password — Reset password with code
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, code, newPassword } = body

    if (!phone || !code || !newPassword) {
      return NextResponse.json(
        { error: 'Champs requis manquants: phone, code, newPassword' },
        { status: 400 }
      )
    }

    if (typeof newPassword !== 'string') {
      return NextResponse.json(
        { error: 'Mot de passe invalide' },
        { status: 400 }
      )
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 6 caractères' },
        { status: 400 }
      )
    }

    if (newPassword.length > 128) {
      return NextResponse.json(
        { error: 'Le mot de passe ne doit pas dépasser 128 caractères' },
        { status: 400 }
      )
    }

    // ── Rate limiting ──────────────────────────────────────────────
    // Par IP : limite large (10 essais / 15 min) pour ne pas bloquer
    // plusieurs utilisateurs derrière un même NAT.
    const ip = getClientIp(request) || 'unknown'
    if (!checkRateLimit(`reset_ip_${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
        { status: 429 }
      )
    }

    // Par numéro : bloque le brute-force du code de reset d'un compte
    // ciblé (code 6 chiffres = 1M combinaisons, MAX_ATTEMPTS par token).
    const trimmedPhone = String(phone).trim()
    if (!checkRateLimit(`reset_phone_${trimmedPhone}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
        { status: 429 }
      )
    }

    // Verify the reset code
    const result = verifyResetToken(trimmedPhone, String(code).trim())
    if (!result) {
      return NextResponse.json(
        { error: 'Code invalide ou expiré' },
        { status: 400 }
      )
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Update the password
    await db.user.update({
      where: { id: result.userId },
      data: { password: hashedPassword },
    })

    // Revoke all other sessions (force re-login on other devices)
    revokeAllUserSessionsExcept(result.userId, '')

    return NextResponse.json({
      message: 'Mot de passe réinitialisé avec succès. Veuillez vous reconnecter.',
    })
  } catch (error) {
    console.error('Error in reset-password:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
