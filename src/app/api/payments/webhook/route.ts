import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Webhook secret per gateway (from env)
const WEBHOOK_SECRETS: Record<string, string | undefined> = {
  MPESA: process.env.MPESA_WEBHOOK_SECRET,
  ORANGE_MONEY: process.env.ORANGE_MONEY_WEBHOOK_SECRET,
  AIRTEL_MONEY: process.env.AIRTEL_MONEY_WEBHOOK_SECRET,
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function verifySignature(
  gateway: string,
  body: string,
  signature: string | null
): boolean {
  if (!signature) return false
  const secret = WEBHOOK_SECRETS[gateway]
  if (!secret) return true

  try {
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(body)
    const expected = hmac.digest('hex')
    return safeEqual(signature, expected)
  } catch {
    return false
  }
}

// POST /api/payments/webhook
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const gateway = searchParams.get('gateway')?.toUpperCase() || ''

    if (!gateway || !['MPESA', 'ORANGE_MONEY', 'AIRTEL_MONEY'].includes(gateway)) {
      return NextResponse.json({ error: 'Gateway non supporté' }, { status: 400 })
    }

    const rawBody = await request.text()
    const signature = request.headers.get('x-webhook-signature')

    const webhookSecret = WEBHOOK_SECRETS[gateway]
    if (webhookSecret) {
      if (!verifySignature(gateway, rawBody, signature)) {
        console.warn(`[Webhook] Invalid signature for ${gateway}`)
        return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.warn(`[Webhook] Aucun secret configuré pour ${gateway} en production — requête rejetée`)
      return NextResponse.json({ error: 'Webhook non authentifié' }, { status: 401 })
    }

    let payload: Record<string, any>
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
    }

    let reference: string | null = null
    let gatewayTransactionId: string | null = null
    let status: string = 'PENDING'
    let amount: number | null = null

    switch (gateway) {
      case 'MPESA': {
        reference = payload.AccountReference as string || payload.MerchantRequestID as string || null
        gatewayTransactionId = payload.CheckoutRequestID as string || payload.MpesaReceiptNumber as string || null
        const mpesaResult = payload.ResultCode as string || payload.ResultDesc as string || ''
        if (mpesaResult === '0' || mpesaResult.startsWith('0')) status = 'SUCCESS'
        else if (mpesaResult && mpesaResult !== '0') status = 'FAILED'
        amount = payload.Amount ? Number(payload.Amount) : null
        break
      }
      case 'ORANGE_MONEY': {
        reference = payload.order_id as string || payload.txnid as string || null
        gatewayTransactionId = payload.pay_token as string || payload.notif_token as string || null
        const omStatus = payload.status as string
        if (omStatus === 'SUCCESS' || omStatus === 'INITIATED') status = omStatus === 'SUCCESS' ? 'SUCCESS' : 'PENDING'
        else if (omStatus === 'FAILED') status = 'FAILED'
        amount = payload.amount ? Number(payload.amount) : null
        break
      }
      case 'AIRTEL_MONEY': {
        const txData = payload.data?.transaction as Record<string, unknown> | undefined
        reference = payload.data?.reference as string || txData?.transaction_id as string || null
        gatewayTransactionId = txData?.id as string || null
        const amStatus = txData?.status as string || payload.status as string
        if (amStatus === 'success' || amStatus === 'SUCCESS') status = 'SUCCESS'
        else if (amStatus === 'failed' || amStatus === 'FAILED') status = 'FAILED'
        else status = 'PENDING'
        amount = txData?.amount ? Number(txData.amount) : null
        break
      }
    }

    if (!reference) {
      console.warn(`[Webhook] No reference found in ${gateway} payload`)
      return NextResponse.json({ error: 'Référence manquante' }, { status: 400 })
    }

    const transaction = await db.paymentTransaction.findFirst({
      where: { reference },
    })

    if (!transaction) {
      console.warn(`[Webhook] Transaction not found for reference: ${reference}`)
      return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })
    }

    const updatedTransaction = await db.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status,
        gatewayTransactionId: gatewayTransactionId || transaction.gatewayTransactionId,
        gatewayResponse: JSON.stringify(payload),
        completedAt: status === 'SUCCESS' ? new Date() : null,
      },
    })

    if (status === 'SUCCESS' && transaction.paymentRecordId) {
      const paidAmount = amount != null
        ? Math.round(amount * 100)
        : transaction.amount

      await db.paymentRecord.update({
        where: { id: transaction.paymentRecordId },
        data: {
          status: 'PAID',
          paidAmount,
          paidAt: new Date(),
          paymentMethod: gateway.toLowerCase(),
          referenceNumber: gatewayTransactionId || reference,
        },
      })

      try {
        const record = await db.paymentRecord.findUnique({
          where: { id: transaction.paymentRecordId },
          select: { studentId: true, schoolId: true, amount: true, trimester: true },
        })
        if (record) {
          const student = await db.student.findUnique({
            where: { id: record.studentId },
            select: { firstName: true, lastName: true, parentId: true },
          })
          if (student?.parentId) {
            await db.notification.create({
              data: {
                type: 'PAYMENT_APPROVED',
                title: 'Paiement confirmé',
                message: `Paiement de ${Number(record.amount).toLocaleString('fr-FR')} CDF confirmé via ${gateway}`,
                userId: student.parentId,
                schoolId: record.schoolId,
                relatedId: transaction.paymentRecordId,
              },
            })
          }
        }
      } catch { /* non-critical */ }
    }

    console.log(`[Webhook] ${gateway} — Reference: ${reference} — Status: ${status}`)
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
