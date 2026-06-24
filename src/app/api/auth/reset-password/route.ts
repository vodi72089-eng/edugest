import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { verifyResetToken } from '@/lib/reset-tokens'
import { revokeAllUserSessionsExcept } from '@/lib/auth'

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

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 6 caractères' },
        { status: 400 }
      )
    }

    // Verify the reset code
    const result = verifyResetToken(phone, code)
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
