import { db } from '@/lib/db';
import {
  requireAuth,
  requirePermission,
  verifySchoolAccess,
  sanitizeError,
} from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Masks a sensitive string, showing only the last 4 characters.
 */
function maskSensitive(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

/**
 * Sanitizes a gateway config for safe response by masking sensitive fields.
 */
function sanitizeGatewayConfig(config: any) {
  return {
    id: config.id,
    schoolId: config.schoolId,
    gatewayType: config.gatewayType,
    isActive: config.isActive,
    isTestMode: config.isTestMode,
    merchantId: config.merchantId || null,
    apiKey: maskSensitive(config.apiKey),
    secretKey: maskSensitive(config.secretKey),
    publicKey: config.publicKey || null,
    webhookSecret: maskSensitive(config.webhookSecret),
    phoneNumber: config.phoneNumber || null,
    accountEmail: config.accountEmail || null,
    currency: config.currency,
    feePercent: config.feePercent,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    hasCredentials: Boolean(
      config.apiKey || config.secretKey || config.merchantId
    ),
  };
}

// GET /api/payment-gateways/[id]
// Returns a single gateway configuration with sensitive fields masked.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    const config = await db.paymentGatewayConfig.findUnique({
      where: { id },
    });

    if (!config) {
      return NextResponse.json(
        { error: 'Configuration de passerelle introuvable' },
        { status: 404 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, config.schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    return NextResponse.json({ data: sanitizeGatewayConfig(config) });
  } catch (error) {
    console.error('[PaymentGateways] Error fetching gateway config:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

// PUT /api/payment-gateways/[id]
// Updates a gateway configuration. Only provided fields are updated, and
// credential fields are only overwritten when a non-empty value is supplied
// (preventing the masked GET response from wiping real keys).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'payments:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    const existing = await db.paymentGatewayConfig.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Configuration de passerelle introuvable' },
        { status: 404 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      isActive,
      isTestMode,
      merchantId,
      apiKey,
      secretKey,
      publicKey,
      webhookSecret,
      phoneNumber,
      accountEmail,
      currency,
      feePercent,
    } = body;

    const updateData: Record<string, unknown> = {};

    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (isTestMode !== undefined) updateData.isTestMode = Boolean(isTestMode);
    if (merchantId !== undefined) updateData.merchantId = merchantId || null;
    if (publicKey !== undefined) updateData.publicKey = publicKey || null;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber || null;
    if (accountEmail !== undefined) updateData.accountEmail = accountEmail || null;
    if (currency !== undefined) updateData.currency = currency;

    if (feePercent !== undefined) {
      updateData.feePercent =
        typeof feePercent === 'number' && !isNaN(feePercent) ? feePercent : 0;
    }

    // Only overwrite credentials when a non-empty value is provided.
    // This avoids accidentally blanking keys when the UI sends the masked
    // value back as part of a partial update.
    if (apiKey && apiKey !== '' && !/^\*+.{0,4}$/.test(apiKey)) {
      updateData.apiKey = apiKey;
    }
    if (secretKey && secretKey !== '' && !/^\*+.{0,4}$/.test(secretKey)) {
      updateData.secretKey = secretKey;
    }
    if (
      webhookSecret &&
      webhookSecret !== '' &&
      !/^\*+.{0,4}$/.test(webhookSecret)
    ) {
      updateData.webhookSecret = webhookSecret;
    }

    const config = await db.paymentGatewayConfig.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      data: sanitizeGatewayConfig(config),
      message: 'Configuration mise à jour avec succès',
    });
  } catch (error) {
    console.error('[PaymentGateways] Error updating gateway config:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/payment-gateways/[id]
// Soft-deletes a gateway configuration by deactivating it (isActive = false).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'payments:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    const existing = await db.paymentGatewayConfig.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Configuration de passerelle introuvable' },
        { status: 404 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const config = await db.paymentGatewayConfig.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({
      data: sanitizeGatewayConfig(config),
      message: 'Passerelle désactivée avec succès',
    });
  } catch (error) {
    console.error('[PaymentGateways] Error deactivating gateway config:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
