import { db } from '@/lib/db';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { GATEWAY_INFO, PLATFORM_SCHOOL_ID } from '@/lib/payment-gateway';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/subscription/payment-methods
// Moyens de paiement acceptés par la PLATEFORME pour les abonnements EduGest.
// Les clients (admins d'école) l'utilisent pour savoir s'ils peuvent payer en
// ligne (API de paiement configurée par la plateforme) ou devoir remplir le
// formulaire de paiement manuel.
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;

    const configs = await db.paymentGatewayConfig.findMany({
      where: { schoolId: PLATFORM_SCHOOL_ID, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    const methods = configs
      .filter((c) => c.gatewayType !== 'MANUAL') // le manuel n'est pas un paiement en ligne
      .map((c) => {
        const info = GATEWAY_INFO[c.gatewayType as keyof typeof GATEWAY_INFO];
        return {
          gatewayType: c.gatewayType,
          displayName: info?.displayName || c.gatewayType,
          logo: info?.logo || null,
          icon: info?.icon || '💳',
          currency: c.currency || 'USD',
          isTestMode: c.isTestMode,
          // Instructions visibles du client (numéro marchand, e-mail marchand…)
          paymentHint: c.phoneNumber || c.accountEmail || c.merchantId || null,
        };
      });

    return NextResponse.json({
      data: {
        platformConfigured: methods.length > 0,
        methods,
        message: methods.length > 0
          ? 'Paiement en ligne disponible via les passerelles de la plateforme'
          : 'Aucune API de paiement configurée par la plateforme — utilisez le formulaire de paiement manuel',
      },
    });
  } catch (error) {
    console.error('[SubscriptionPaymentMethods] GET:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
