import { db } from '@/lib/db';
import { requireRole, sanitizeError } from '@/lib/auth';
import { GATEWAY_INFO, PLATFORM_SCHOOL_ID, type GatewayType } from '@/lib/payment-gateway';
import { encryptSecret } from '@/lib/gateway-keys';
import { NextRequest, NextResponse } from 'next/server';

// ─── Configuration des passerelles de paiement de la PLATEFORME ─────────────
// Les abonnements EduGest sont payés via CES passerelles (et non celles des
// écoles, qui servent à encaisser les frais de scolarité).
// Stockage : PaymentGatewayConfig avec la sentinelle schoolId = '__PLATFORM__'.

const VALID_GATEWAY_TYPES = Object.keys(GATEWAY_INFO) as GatewayType[];

function maskSensitive(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

function sanitizeGatewayConfig(config: any) {
  return {
    id: config.id,
    schoolId: '__PLATFORM__',
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
    hasCredentials: Boolean(config.apiKey || config.secretKey || config.merchantId),
  };
}

// GET /api/platform-payment-gateways — SUPER_ADMIN_GLOBAL uniquement
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const configs = await db.paymentGatewayConfig.findMany({
      where: { schoolId: PLATFORM_SCHOOL_ID },
      orderBy: { gatewayType: 'asc' },
    });

    const catalog = VALID_GATEWAY_TYPES.map((type) => {
      const info = GATEWAY_INFO[type];
      const configured = configs.find((g) => g.gatewayType === type);
      return {
        gatewayType: type,
        displayName: info.displayName,
        description: info.description,
        supportedCurrencies: info.supportedCurrencies,
        supportedMethods: info.supportedMethods,
        icon: info.icon,
        logo: info.logo,
        requiresWebhook: info.requiresWebhook,
        configured: Boolean(configured),
        isActive: configured?.isActive || false,
        isTestMode: configured?.isTestMode ?? true,
        hasCredentials: Boolean(
          configured && (configured.apiKey || configured.secretKey || configured.merchantId)
        ),
      };
    });

    return NextResponse.json({
      data: {
        catalog,
        configured: configs.map(sanitizeGatewayConfig),
      },
    });
  } catch (error) {
    console.error('[PlatformGateways] GET:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// POST /api/platform-payment-gateways — SUPER_ADMIN_GLOBAL uniquement
// Body : { gatewayType, isActive?, isTestMode?, merchantId?, apiKey?, secretKey?, publicKey?, phoneNumber?, accountEmail?, currency?, feePercent? }
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { gatewayType } = body;

    if (!gatewayType || !VALID_GATEWAY_TYPES.includes(gatewayType)) {
      return NextResponse.json(
        { error: `Type de passerelle invalide: ${gatewayType}` },
        { status: 400 }
      );
    }

    // Secrets chiffrés : vide = conserver la valeur existante
    const existing = await db.paymentGatewayConfig.findUnique({
      where: {
        schoolId_gatewayType: {
          schoolId: PLATFORM_SCHOOL_ID,
          gatewayType,
        },
      },
    });

    const encryptIfProvided = (value: string | undefined, existingValue: string | null): string | null => {
      if (value === undefined || value === '') return existingValue;
      return encryptSecret(value);
    };

    const data = {
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing?.isActive ?? false,
      isTestMode: body.isTestMode !== undefined ? Boolean(body.isTestMode) : existing?.isTestMode ?? true,
      merchantId: body.merchantId !== undefined ? body.merchantId || null : existing?.merchantId ?? null,
      apiKey: encryptIfProvided(body.apiKey, existing?.apiKey || null),
      secretKey: encryptIfProvided(body.secretKey, existing?.secretKey || null),
      publicKey: body.publicKey !== undefined ? body.publicKey || null : existing?.publicKey ?? null,
      webhookSecret: encryptIfProvided(body.webhookSecret, existing?.webhookSecret || null),
      phoneNumber: body.phoneNumber !== undefined ? body.phoneNumber || null : existing?.phoneNumber ?? null,
      accountEmail: body.accountEmail !== undefined ? body.accountEmail || null : existing?.accountEmail ?? null,
      currency: body.currency || existing?.currency || 'USD',
      feePercent: body.feePercent !== undefined ? Number(body.feePercent) : existing?.feePercent ?? 0,
    };

    const config = await db.paymentGatewayConfig.upsert({
      where: {
        schoolId_gatewayType: {
          schoolId: PLATFORM_SCHOOL_ID,
          gatewayType,
        },
      },
      create: { schoolId: PLATFORM_SCHOOL_ID, gatewayType, ...data },
      update: data,
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'PLATFORM_GATEWAY_UPDATED',
        entityType: 'PaymentGatewayConfig',
        entityId: config.id,
        details: `Passerelle plateforme ${gatewayType} — active: ${config.isActive}, test: ${config.isTestMode}`,
      },
    });

    return NextResponse.json({
      data: sanitizeGatewayConfig(config),
      message: `Passerelle ${GATEWAY_INFO[gatewayType as GatewayType].displayName} ${config.isActive ? 'activée' : 'désactivée'} pour la plateforme`,
    });
  } catch (error) {
    console.error('[PlatformGateways] POST:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
