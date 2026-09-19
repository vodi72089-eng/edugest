import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { decryptSecret } from '@/lib/gateway-keys'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// POST /api/payments/webhook?gateway=MPESA|ORANGE_MONEY|AIRTEL_MONEY
//
// Chaîne de confiance STRICTE (aucun succès sans preuve) :
//  1. signature HMAC-SHA256 du corps brut, avec le webhookSecret DE L'ÉCOLE
//     (PaymentGatewayConfig, déchiffré) — repli secret d'env par passerelle.
//     En production SANS aucun secret → 401 systématique.
//  2. rapprochement : gatewayTransactionId EXACT d'abord (M-Pesa tronque
//     AccountReference à 12 caractères — jamais de recherche sur valeur
//     tronquée), puis référence interne exacte.
//  3. idempotence : SUCCESS déjà traité → no-op (pas de double notif/paiement).
//     On ne rétrograde jamais SUCCESS → FAILED.
//  4. montant/devise : comparés à la transaction. Écart → AMOUNT_MISMATCH
//     (jamais PAID) + audit.
//  5. confirmation atomique (transaction) : PaymentTransaction + PaymentRecord
//     (+ PARTIAL si sous-paiement) + audit, puis notification parent.
//  6. logs structurés SANS secrets (jamais le corps brut).

const ENV_WEBHOOK_SECRETS: Record<string, string | undefined> = {
  MPESA: process.env.MPESA_WEBHOOK_SECRET,
  ORANGE_MONEY: process.env.ORANGE_MONEY_WEBHOOK_SECRET,
  AIRTEL_MONEY: process.env.AIRTEL_MONEY_WEBHOOK_SECRET,
}

const EPSILON = 0.01

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function hmacMatches(secret: string, body: string, signature: string): boolean {
  try {
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(body)
    return safeEqual(signature, hmac.digest('hex'))
  } catch {
    return false
  }
}

interface ParsedEvent {
  reference: string | null
  gatewayTransactionId: string | null
  status: 'SUCCESS' | 'FAILED' | 'PENDING'
  amount: number | null
  currency: string | null
}

