import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { createResetToken } from '@/lib/reset-tokens'
import { checkRateLimit } from '@/lib/auth'

// POST /api/auth/forgot-password — Request a password reset code
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone } = body

    if (!phone) {
      return NextResponse.json({ error: 'Numéro de téléphone requis' }, { status: 400 })
    }

    // Rate limit per phone + per IP: prevents code bombing (WhatsApp/SMS spam)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')?.trim()
      || 'unknown';
    if (!checkRateLimit(`forgot_${String(phone)}`, 3, 60_000)
      || !checkRateLimit(`forgot_ip_${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Trop de demandes. Réessayez dans 1 minute.' }, { status: 429 })
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
      const { isWhatsAppConnected } = await import('@/lib/whatsapp-agent')
      if (await isWhatsAppConnected()) {
        const WA_SERVER = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'
        const WA_API_KEY = process.env.WHATSAPP_API_KEY || 'edugest-wa-dev-key'
        await fetch(`${WA_SERVER}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': WA_API_KEY },
          body: JSON.stringify({ phone, message: `🔐 Code de réinitialisation: *${code}*\nValable 15 minutes.` }),
        })
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
