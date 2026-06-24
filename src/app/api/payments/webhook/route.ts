import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Webhook secret per gateway (from env)
const WEBHOOK_SECRETS: Record<string, string | undefined> = {
  STRIPE: process.env.STRIPE_WEBHOOK_SECRET,
  DPO: process.env.DPO_WEBHOOK_SECRET,
  PAYPAL: process.env.PAYPAL_WEBHOOK_SECRET,
  FLUTTERWAVE: process.env.FLUTTERWAVE_WEBHOOK_SECRET,
}

// Verify webhook signature (basic implementation)
function verifySignature(
  gateway: string,
  body: string,
  signature: string | null
): boolean {
  if (!signature) return false
  const secret = WEBHOOK_SECRETS[gateway]
  if (!secret) return true // No secret configured — skip verification (dev mode)

  try {
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(body)
    const expected = hmac.digest('hex')
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

// POST /api/payments/webhook
export async function POST(request: NextRequest) {
  try {
    // Detect gateway from query param or header
    const { searchParams } = new URL(request.url)
    const gateway = searchParams.get('gateway')?.toUpperCase() || ''

    if (!gateway || !['STRIPE', 'DPO', 'PAYPAL', 'FLUTTERWAVE'].includes(gateway)) {
      return NextResponse.json({ error: 'Gateway non supporté' }, { status: 400 })
    }

    const rawBody = await request.text()
    const signature = request.headers.get('x-webhook-signature')
      || request.headers.get('stripe-signature')
      || request.headers.get('x-paypal-signature')

    // Verify signature if secret is configured
    if (WEBHOOK_SECRETS[gateway] && !verifySignature(gateway, rawBody, signature)) {
      console.warn(`[Webhook] Invalid signature for ${gateway}`)
      return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
    }

    // Parse gateway-specific payload
    let reference: string | null = null
    let gatewayTransactionId: string | null = null
    let status: string = 'PENDING'
    let amount: number | null = null

    switch (gateway) {
      case 'STRIPE': {
        const event = payload
        const type = event.type as string
        const data = event.data?.object as Record<string, unknown> | undefined
        if (type === 'checkout.session.completed') {
          reference = (data?.metadata?.reference as string) || null
          gatewayTransactionId = data?.payment_intent as string || data?.id as string || null
          status = 'SUCCESS'
          amount = data?.amount_total ? Number(data.amount_total) / 100 : null
        } else if (type === 'payment_intent.payment_failed') {
          reference = (data?.metadata?.reference as string) || null
          gatewayTransactionId = data?.id as string || null
          status = 'FAILED'
        }
        break
      }
      case 'DPO': {
        const data = payload
        reference = data.merchantTransactionId as string || data.transactionId as string || null
        gatewayTransactionId = data.id as string || null
        const resultCode = data.result?.code as string || ''
        if (resultCode.startsWith('000')) status = 'SUCCESS'
        else if (resultCode) status = 'FAILED'
        break
      }
      case 'PAYPAL': {
        const event = payload
        const eventType = event.event_type as string
        const resource = event.resource as Record<string, unknown> | undefined
        reference = resource?.custom_id as string || resource?.invoice_id as string || null
        gatewayTransactionId = resource?.id as string || null
        if (eventType === 'PAYMENT.CAPTURE.COMPLETED') status = 'SUCCESS'
        else if (eventType === 'PAYMENT.CAPTURE.DENIED') status = 'FAILED'
        else status = 'PENDING'
        break
      }
      case 'FLUTTERWAVE': {
        const data = payload.data as Record<string, unknown> | undefined
        reference = data?.tx_ref as string || null
        gatewayTransactionId = data?.id?.toString() || null
        const fwStatus = data?.status as string
        if (fwStatus === 'successful') status = 'SUCCESS'
        else if (fwStatus === 'failed') status = 'FAILED'
        else status = 'PENDING'
        amount = data?.amount ? Number(data.amount) : null
        break
      }
    }

    if (!reference) {
      console.warn(`[Webhook] No reference found in ${gateway} payload`)
      return NextResponse.json({ error: 'Référence manquante' }, { status: 400 })
    }

    // Find the transaction by reference
    const transaction = await db.paymentTransaction.findFirst({
      where: { reference },
    })

    if (!transaction) {
      console.warn(`[Webhook] Transaction not found for reference: ${reference}`)
      return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })
    }

    // Update transaction
    const updatedTransaction = await db.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status,
        gatewayTransactionId: gatewayTransactionId || transaction.gatewayTransactionId,
        gatewayResponse: JSON.stringify(payload),
        completedAt: status === 'SUCCESS' ? new Date() : null,
      },
    })

    // If payment succeeded and linked to a PaymentRecord, update it too
    if (status === 'SUCCESS' && transaction.paymentRecordId) {
      const paidAmount = amount != null
        ? Math.round(amount * 100) // Convert to cents if needed
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

      // Notify parent
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