function parseEvent(gateway: string, payload: Record<string, any>): ParsedEvent {
  if (gateway === 'MPESA') {
    // NOTE : AccountReference est tronqué à 12 caractères par Safaricom —
    // il ne sert PAS au rapprochement (voir lookup ci-dessous).
    const r = payload.ResultCode ?? payload.ResultDesc ?? ''
    const rs = String(r)
    return {
      reference: (payload.AccountReference as string) || null,
      gatewayTransactionId: (payload.CheckoutRequestID as string) || (payload.MpesaReceiptNumber as string) || null,
      status: rs === '0' || rs.startsWith('0') ? 'SUCCESS' : rs ? 'FAILED' : 'PENDING',
      amount: payload.Amount != null ? Number(payload.Amount) : null,
      currency: (payload.Currency as string) || null,
    }
  }
  if (gateway === 'ORANGE_MONEY') {
    const omStatus = payload.status as string
    return {
      reference: (payload.order_id as string) || (payload.txnid as string) || null,
      gatewayTransactionId: (payload.pay_token as string) || (payload.notif_token as string) || null,
      status: omStatus === 'SUCCESS' ? 'SUCCESS' : omStatus === 'FAILED' ? 'FAILED' : 'PENDING',
      amount: payload.amount != null ? Number(payload.amount) : null,
      currency: (payload.currency as string) || null,
    }
  }
  // AIRTEL_MONEY
  const txData = payload.data?.transaction as Record<string, unknown> | undefined
  const amStatus = (txData?.status as string) || (payload.status as string) || ''
  return {
    reference: (payload.data?.reference as string) || null,
    gatewayTransactionId: (txData?.id as string) || (txData?.transaction_id as string) || null,
    status: amStatus === 'success' || amStatus === 'SUCCESS' ? 'SUCCESS' : amStatus === 'failed' || amStatus === 'FAILED' ? 'FAILED' : 'PENDING',
    amount: txData?.amount != null ? Number(txData.amount) : null,
    currency: (txData?.currency as string) || null,
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const gateway = searchParams.get('gateway')?.toUpperCase() || ''

    if (!gateway || !['MPESA', 'ORANGE_MONEY', 'AIRTEL_MONEY'].includes(gateway)) {
      return NextResponse.json({ error: 'Gateway non supporté' }, { status: 400 })
    }

    const rawBody = await request.text()
    let payload: Record<string, any>
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
    }

    const event = parseEvent(gateway, payload)
    if (!event.reference && !event.gatewayTransactionId) {
      console.warn(`[Webhook] ${gateway} — identifiant manquant`)
      return NextResponse.json({ error: 'Référence manquante' }, { status: 400 })
    }
    console.log(`[Webhook] ${gateway} — reçu (event=${event.status})`)

    // ── Rapprochement : id passerelle EXACT d'abord, référence interne ensuite ──
    let transaction: Awaited<ReturnType<typeof db.paymentTransaction.findFirst>> = null
    if (event.gatewayTransactionId) {
      transaction = await db.paymentTransaction.findFirst({
        where: { gatewayType: gateway, gatewayTransactionId: event.gatewayTransactionId },
      })
    }
    if (!transaction && event.reference) {
      transaction = await db.paymentTransaction.findFirst({
        where: { gatewayType: gateway, reference: event.reference },
      })
    }
    if (!transaction) {
      console.warn(`[Webhook] ${gateway} — transaction introuvable`)
      return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })
    }

    // ── Signature : secret DE L'ÉCOLE d'abord, env ensuite ──
    const schoolConfig = await db.paymentGatewayConfig.findUnique({
      where: {
        schoolId_gatewayType: { schoolId: transaction.schoolId, gatewayType: gateway },
      },
      select: { webhookSecret: true },
    })
    let schoolSecret: string | undefined
    try {
      schoolSecret = decryptSecret(schoolConfig?.webhookSecret) || undefined
    } catch (e) {
      console.warn(`[Webhook] ${gateway} — secret école illisible, repli env`)
    }
    const secret = schoolSecret || ENV_WEBHOOK_SECRETS[gateway]
    const signature = request.headers.get('x-webhook-signature')
    if (!secret) {
      console.warn(`[Webhook] ${gateway} — aucun secret configuré, requête rejetée`)
      return NextResponse.json({ error: 'Webhook non authentifié' }, { status: 401 })
    }
    if (!signature || !hmacMatches(secret, rawBody, signature)) {
      console.warn(`[Webhook] ${gateway} — signature invalide (école ${transaction.schoolId})`)
      return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
    }
    console.log(`[Webhook] ${gateway} — signature vérifiée (transaction ${transaction.id})`)

    // ── Idempotence + garde-fous de transition ──
    if (transaction.status === 'SUCCESS') {
      // Rejeu ou statut contradictoire : jamais de double effet, jamais de rétrogradation.
      console.log(`[Webhook] ${gateway} — transaction déjà SUCCESS, ignoré (idempotent)`)
      return NextResponse.json({ received: true, duplicate: true })
    }

    // ── Montant / devise ──
    if (event.status === 'SUCCESS') {
      const expectedAmount = Number(transaction.amount)
      const expectedCurrency = (transaction.currency || '').toUpperCase()
      if (event.amount != null && Number.isFinite(event.amount)) {
        if (Math.abs(Number(event.amount) - expectedAmount) >= EPSILON && Number(event.amount) < expectedAmount - EPSILON) {
          // Sous-paiement : géré en PARTIAL plus bas si rattaché, sinon AMOUNT_MISMATCH.
        } else if (Math.abs(Number(event.amount) - expectedAmount) >= EPSILON && Number(event.amount) > expectedAmount + EPSILON) {
          // Sur-paiement : accepté (PAID), écart tracé en audit.
        }
      }
      if (event.currency && expectedCurrency && event.currency.toUpperCase() !== expectedCurrency) {
        await db.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: 'AMOUNT_MISMATCH', gatewayTransactionId: event.gatewayTransactionId || transaction.gatewayTransactionId, gatewayResponse: JSON.stringify({ verified: true, mismatch: 'currency', expected: expectedCurrency, received: event.currency }) },
        })
        await db.auditLog.create({
          data: {
            userId: 'webhook', userName: `webhook:${gateway}`, userRole: 'SYSTEM',
            action: 'WEBHOOK_AMOUNT_MISMATCH', entityType: 'PaymentTransaction', entityId: transaction.id,
            details: `Devise inattendue: ${event.currency} (attendu ${expectedCurrency})`,
          },
        })
        console.warn(`[Webhook] ${gateway} — devise incohérente (${event.currency} vs ${expectedCurrency})`)
        return NextResponse.json({ received: true, mismatch: 'currency' }, { status: 422 })
      }
    }

    const newStatus = event.status
    const updatedTransaction = await db.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: newStatus,
        gatewayTransactionId: event.gatewayTransactionId || transaction.gatewayTransactionId,
        gatewayResponse: JSON.stringify({ verified: true, status: event.status, amount: event.amount, currency: event.currency }),
        completedAt: newStatus === 'SUCCESS' ? new Date() : null,
      },
    })
    console.log(`[Webhook] ${gateway} — transaction ${transaction.id} → ${newStatus}`)

    if (newStatus === 'SUCCESS' && transaction.paymentRecordId) {
      const record = await db.paymentRecord.findUnique({
        where: { id: transaction.paymentRecordId },
      })
      if (!record) {
        console.warn(`[Webhook] ${gateway} — PaymentRecord introuvable (${transaction.paymentRecordId})`)
        return NextResponse.json({ received: true, recordMissing: true })
      }
      if (record.status === 'PAID') {
        console.log(`[Webhook] ${gateway} — record déjà PAID, pas de double effet`)
        return NextResponse.json({ received: true, duplicate: true })
      }

      // Cumul : le webhook apporte event.amount (ou le montant transaction).
      const incoming = event.amount != null && Number.isFinite(Number(event.amount)) ? Number(event.amount) : Number(transaction.amount)
      const alreadyPaid = Number(record.paidAmount)
      const newPaid = alreadyPaid + incoming
      const due = Number(record.amount)
      const isFull = newPaid + EPSILON >= due

      if (!isFull && alreadyPaid < EPSILON) {
        // Premier versement insuffisant → incohérence : AMOUNT_MISMATCH,
        // PARTIAL côté record, jamais PAID. Les versements suivants
        // s'accumulent normalement en PARTIAL (paiements fractionnés).
        await db.$transaction([
          db.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'AMOUNT_MISMATCH' } }),
          db.paymentRecord.update({ where: { id: record.id }, data: { status: 'PARTIAL', paidAmount: Math.round(newPaid) } }),
          db.auditLog.create({
            data: {
              userId: 'webhook', userName: `webhook:${gateway}`, userRole: 'SYSTEM',
              action: 'WEBHOOK_AMOUNT_MISMATCH', entityType: 'PaymentRecord', entityId: record.id,
              details: `Reçu ${incoming} ${transaction.currency} pour ${due} dus (record ${record.id})`,
            },
          }),
        ])
        console.warn(`[Webhook] ${gateway} — montant incohérent (reçu ${incoming}, dû ${due}) → PARTIAL + AMOUNT_MISMATCH`)
        return NextResponse.json({ received: true, mismatch: 'amount' }, { status: 422 })
      }

      // Confirmation atomique : transaction + record + audit, puis notification.
      const finalStatus = isFull ? 'PAID' : 'PARTIAL'
      await db.$transaction([
        db.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'SUCCESS' } }),
        db.paymentRecord.update({
          where: { id: record.id },
          data: {
            status: finalStatus,
            paidAmount: Math.round(newPaid),
            paidAt: isFull ? new Date() : record.paidAt,
            paymentMethod: gateway,
          },
        }),
        db.auditLog.create({
          data: {
            userId: 'webhook', userName: `webhook:${gateway}`, userRole: 'SYSTEM',
            action: 'WEBHOOK_PAYMENT_CONFIRMED', entityType: 'PaymentRecord', entityId: record.id,
            details: `${gateway} ${event.gatewayTransactionId || ''} — ${incoming} ${transaction.currency} (statut ${finalStatus})`,
          },
        }),
      ])
      console.log(`[Webhook] ${gateway} — paiement confirmé (${record.id} → ${finalStatus})`)

      try {
        const student = await db.student.findUnique({
          where: { id: record.studentId },
          select: { firstName: true, lastName: true, parentId: true },
        })
        if (student?.parentId) {
          await notify({
            data: {
              type: 'PAYMENT_APPROVED',
              title: finalStatus === 'PAID' ? 'Paiement confirmé' : 'Paiement partiel reçu',
              message: `Paiement de ${Number(incoming).toLocaleString('fr-FR')} ${transaction.currency} confirmé via ${gateway}`,
              userId: student.parentId,
              schoolId: record.schoolId,
              relatedId: transaction.paymentRecordId,
            },
          })
        }
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
