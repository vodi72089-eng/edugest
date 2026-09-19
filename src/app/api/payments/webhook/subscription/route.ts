import { db } from '@/lib/db';
import { notify } from '@/lib/notify';
import { SUBSCRIPTION_PRICES } from '@/lib/subscription';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// POST /api/payments/webhook/subscription
//
// Confirmation d'un paiement D'ABONNEMENT (plateforme) après preuve réelle.
// Chaîne de confiance STRICTE (cette route marquait PAID sur simple POST) :
//  1. HMAC-SHA256 du corps brut (header x-webhook-signature) avec
//     PLATFORM_WEBHOOK_SECRET. SANS secret configuré → 503 (fail closed,
//     même en dev : définissez PLATFORM_WEBHOOK_SECRET=... pour tester).
//  2. Preuve liée OBLIGATOIRE : paymentTransactionId doit exister avec
//     status SUCCESS (jamais de PAID sur simple déclaration).
//  3. Montant : transaction.amount >= prix de la formule (sinon 422).
//  4. Idempotence : requête non-PENDING → no-op (pas de double activation).
//  5. N'ACTIVE PAS la formule : passe la demande à PAID, l'activation reste
//     du ressort de POST /api/subscription/validate (admin).
function hmacMatches(secret: string, body: string, signature: string): boolean {
  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(body);
    const expected = hmac.digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.PLATFORM_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('[Webhook:subscription] PLATFORM_WEBHOOK_SECRET absent — requête rejetée (définissez-le pour activer cette voie)');
      return NextResponse.json(
        { error: 'Webhook abonnement non configuré (secret manquant)' },
        { status: 503 }
      );
    }

    const rawBody = await request.text();
    const signature = request.headers.get('x-webhook-signature');
    if (!signature || !hmacMatches(secret, rawBody, signature)) {
      console.warn('[Webhook:subscription] signature invalide');
      return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
    }

    let body: Record<string, any>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
    }

    const { subscriptionRequestId, reference, paymentTransactionId, status } = body;

    // Demande : id exact préféré, forme legacy SUB-<id> acceptée.
    let requestId: string | null = subscriptionRequestId || null;
    if (!requestId && typeof reference === 'string') {
      requestId = reference.startsWith('SUB-') ? reference.slice(4) : reference;
    }
    if (!requestId) {
      return NextResponse.json({ error: 'subscriptionRequestId (ou reference) requis' }, { status: 400 });
    }

    const subRequest = await db.subscriptionRequest.findUnique({
      where: { id: requestId },
    });
    if (!subRequest) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }
    if (subRequest.status !== 'PENDING') {
      console.log(`[Webhook:subscription] demande ${requestId} déjà ${subRequest.status} — ignoré (idempotent)`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Preuve : transaction SUCCESS existante et suffisante.
    if (!paymentTransactionId) {
      return NextResponse.json({ error: 'paymentTransactionId requis comme preuve' }, { status: 400 });
    }
    const transaction = await db.paymentTransaction.findUnique({
      where: { id: paymentTransactionId },
    });
    if (!transaction || transaction.status !== 'SUCCESS') {
      return NextResponse.json(
        { error: 'Transaction non confirmée (SUCCESS requis)' },
        { status: 422 }
      );
    }
    const price = SUBSCRIPTION_PRICES[subRequest.requestedTier] ?? null;
    if (price !== null && price > 0 && Number(transaction.amount) + 0.01 < price) {
      await db.auditLog.create({
        data: {
          userId: 'webhook', userName: 'webhook:subscription', userRole: 'SYSTEM',
          action: 'WEBHOOK_SUBSCRIPTION_AMOUNT_MISMATCH', entityType: 'SubscriptionRequest', entityId: subRequest.id,
          details: `Transaction ${transaction.id}: ${transaction.amount} ${transaction.currency} < prix ${price} (${subRequest.requestedTier})`,
        },
      });
      console.warn(`[Webhook:subscription] montant insuffisant (${transaction.amount} < ${price})`);
      return NextResponse.json({ received: true, mismatch: 'amount' }, { status: 422 });
    }

    await db.$transaction([
      db.subscriptionRequest.update({
        where: { id: subRequest.id },
        data: {
          status: 'PAID',
          paymentRef: transaction.gatewayTransactionId || transaction.id,
        },
      }),
      db.auditLog.create({
        data: {
          userId: 'webhook', userName: 'webhook:subscription', userRole: 'SYSTEM',
          action: 'WEBHOOK_SUBSCRIPTION_CONFIRMED', entityType: 'SubscriptionRequest', entityId: subRequest.id,
          details: `Preuve transaction ${transaction.id} (${transaction.gatewayType}) — validation admin requise pour activation`,
        },
      }),
    ]);
    console.log(`[Webhook:subscription] demande ${subRequest.id} → PAID (preuve ${transaction.id})`);

    try {
      const admins = await db.user.findMany({
        where: { role: 'SUPER_ADMIN_GLOBAL', isActive: true },
        select: { id: true },
      });
      await Promise.allSettled(
        admins.map((admin) =>
          notify({
            data: {
              userId: admin.id,
              schoolId: subRequest.schoolId,
              type: 'SUBSCRIPTION_PAID',
              title: 'Abonnement payé (preuve vérifiée)',
              message: `L'école ${subRequest.schoolId} a payé ${subRequest.requestedTier} (transaction ${transaction.gatewayTransactionId || transaction.id}). À valider.`,
            },
          })
        )
      );
    } catch { /* non-critical */ }

    return NextResponse.json({ received: true, status: 'PAID' });
  } catch (error) {
    console.error('[Webhook:subscription] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
