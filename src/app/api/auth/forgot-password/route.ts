import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { createResetToken, normalizePhone } from '@/lib/reset-tokens'
import { checkRateLimit } from '@/lib/auth'

// POST /api/auth/forgot-password — Request a password reset code
//
// Honnêteté d'envoi (fix « le système ment ») : la réponse indique toujours
// `delivery` parmi :
//   - 'none'     : aucun compte avec ce numéro → rien n'a été envoyé
//   - 'whatsapp' : code réellement envoyé via WhatsApp
//   - 'sms'      : code réellement envoyé via le fournisseur SMS configuré
//   - 'dev'      : aucune API WhatsApp/SMS connectée — le code est renvoyé
//                  au client pour test (JAMAIS en production)
// En production, sans canal configuré, on renvoie 503 au lieu de prétendre
// qu'un message a été envoyé.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone } = body

    if (!phone) {
      return NextResponse.json({ error: 'Numéro de téléphone requis' }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(String(phone))

    // Rate limit per phone + per IP: prevents code bombing (WhatsApp/SMS spam)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')?.trim()
      || 'unknown';
    if (!checkRateLimit(`forgot_${normalizedPhone}`, 3, 60_000)
      || !checkRateLimit(`forgot_ip_${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Trop de demandes. Réessayez dans 1 minute.' }, { status: 429 })
    }

    // Find user by phone
    const user = await db.user.findUnique({ where: { phone: normalizedPhone } })
    if (!user) {
      // Ne pas générer de code : aucun compte → rien n'a été envoyé.
      // `delivery: 'none'` permet à l'UI d'afficher un message neutre sans
      // faire semblant qu'un code WhatsApp est arrivé.
      return NextResponse.json({
        delivery: 'none',
        message: 'Si un compte existe avec ce numéro, un code de réinitialisation a été envoyé.',
      })
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Compte désactivé' }, { status: 403 })
    }

    // Generate and store reset code
    const code = await createResetToken(user.id, normalizedPhone)

    // Send code via WhatsApp if possible
    let codeSent = false
    let channel: 'whatsapp' | 'sms' | null = null
    try {
      const { isWhatsAppConnected } = await import('@/lib/whatsapp-agent')
      if (await isWhatsAppConnected()) {
        const WA_SERVER = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'
        const WA_API_KEY = process.env.WHATSAPP_API_KEY || (process.env.NODE_ENV !== 'production' ? 'edugest-wa-dev-key' : '')
        await fetch(`${WA_SERVER}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': WA_API_KEY },
          body: JSON.stringify({ phone: normalizedPhone, message: `🔐 Code de réinitialisation: *${code}*\nValable 15 minutes.` }),
        })
        codeSent = true
        channel = 'whatsapp'
      }
    } catch {
      // WhatsApp not configured — try SMS below
    }

    // Vérification par SMS (fournisseur configuré dans Contrôle plateforme)
    if (!codeSent) {
      try {
        const { sendSmsViaProvider, isSmsActive } = await import('@/lib/sms')
        if (await isSmsActive()) {
          const smsResult = await sendSmsViaProvider(normalizedPhone, `EduGest : code de réinitialisation ${code}. Valable 15 minutes.`)
          if (smsResult.success) {
            codeSent = true
            channel = 'sms'
          }
        }
      } catch {
        // SMS non configuré — log for dev
      }
    }

    if (!codeSent) {
      // Aucun canal réel disponible : ne JAMAIS prétendre qu'un message a
      // été envoyé. En production on échoue explicitement ; en développement
      // on expose le code de test avec `delivery: 'dev'`.
      if (process.env.NODE_ENV === 'production') {
        console.error('[ForgotPassword] Aucun canal WhatsApp/SMS configuré — reset impossible pour', normalizedPhone)
        return NextResponse.json(
          { error: "Aucun canal d'envoi (WhatsApp/SMS) n'est configuré sur cette instance. Contactez l'administrateur de votre école." },
          { status: 503 }
        )
      }
      console.log(`[ForgotPassword] (dev, aucune API connectée) Code for ${normalizedPhone}: ${code}`)
      return NextResponse.json({
        delivery: 'dev',
        channel: 'dev',
        message: "Mode développement : aucune API WhatsApp/SMS n'est connectée. Utilisez le code de test affiché à l'écran.",
        devCode: code,
      })
    }

    return NextResponse.json({
      delivery: channel,
      channel,
      message: `Un code de réinitialisation a été envoyé par ${channel === 'sms' ? 'SMS' : 'WhatsApp'}.`,
    })
  } catch (error) {
    console.error('Error in forgot-password:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
