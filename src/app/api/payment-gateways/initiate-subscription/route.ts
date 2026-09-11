import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { initiatePayment } from '@/lib/payment-gateway';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { subscriptionRequestId, gatewayType } = body;

    if (!subscriptionRequestId || !gatewayType) {
      return NextResponse.json(
        { error: 'subscriptionRequestId et gatewayType requis' },
        { status: 400 }
      );
    }

    const subscriptionRequest = await db.subscriptionRequest.findUnique({
      where: { id: subscriptionRequestId },
      include: { school: true },
    });

    if (!subscriptionRequest) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }

    if (subscriptionRequest.schoolId !== user.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const paymentResult = await initiatePayment(gatewayType, {
      schoolId: user.schoolId,
      amount: 0,
      currency: 'USD',
      description: `Abonnement ${subscriptionRequest.requestedTier} — ${subscriptionRequest.school.name}`,
      // Carry the subscription request id so the gateway webhook can resolve it
      // (initiatePayment auto-generates its own PAY-* reference).
      paymentRecordId: subscriptionRequest.id,
      initiatedBy: user.id,
    });

    return NextResponse.json({
      data: paymentResult,
      message: 'Paiement initié',
    });
  } catch (error) {
    console.error('Error initiating subscription payment:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
