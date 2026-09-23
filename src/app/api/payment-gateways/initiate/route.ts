import { db } from '@/lib/db';
import {
  requirePermission,
  verifySchoolAccess,
  sanitizeError,
} from '@/lib/auth';
import {
  initiatePayment,
  GATEWAY_INFO,
  type GatewayType,
} from '@/lib/payment-gateway';
import { NextRequest, NextResponse } from 'next/server';

const VALID_GATEWAY_TYPES = Object.keys(GATEWAY_INFO) as GatewayType[];

// POST /api/payment-gateways/initiate
// Initiates a payment through the specified gateway for a school.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'payments:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const {
      schoolId,
      gatewayType,
      amount,
      currency,
      description,
      studentId,
      paymentRecordId,
      customerPhone,
      customerEmail,
      customerName,
      paymentMethod,
    } = body;

    // PCI-DSS : AUCUNE donnée carte (PAN/CVV) n'est acceptée par cette route.
    // Visa/Mastercard passent uniquement par checkout hébergé (redirection).
    if (
      body.cardNumber !== undefined || body.cardCvv !== undefined ||
      body.cardExpiryMonth !== undefined || body.cardExpiryYear !== undefined
    ) {
      return NextResponse.json(
        { error: 'Données carte refusées (PCI-DSS) — utilisez le checkout hébergé du fournisseur' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!schoolId) {
      return NextResponse.json(
        { error: 'schoolId est requis' },
        { status: 400 }
      );
    }

    if (!gatewayType) {
      return NextResponse.json(
        { error: 'gatewayType est requis' },
        { status: 400 }
      );
    }

    if (!VALID_GATEWAY_TYPES.includes(gatewayType)) {
      return NextResponse.json(
        { error: `Type de passerelle invalide: ${gatewayType}` },
        { status: 400 }
      );
    }

    if (
      amount === undefined || amount === null ||
      isNaN(Number(amount)) || !Number.isFinite(Number(amount))
    ) {
      return NextResponse.json(
        { error: 'Montant invalide' },
        { status: 400 }
      );
    }

    if (Number(amount) <= 0) {
      return NextResponse.json(
        { error: 'Le montant doit être supérieur à 0' },
        { status: 400 }
      );
    }

    if (!description) {
      return NextResponse.json(
        { error: 'description est requis' },
        { status: 400 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Verify an optional paymentRecordId belongs to the target school,
    // and lock the amount to the remaining due (no amount tampering).
    let recordRemaining: number | null = null;
    if (paymentRecordId) {
      const paymentRecord = await db.paymentRecord.findUnique({
        where: { id: paymentRecordId },
        select: { schoolId: true, amount: true, paidAmount: true, status: true },
      });
      if (!paymentRecord || paymentRecord.schoolId !== schoolId) {
        return NextResponse.json(
          { error: 'paymentRecordId invalide pour cette école' },
          { status: 400 }
        );
      }
      if (paymentRecord.status === 'PAID') {
        return NextResponse.json(
          { error: 'Ce paiement est déjà soldé (PAID)' },
          { status: 409 }
        );
      }
      recordRemaining = paymentRecord.amount - paymentRecord.paidAmount;
    }

    // Montant verrouillé au reste dû quand lié à un PaymentRecord existant
    // (pas de modification du montant après initiation).
    if (recordRemaining !== null && Number(amount) > recordRemaining) {
      return NextResponse.json(
        { error: `Montant supérieur au reste dû (${recordRemaining})` },
        { status: 400 }
      );
    }

    // Verify the gateway is configured & active for this school
    const config = await db.paymentGatewayConfig.findUnique({
      where: {
        schoolId_gatewayType: {
          schoolId,
          gatewayType,
        },
      },
    });

    if (!config || !config.isActive) {
      return NextResponse.json(
        {
          error: `La passerelle ${gatewayType} n'est pas configurée ou inactive pour cette école`,
        },
        { status: 400 }
      );
    }

    // Validate currency is supported by the gateway
    const gatewayInfo = GATEWAY_INFO[gatewayType as GatewayType];
    const targetCurrency = currency || config.currency || 'USD';
    if (
      gatewayInfo &&
      gatewayInfo.supportedCurrencies.length > 0 &&
      !gatewayInfo.supportedCurrencies.includes(targetCurrency)
    ) {
      return NextResponse.json(
        {
          error: `La monnaie ${targetCurrency} n'est pas supportée par la passerelle ${gatewayType}. Monnaies supportées: ${gatewayInfo.supportedCurrencies.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Initiate the payment through the gateway library
    const paymentResponse = await initiatePayment(gatewayType as GatewayType, {
      schoolId,
      studentId: studentId || undefined,
      paymentRecordId: paymentRecordId || undefined,
      amount: Number(amount),
      currency: targetCurrency,
      description,
      customerPhone: customerPhone || undefined,
      customerEmail: customerEmail || undefined,
      customerName: customerName || undefined,
      paymentMethod: paymentMethod || undefined,
      initiatedBy: user.id,
    });

    // Codes honnêtes : PENDING = accepté pour traitement (202), jamais 200.
    // SUCCESS direct = 200 (réservé aux flux synchrones confirmés).
    // FAILED = 400. Le champ testMode signale une simulation (MODE TEST).
    const statusCode =
      paymentResponse.status === 'PENDING'
        ? 202
        : paymentResponse.success
          ? 200
          : 400;

    return NextResponse.json(
      {
        data: paymentResponse,
        message: paymentResponse.message,
      },
      { status: statusCode }
    );
  } catch (error) {
    console.error('[PaymentGateways] Error initiating payment:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
