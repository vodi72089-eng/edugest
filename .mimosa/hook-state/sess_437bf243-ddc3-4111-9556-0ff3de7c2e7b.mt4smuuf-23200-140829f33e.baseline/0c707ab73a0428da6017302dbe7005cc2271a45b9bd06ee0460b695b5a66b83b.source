import { db } from '@/lib/db';
import {
  requireAuth,
  requirePermission,
  verifySchoolAccess,
  sanitizeError,
} from '@/lib/auth';
import { GATEWAY_INFO, type GatewayType } from '@/lib/payment-gateway';
import { encryptSecret } from '@/lib/gateway-keys';
import { NextRequest, NextResponse } from 'next/server';

// Roles allowed to configure payment gateways for a school
const CONFIG_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'CASHIER'];

// Valid gateway types derived from GATEWAY_INFO
const VALID_GATEWAY_TYPES = Object.keys(GATEWAY_INFO) as GatewayType[];

/**
 * Masks a sensitive string, showing only the last 4 characters.
 * Returns an empty string if the input is null/undefined/empty.
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
    // Helpful indicator for the UI
    hasCredentials: Boolean(
      config.apiKey || config.secretKey || config.merchantId
    ),
  };
}

// GET /api/payment-gateways?schoolId=...
// Returns the catalog of available gateways plus the school's configured gateways.
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || user.schoolId;

    if (!schoolId) {
      return NextResponse.json(
        { error: 'schoolId est requis' },
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

    // Fetch configured gateways for the school
    const configuredGateways = await db.paymentGatewayConfig.findMany({
      where: { schoolId },
      orderBy: [{ isActive: 'desc' }, { gatewayType: 'asc' }],
    });

    // Build the catalog, marking which ones are already configured & active
    const catalog = VALID_GATEWAY_TYPES.map((type) => {
      const info = GATEWAY_INFO[type];
      const configured = configuredGateways.find((g) => g.gatewayType === type);
      return {
        gatewayType: type,
        name: info.name,
        displayName: info.displayName,
        description: info.description,
        supportedCurrencies: info.supportedCurrencies,
        supportedMethods: info.supportedMethods,
        icon: info.icon,
        requiresWebhook: info.requiresWebhook,
        isConfigured: Boolean(configured),
        isActive: configured?.isActive ?? false,
        configId: configured?.id ?? null,
      };
    });

    return NextResponse.json({
      data: {
        catalog,
        configured: configuredGateways.map(sanitizeGatewayConfig),
      },
    });
  } catch (error) {
    console.error('[PaymentGateways] Error listing gateways:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

// POST /api/payment-gateways
// Create or update a payment gateway configuration for a school.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'payments:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // Restrict configuration to allowed roles
    if (!CONFIG_ROLES.includes(user.role)) {
      return NextResponse.json(
        {
          error:
            'Seuls SUPER_ADMIN_GLOBAL, SCHOOL_ADMIN ou CASHIER peuvent configurer les passerelles de paiement',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      schoolId,
      gatewayType,
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

    if (!schoolId || !gatewayType) {
      return NextResponse.json(
        { error: 'Champs requis manquants: schoolId, gatewayType' },
        { status: 400 }
      );
    }

    // Validate gateway type
    if (!VALID_GATEWAY_TYPES.includes(gatewayType)) {
      return NextResponse.json(
        { error: `Type de passerelle invalide: ${gatewayType}` },
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

    // Build the upsert data — only include credential fields that are
    // provided so we don't accidentally blank out credentials during
    // partial updates from the masked GET response.
    const data: Record<string, unknown> = {
      isActive: Boolean(isActive),
      isTestMode: isTestMode !== undefined ? Boolean(isTestMode) : true,
      merchantId: merchantId ?? null,
      publicKey: publicKey ?? null,
      phoneNumber: phoneNumber ?? null,
      accountEmail: accountEmail ?? null,
      currency: currency || 'USD',
      feePercent:
        typeof feePercent === 'number' && !isNaN(feePercent)
          ? feePercent
          : 0,
    };

    // Only overwrite credentials when the caller provides a non-empty value
    // that is not a masked value (e.g. '****' returned by the GET response),
    // otherwise the real keys would be replaced by asterisks.
    const isMaskedValue = (v: string) => /^\*+.{0,4}$/.test(v);
    if (
      apiKey !== undefined && apiKey !== null && apiKey !== '' &&
      !isMaskedValue(apiKey)
    ) {
      data.apiKey = apiKey;
    }
    if (
      secretKey !== undefined && secretKey !== null && secretKey !== '' &&
      !isMaskedValue(secretKey)
    ) {
      data.secretKey = secretKey;
    }
    if (
      webhookSecret !== undefined && webhookSecret !== null && webhookSecret !== '' &&
      !isMaskedValue(webhookSecret)
    ) {
      data.webhookSecret = webhookSecret;
    }
    if (secretKey !== undefined && secretKey !== null && secretKey !== '') {
      data.secretKey = encryptSecret(secretKey);
    }
    if (
      webhookSecret !== undefined &&
      webhookSecret !== null &&
      webhookSecret !== ''
    ) {
      data.webhookSecret = encryptSecret(webhookSecret);
    }

    const config = await db.paymentGatewayConfig.upsert({
      where: {
        schoolId_gatewayType: {
          schoolId,
          gatewayType,
        },
      },
      update: data,
      create: {
        schoolId,
        gatewayType,
        ...(data as any),
      },
    });

    return NextResponse.json(
      {
        data: sanitizeGatewayConfig(config),
        message: 'Configuration de la passerelle enregistrée avec succès',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[PaymentGateways] Error creating gateway config:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
