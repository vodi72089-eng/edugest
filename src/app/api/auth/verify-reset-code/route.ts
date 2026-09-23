import { NextRequest, NextResponse } from 'next/server'
import { checkResetToken, normalizePhone } from '@/lib/reset-tokens'
import { getClientIp, checkRateLimit } from '@/lib/auth'

/**
 * POST /api/auth/verify-reset-code
 * Body: { phone, code }
 * Vérifie le code de réinitialisation SANS le consommer.
 * Utilisé par l'étape 2 de la modale « Mot de passe oublié » : avant ce fix,
 * le bouton « Continuer » passait à l'étape suivante sans aucune vérification,
 * donc n'importe quel code semblait « marcher ».
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, code } = body

    if (!phone || !code) {
      return NextResponse.json({ error: 'Numéro et code requis' }, { status: 400 })
    }

    if (!/^\d{6}$/.test(String(code).trim())) {
      return NextResponse.json({ error: 'Le code doit contenir 6 chiffres' }, { status: 400 })
    }

    // ── Rate limiting (mêmes compteurs que reset-password) ────────────
    const ip = getClientIp(request) || 'unknown'
    if (!checkRateLimit(`reset_ip_${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, { status: 429 })
    }
    const normalizedPhone = normalizePhone(String(phone))
    if (!checkRateLimit(`reset_phone_${normalizedPhone}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, { status: 429 })
    }

    const result = await checkResetToken(normalizedPhone, String(code).trim())
    if (!result) {
      return NextResponse.json({ error: 'Code invalide ou expiré' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, message: 'Code valide' })
  } catch (error) {
    console.error('Error in verify-reset-code:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
