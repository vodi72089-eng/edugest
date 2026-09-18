import { db } from '@/lib/db';
import { notify } from '@/lib/notify';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // ── SÉCURITÉ (P0) : ce webhook était totalement ouvert — n'importe qui
    // pouvait marquer une demande d'abonnement PAID en POSTant anonymement.
    // Signature HMAC-SHA256 obligatoire (header x-webhook-signature) dès lors
    // que SUBSCRIPTION_WEBHOOK_SECRET est configuré ; refusé en production
    // si aucun secret n'est défini (comme /api/payments/webhook).
    const secret = process.env.SUBSCRIPTION_WEBHOOK_SECRET;
    const signature = request.headers.get('x-webhook-signature');
    if (secret) {
      if (!signature) {
        return NextResponse.json({ error: 'Signature requise' }, { status: 401 });
      }
      try {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(rawBody);
        if (!safeEqual(signature, hmac.digest('hex'))) {
          console.warn('[SubscriptionWebhook] Signature invalide');
          return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
        }
      } catch {
        return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('[SubscriptionWebhook] Aucun SUBSCRIPTION_WEBHOOK_SECRET configuré — requête rejetée');
      return NextResponse.json({ error: 'Webhook non authentifié' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
    }
    const { reference, status, transactionId } = body as { reference?: string; status?: string; transactionId?: string };

    if (!reference || !status) {
      return NextResponse.json(
        { error: 'reference et status requis' },
        { status: 400 }
      );
    }

    // Resolve the subscription request: either the reference embeds the id
    // (legacy "SUB-<id>" form) or the referenced payment transaction carries it
    // in paymentRecordId (set by /api/payment-gateways/initiate-subscription).
    const subscriptionRequestId = reference.replace('SUB-', '');

    let subscriptionRequest = await db.subscriptionRequest.findUnique({
      where: { id: subscriptionRequestId },
    });

    if (!subscriptionRequest) {
      const transaction = await db.paymentTransaction.findFirst({
        where: { reference },
        orderBy: { initiatedAt: 'desc' },
      });
      if (transaction?.paymentRecordId) {
        subscriptionRequest = await db.subscriptionRequest.findUnique({
          where: { id: transaction.paymentRecordId },
        });
      }
    }

    if (!subscriptionRequest) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }

    if (status === 'SUCCESS' || status === 'COMPLETED') {
      await db.subscriptionRequest.update({
        where: { id: subscriptionRequest.id },
        data: {
          status: 'PAID',
          paymentRef: transactionId,
        },
      });

      const superAdmins = await db.user.findMany({
        where: { role: 'SUPER_ADMIN_GLOBAL' },
      });

      for (const admin of superAdmins) {
        await notify({
          data: {
            type: 'SUBSCRIPTION_PAYMENT',
            title: 'Paiement d\'abonnement reçu',
            message: `Un paiement a été reçu pour l'école ${subscriptionRequest.schoolId}. En attente de validation.`,
            userId: admin.id,
          },
        });
      }

      return NextResponse.json({ message: 'Paiement enregistré' });
    }

    return NextResponse.json({ message: 'Statut non traité' });
  } catch (error) {
    console.error('Error processing subscription webhook:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
