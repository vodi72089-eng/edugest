import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { createResetToken } from '@/lib/reset-tokens'

// POST /api/auth/forgot-password — Request a password reset code
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone } = body

    if (!phone) {
      return NextResponse.json({ error: 'Numéro de téléphone requis' }, { status: 400 })
    }

    // Find user by phone
    const user = await db.user.findUnique({ where: { phone } })
    if (!user) {
      // Don't reveal if user exists or not
      return NextResponse.json({
        message: 'Si un compte existe avec ce numéro, un code de réinitialisation a été envoyé.',
      })
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Compte désactivé' }, { status: 403 })
    }

    // Generate and store reset code
    const code = createResetToken(user.id, phone)

    // Send code via WhatsApp if possible
    try {
      const whatsappAgent = await import('@/lib/whatsapp-agent')
      if (whatsappAgent.default && typeof whatsappAgent.default.sendMessage === 'function') {
        await whatsappAgent.default.sendMessage(phone, `🔐 Code de réinitialisation: *${code}*\nValable 15 minutes.`)
      }
    } catch {
      // WhatsApp not configured — log code for dev
      console.log(`[ForgotPassword] Code for ${phone}: ${code}`)
    }

    return NextResponse.json({
      message: 'Si un compte existe avec ce numéro, un code de réinitialisation a été envoyé.',
      // In dev mode, return the code for testing
      ...(process.env.NODE_ENV !== 'production' && { devCode: code }),
    })
  } catch (error) {
    console.error('Error in forgot-password:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
