import { db } from '@/lib/db';
import { notify } from '@/lib/notify';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reference, status, transactionId } = body;

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
