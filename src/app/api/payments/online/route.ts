import { db } from '@/lib/db'
import { requireAuth, verifyParentAccess, sanitizeError } from '@/lib/auth'
import { initiatePayment } from '@/lib/payment-gateway'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

// POST /api/payments/online
// ORCHESTRATEUR honnête du paiement en ligne parent :
//   Parent → vérifications → PaymentRecord PENDING (SANS numéro de reçu)
//   → PaymentTransaction via initiatePayment (passerelle RÉELLE ou TEST
//   labellisé) → 202 + prochaine étape (redirect checkout | attente STK).
// AUCUN reçu, AUCUN statut PAID ici : seule la confirmation (webhook vérifié
// ou validation caissier en mode TEST) solde le paiement.
// Méthodes hébergées uniquement : PAS de VISA/MASTERCARD (redirect-only sans
// intégration), PAS de MANUAL/CASH (voir /api/payments + vérification).
const HOSTED_METHODS = ['ORANGE_MONEY', 'MPESA', 'AIRTEL_MONEY', 'FLUTTERWAVE', 'BICTORYS']

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    if (user.role !== 'PARENT') {
      return NextResponse.json({ error: 'Accès réservé aux parents' }, { status: 403 })
    }

    const body = await request.json()
    const { studentId, amount, paymentMethod, phone, trimester } = body

    if (!studentId || !amount || !paymentMethod) {
      return NextResponse.json(
        { error: 'Champs requis: studentId, amount, paymentMethod' },
        { status: 400 }
      )
    }

    const numericAmount = Math.round(Number(amount))
    if (Number.isNaN(numericAmount) || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: 'Le montant doit être un nombre supérieur à 0' }, { status: 400 })
    }

    if (!HOSTED_METHODS.includes(paymentMethod)) {
      return NextResponse.json(
        { error: `Méthode non supportée en ligne: ${paymentMethod}. Utilisez le caissier pour les autres moyens.` },
        { status: 400 }
      )
    }

    // Verify parent owns this student
    const hasAccess = await verifyParentAccess(user, studentId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Cet élève ne vous appartient pas' }, { status: 403 })
    }

    // Get student and school info
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true, matricule: true, schoolId: true },
    })
    if (!student) {
      return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 })
    }

    // Monnaie de base de l'école (les montants sont stockés en monnaie de base)
    const currencyConfig = await db.schoolCurrencyConfig.findUnique({
      where: { schoolId: student.schoolId },
      select: { baseCurrency: true },
    })
    const baseCurrency = currencyConfig?.baseCurrency || 'CDF'

    // Passerelle réellement disponible pour cette école (configurée + active).
    // Sans elle : 400 explicite, jamais de fausse initiation.
    const gwConfig = await db.paymentGatewayConfig.findUnique({
      where: { schoolId_gatewayType: { schoolId: student.schoolId, gatewayType: paymentMethod } },
      select: { isActive: true, isTestMode: true, currency: true },
    })
    if (!gwConfig || !gwConfig.isActive) {
      return NextResponse.json(
        { error: `La passerelle ${paymentMethod} n'est pas activée pour votre école. Contactez la direction.` },
        { status: 400 }
      )
    }

    // Référence interne unique (jamais un numéro de reçu : rien n'est payé).
    const ref = `EP-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`

    // PaymentRecord PENDING, paidAmount 0, SANS receiptNumber.
    const payment = await db.paymentRecord.create({
      data: {
        studentId,
        schoolId: student.schoolId,
        amount: numericAmount,
        paidAmount: 0,
        trimester: trimester || 'T1',
        paymentMethod,
        referenceNumber: ref,
        status: 'PENDING',
        receiptNumber: null,
        paidAt: null,
      },
    })

    // Appel RÉEL de la passerelle (ou simulation labellisée en mode TEST).
    const gwResult = await initiatePayment(paymentMethod as any, {
      schoolId: student.schoolId,
      studentId,
      paymentRecordId: payment.id,
      amount: numericAmount,
      currency: baseCurrency,
      description: `Scolarité ${student.firstName} ${student.lastName} (${student.matricule}) — ${trimester || 'T1'}`,
      customerPhone: (phone || '').trim() || undefined,
      initiatedBy: user.id,
    })

    if (!gwResult.success) {
      // Échec d'initiation : le record reste PENDING, message réel au parent.
      return NextResponse.json(
        { error: gwResult.message || "Échec de l'initiation du paiement", paymentId: payment.id },
        { status: 422 }
      )
    }

    // Prochaine étape honnête : redirection checkout OU attente STK.
    const nextStep = gwResult.checkoutUrl
      ? { action: 'redirect' as const, url: gwResult.checkoutUrl }
      : { action: 'wait' as const, hint: 'Confirmez le paiement sur votre téléphone' }

    // Mode TEST : aucun webhook ne viendra — le caissier vérifie manuellement.
    if (gwResult.testMode) {
      try {
        await db.paymentRecord.update({
          where: { id: payment.id },
          data: { verificationNote: 'Initiation MODE TEST — vérification manuelle requise' },
        })
      } catch { /* non-bloquant */ }
    }

    // Notifier le caissier UNIQUEMENT en mode TEST (en live, le webhook confirme).
    if (gwResult.testMode) {
      try {
        const whatsappServerUrl = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'
        const whatsappApiKey = process.env.WHATSAPP_API_KEY || ''
        const cashierPhone = process.env.CASHIER_PHONE || ''
        if (cashierPhone && whatsappApiKey) {
          const msg = `Demande de paiement (MODE TEST)\n\nÉlève: ${student.firstName} ${student.lastName}\nMatricule: ${student.matricule}\nMontant: ${numericAmount.toLocaleString('fr-FR')} ${baseCurrency}\nMéthode: ${paymentMethod}\nRéférence: ${ref}\n\nVeuillez vérifier et confirmer ce paiement.`
          await fetch(`${whatsappServerUrl}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': whatsappApiKey },
            body: JSON.stringify({ phone: cashierPhone, message: msg }),
            signal: AbortSignal.timeout(10000),
          })
        }
      } catch { /* notification best-effort */ }
    }

    return NextResponse.json(
      {
        data: {
          id: payment.id,
          referenceNumber: ref,
          status: 'PENDING',
          amount: numericAmount,
          currency: baseCurrency,
          student: { id: student.id, firstName: student.firstName, lastName: student.lastName, matricule: student.matricule },
          transaction: {
            id: gwResult.transactionId || null,
            reference: gwResult.reference,
            gatewayTransactionId: gwResult.gatewayTransactionId || null,
            status: gwResult.status,
          },
          testMode: !!gwResult.testMode,
          nextStep,
        },
        message: gwResult.testMode
          ? 'Demande enregistrée (MODE TEST) — le caissier vérifiera manuellement.'
          : 'Paiement initié — en attente de confirmation.',
      },
      { status: 202 }
    )
  } catch (error) {
    console.error('[PaymentsOnline] Error:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}
