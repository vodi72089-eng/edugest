import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { initiatePayment, PLATFORM_SCHOOL_ID, GATEWAY_INFO, type GatewayType } from '@/lib/payment-gateway';
import { SUBSCRIPTION_PRICES } from '@/lib/subscription';
import { notify } from '@/lib/notify';

// POST /api/payment-gateways/initiate-subscription
// Un client (admin d'école) règle SON abonnement EduGest via une passerelle
// configurée AU NIVEAU PLATEFORME (Visa, M-Pesa, Orange Money…).
//  - API plateforme configurée  → une demande de paiement est générée
//    (transaction passerelle + demande d'abonnement notifiée aux admins).
//  - Aucune API configurée      → 409 { platformConfigured:false } : le client
//    doit utiliser le formulaire de paiement manuel.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.schoolId) {
      return NextResponse.json({ error: 'Aucune école associée à votre compte' }, { status: 400 });
    }

    const body = await request.json();
    const { requestedTier, gatewayType, customerPhone, customerEmail, customerName, notes } = body;

    if (!requestedTier || SUBSCRIPTION_PRICES[requestedTier] === undefined) {
      return NextResponse.json({ error: 'Formule d\'abonnement invalide' }, { status: 400 });
    }
    if (!gatewayType || !GATEWAY_INFO[gatewayType as GatewayType]) {
      return NextResponse.json({ error: 'Moyen de paiement invalide' }, { status: 400 });
    }

    // ── Vérifier que la passerelle demandée est ACTIVE côté plateforme ──────
    const platformConfig = await db.paymentGatewayConfig.findUnique({
      where: {
        schoolId_gatewayType: {
          schoolId: PLATFORM_SCHOOL_ID,
          gatewayType,
        },
      },
    });

    const anyPlatformActive = await db.paymentGatewayConfig.count({
      where: { schoolId: PLATFORM_SCHOOL_ID, isActive: true, gatewayType: { not: 'MANUAL' } },
    });

    if (anyPlatformActive === 0 || !platformConfig || !platformConfig.isActive) {
      return NextResponse.json(
        {
          error: 'Aucune API de paiement en ligne n\'est configurée par la plateforme — utilisez le formulaire de paiement manuel',
          platformConfigured: false,
        },
        { status: 409 }
      );
    }

    const school = await db.school.findUnique({ where: { id: user.schoolId }, select: { name: true } });
    if (!school) {
      return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
    }

    const amount = SUBSCRIPTION_PRICES[requestedTier];
    const currency = platformConfig.currency || 'USD';

    // ── Créer (ou réutiliser) la demande d'abonnement PENDING ───────────────
    let subRequest = await db.subscriptionRequest.findFirst({
      where: { schoolId: user.schoolId, status: 'PENDING' },
    });

    if (subRequest && subRequest.requestedTier !== requestedTier) {
      subRequest = await db.subscriptionRequest.update({
        where: { id: subRequest.id },
        data: {
          requestedTier,
          notes: notes || `Paiement en ligne via ${GATEWAY_INFO[gatewayType as GatewayType].displayName}`,
        },
      });
    } else if (!subRequest) {
      subRequest = await db.subscriptionRequest.create({
        data: {
          schoolId: user.schoolId,
          requestedTier,
          currentTier: await db.school.findUnique({ where: { id: user.schoolId }, select: { subscriptionTier: true } }).then(s => s?.subscriptionTier || 'FREEMIUM'),
          requestedByName: user.name,
          requestedById: user.id,
          notes: notes || `Paiement en ligne via ${GATEWAY_INFO[gatewayType as GatewayType].displayName}`,
        },
      });
    }

    // ── Initier le paiement via la passerelle PLATEFORME ────────────────────
    const paymentResult = await initiatePayment(
      gatewayType as GatewayType,
      {
        schoolId: user.schoolId,
        amount,
        currency,
        description: `Abonnement EduGest ${requestedTier} — ${school.name}`,
        customerPhone,
        customerEmail,
        customerName,
        paymentMethod: 'subscription',
        initiatedBy: user.id,
      },
      { configSchoolId: PLATFORM_SCHOOL_ID }
    );

    // Rattacher la référence de paiement à la demande
    if (paymentResult.reference) {
      await db.subscriptionRequest.update({
        where: { id: subRequest.id },
        data: {
          notes: `${subRequest.notes || ''} — réf: ${paymentResult.reference}`.slice(0, 500),
        },
      });
    }

    // ── Notifier les SUPER_ADMIN_GLOBAL (demande + paiement initié) ─────────
    const superAdmins = await db.user.findMany({
      where: { role: 'SUPER_ADMIN_GLOBAL' },
      select: { id: true },
    });
    for (const admin of superAdmins) {
      await notify({
        data: {
          userId: admin.id,
          schoolId: user.schoolId,
          type: 'SUBSCRIPTION_PAYMENT',
          title: 'Demande d\'abonnement avec paiement en ligne',
          message: `${user.name} (${school.name}) a initié un paiement ${GATEWAY_INFO[gatewayType as GatewayType].displayName} de ${amount}$ pour ${requestedTier}. Réf: ${paymentResult.reference || 'n/a'}`,
          linkTo: 'schools',
          linkId: user.schoolId,
        },
      });
    }

    // Notifier l'école (confirmation d'envoi de la demande)
    await notify({
      data: {
        userId: user.id,
        schoolId: user.schoolId,
        type: 'SUBSCRIPTION_PAYMENT',
        title: 'Demande de paiement envoyée',
        message: `Votre demande d'abonnement ${requestedTier} (${amount}$ via ${GATEWAY_INFO[gatewayType as GatewayType].displayName}) a été transmise à l'administrateur EduGest. Réf: ${paymentResult.reference || 'n/a'}`,
        linkTo: 'my-subscription',
      },
    });

    return NextResponse.json({
      data: {
        payment: paymentResult,
        subscriptionRequest: subRequest,
      },
      message: paymentResult.checkoutUrl
        ? 'Demande de paiement créée — finalisez le paiement via le lien fourni'
        : 'Demande de paiement envoyée — en attente de confirmation',
    });
  } catch (error) {
    console.error('[InitiateSubscription] Error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
