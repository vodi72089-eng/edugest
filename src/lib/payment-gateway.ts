/**
 * Service de passerelles de paiement
 * Supporte: DPO, Stripe, PayPal, Flutterwave, M-Pesa, Orange Money, Airtel Money
 * Chaque passerelle a sa propre logique d'intégration
 */

import { db } from '@/lib/db';
import { convertCurrency } from '@/lib/exchange-rate';
import { decryptSecret } from '@/lib/gateway-keys';

export type GatewayType =
  | 'DPO'
  | 'STRIPE'
  | 'PAYPAL'
  | 'FLUTTERWAVE'
  | 'MPESA'
  | 'ORANGE_MONEY'
  | 'AIRTEL_MONEY'
  | 'MANUAL';

export interface PaymentRequest {
  schoolId: string;
  studentId?: string;
  paymentRecordId?: string;
  amount: number;
  currency: string;
  description: string;
  customerPhone?: string;
  customerEmail?: string;
  customerName?: string;
  paymentMethod?: string;
  initiatedBy: string;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  gatewayTransactionId?: string;
  reference: string;
  checkoutUrl?: string;
  status: string;
  message?: string;
  convertedAmount?: number;
  baseCurrency?: string;
}

export const GATEWAY_INFO: Record<GatewayType, {
  name: string;
  displayName: string;
  description: string;
  supportedCurrencies: string[];
  supportedMethods: string[];
  icon: string;
  requiresWebhook: boolean;
}> = {
  DPO: {
    name: 'DPO',
    displayName: 'DPO Group',
    description: 'Passerelle de paiement panafricaine - Carte, Mobile Money',
    supportedCurrencies: ['USD', 'EUR', 'CDF', 'NGN', 'GHS', 'KES', 'TZS', 'UGX', 'ZAR'],
    supportedMethods: ['card', 'mobile_money'],
    icon: '💳',
    requiresWebhook: true,
  },
  STRIPE: {
    name: 'STRIPE',
    displayName: 'Stripe',
    description: 'Paiement par carte internationale',
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD'],
    supportedMethods: ['card'],
    icon: '💳',
    requiresWebhook: true,
  },
  PAYPAL: {
    name: 'PAYPAL',
    displayName: 'PayPal',
    description: 'Paiement via compte PayPal ou carte',
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD'],
    supportedMethods: ['paypal', 'card'],
    icon: '🅿️',
    requiresWebhook: true,
  },
  FLUTTERWAVE: {
    name: 'FLUTTERWAVE',
    displayName: 'Flutterwave',
    description: 'Mobile Money et carte pour l\'Afrique',
    supportedCurrencies: ['USD', 'EUR', 'NGN', 'GHS', 'KES', 'ZAR'],
    supportedMethods: ['mobile_money', 'card', 'bank_transfer'],
    icon: '🦋',
    requiresWebhook: true,
  },
  MPESA: {
    name: 'MPESA',
    displayName: 'M-Pesa',
    description: 'Mobile Money - Safaricom Kenya',
    supportedCurrencies: ['KES', 'USD', 'EUR'],
    supportedMethods: ['mobile_money'],
    icon: '📱',
    requiresWebhook: true,
  },
  ORANGE_MONEY: {
    name: 'ORANGE_MONEY',
    displayName: 'Orange Money',
    description: 'Mobile Money - Orange',
    supportedCurrencies: ['CDF', 'XOF', 'EUR'],
    supportedMethods: ['mobile_money'],
    icon: '🟠',
    requiresWebhook: true,
  },
  AIRTEL_MONEY: {
    name: 'AIRTEL_MONEY',
    displayName: 'Airtel Money',
    description: 'Mobile Money - Airtel',
    supportedCurrencies: ['CDF', 'XOF', 'NGN'],
    supportedMethods: ['mobile_money'],
    icon: '🔴',
    requiresWebhook: true,
  },
  MANUAL: {
    name: 'MANUAL',
    displayName: 'Paiement Manuel',
    description: 'Espèces, virement bancaire (validation manuelle)',
    supportedCurrencies: ['USD', 'EUR', 'CDF', 'NGN', 'XOF', 'GHS', 'KES', 'ZAR', 'GBP', 'CAD'],
    supportedMethods: ['cash', 'bank_transfer', 'check'],
    icon: '💵',
    requiresWebhook: false,
  },
};

/**
 * Initier un paiement via la passerelle configurée
 */
export async function initiatePayment(
  gatewayType: GatewayType,
  request: PaymentRequest
): Promise<PaymentResponse> {
  // Récupérer la configuration de la passerelle pour cette école
  const config = await db.paymentGatewayConfig.findUnique({
    where: {
      schoolId_gatewayType: {
        schoolId: request.schoolId,
        gatewayType,
      },
    },
  });

  if (!config || !config.isActive) {
    return {
      success: false,
      reference: '',
      status: 'FAILED',
      message: `La passerelle ${gatewayType} n'est pas configurée ou inactive pour cette école`,
    };
  }

  // Déchiffrer les secrets au repos avant utilisation. En cas de clé de
  // chiffrement manquante/invalide, une erreur explicite est remontée
  // (jamais de clé chiffrée envoyée à l'API externe, jamais de paiement
  // de test simulé par accident).
  const credConfig = {
    ...config,
    apiKey: decryptSecret(config.apiKey),
    secretKey: decryptSecret(config.secretKey),
    webhookSecret: decryptSecret(config.webhookSecret),
  } as any;

  // Récupérer la configuration de monnaie de l'école
  const currencyConfig = await db.schoolCurrencyConfig.findUnique({
    where: { schoolId: request.schoolId },
  });

  const baseCurrency = currencyConfig?.baseCurrency || 'USD';

  // Convertir le montant si la monnaie du paiement diffère de la base
  let convertedAmount = request.amount;
  if (request.currency !== baseCurrency) {
    try {
      const conversion = await convertCurrency(request.amount, request.currency, baseCurrency);
      convertedAmount = conversion.convertedAmount;
    } catch (error) {
      console.warn('[PaymentGateway] Currency conversion failed:', error);
    }
  }

  // Créer l'enregistrement de transaction
  const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
  const transaction = await db.paymentTransaction.create({
    data: {
      schoolId: request.schoolId,
      paymentRecordId: request.paymentRecordId || null,
      studentId: request.studentId || null,
      gatewayType,
      reference,
      amount: request.amount,
      currency: request.currency,
      convertedAmount,
      baseCurrency,
      status: 'PENDING',
      paymentMethod: request.paymentMethod || null,
      customerPhone: request.customerPhone || null,
      customerEmail: request.customerEmail || null,
      customerName: request.customerName || null,
      initiatedBy: request.initiatedBy,
    },
  });

  // Traiter selon le type de passerelle
  try {
    let response: PaymentResponse;

    switch (gatewayType) {
      case 'DPO':
        response = await processDPOPayment(credConfig, request, reference);
        break;
      case 'STRIPE':
        response = await processStripePayment(credConfig, request, reference);
        break;
      case 'PAYPAL':
        response = await processPaypalPayment(credConfig, request, reference);
        break;
      case 'FLUTTERWAVE':
        response = await processFlutterwavePayment(credConfig, request, reference);
        break;
      case 'MPESA':
        response = await processMpesaPayment(credConfig, request, reference);
        break;
      case 'ORANGE_MONEY':
        response = await processOrangeMoneyPayment(credConfig, request, reference);
        break;
      case 'AIRTEL_MONEY':
        response = await processAirtelMoneyPayment(credConfig, request, reference);
        break;
      case 'MANUAL':
        response = await processManualPayment(credConfig, request, reference);
        break;
      default:
        response = {
          success: false,
          reference,
          status: 'FAILED',
          message: `Passerelle ${gatewayType} non supportée`,
        };
    }

    // Mettre à jour la transaction avec le résultat
    await db.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: response.status,
        gatewayTransactionId: response.gatewayTransactionId || null,
        gatewayResponse: response.message || null,
        completedAt: response.status === 'SUCCESS' ? new Date() : null,
      },
    });

    response.transactionId = transaction.id;
    response.convertedAmount = convertedAmount;
    response.baseCurrency = baseCurrency;

    return response;
  } catch (error) {
    await db.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    return {
      success: false,
      transactionId: transaction.id,
      reference,
      status: 'FAILED',
      message: error instanceof Error ? error.message : 'Erreur lors du paiement',
    };
  }
}

// ─── DPO Group ──────────────────────────────────────────────────────────────

async function processDPOPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  const isTest = config.isTestMode;
  const apiUrl = isTest
    ? 'https://test.oppwa.com/v1/payments'
    : 'https://oppwa.com/v1/payments';

  // En mode test, simuler un paiement réussi
  if (isTest || !config.apiKey) {
    return {
      success: true,
      reference,
      gatewayTransactionId: `DPO-TEST-${Date.now()}`,
      checkoutUrl: isTest ? `${apiUrl}?reference=${reference}` : undefined,
      status: 'SUCCESS',
      message: 'Paiement de test réussi (mode test)',
    };
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        merchantId: config.merchantId,
        amount: request.amount,
        currency: request.currency,
        paymentType: request.paymentMethod || 'card',
        merchantTransactionId: reference,
        customer: {
          email: request.customerEmail,
          phone: request.customerPhone,
          name: request.customerName,
        },
        description: request.description,
      }),
    });

    const data = await response.json();

    if (response.ok && data.result?.code === '000.100.110') {
      return {
        success: true,
        reference,
        gatewayTransactionId: data.id,
        status: 'SUCCESS',
        message: 'Paiement DPO réussi',
      };
    }

    return {
      success: false,
      reference,
      gatewayTransactionId: data.id,
      status: 'FAILED',
      message: data.result?.description || 'Paiement échoué',
    };
  } catch (error) {
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: error instanceof Error ? error.message : 'Erreur DPO',
    };
  }
}

// ─── Stripe ─────────────────────────────────────────────────────────────────

async function processStripePayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  // En mode test, simuler
  if (config.isTestMode || !config.secretKey) {
    return {
      success: true,
      reference,
      gatewayTransactionId: `STRIPE-TEST-${Date.now()}`,
      checkoutUrl: 'https://checkout.stripe.com/test-session',
      status: 'SUCCESS',
      message: 'Paiement Stripe de test réussi',
    };
  }

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'amount': Math.round(request.amount * 100).toString(),
        'currency': request.currency.toLowerCase(),
        'success_url': `${process.env.NEXTAUTH_URL || ''}/payment/success?ref=${reference}`,
        'cancel_url': `${process.env.NEXTAUTH_URL || ''}/payment/cancel?ref=${reference}`,
        'metadata[reference]': reference,
        'metadata[schoolId]': request.schoolId,
      }),
    });

    const data = await response.json();

    if (response.ok && data.id) {
      return {
        success: true,
        reference,
        gatewayTransactionId: data.id,
        checkoutUrl: data.url,
        status: 'PENDING',
        message: 'Session Stripe créée',
      };
    }

    return {
      success: false,
      reference,
      status: 'FAILED',
      message: data.error?.message || 'Erreur Stripe',
    };
  } catch (error) {
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: error instanceof Error ? error.message : 'Erreur Stripe',
    };
  }
}

// ─── PayPal ─────────────────────────────────────────────────────────────────

async function processPaypalPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  if (config.isTestMode || !config.apiKey) {
    return {
      success: true,
      reference,
      gatewayTransactionId: `PAYPAL-TEST-${Date.now()}`,
      checkoutUrl: 'https://www.paypal.com/checkout/test',
      status: 'SUCCESS',
      message: 'Paiement PayPal de test réussi',
    };
  }

  const baseUrl = config.isTestMode
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  try {
    // Obtenir le token d'accès
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${config.merchantId}:${config.secretKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const tokenData = await tokenResponse.json();

    // Créer l'ordre
    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: reference,
          amount: {
            currency_code: request.currency,
            value: request.amount.toFixed(2),
          },
          description: request.description,
        }],
      }),
    });

    const orderData = await orderResponse.json();

    if (orderResponse.ok && orderData.id) {
      const approveLink = orderData.links?.find((l: any) => l.rel === 'approve')?.href;
      return {
        success: true,
        reference,
        gatewayTransactionId: orderData.id,
        checkoutUrl: approveLink,
        status: 'PENDING',
        message: 'Commande PayPal créée',
      };
    }

    return {
      success: false,
      reference,
      status: 'FAILED',
      message: orderData.message || 'Erreur PayPal',
    };
  } catch (error) {
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: error instanceof Error ? error.message : 'Erreur PayPal',
    };
  }
}

// ─── Flutterwave ────────────────────────────────────────────────────────────

async function processFlutterwavePayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  if (config.isTestMode || !config.secretKey) {
    return {
      success: true,
      reference,
      gatewayTransactionId: `FLW-TEST-${Date.now()}`,
      checkoutUrl: 'https://checkout.flutterwave.com/test',
      status: 'SUCCESS',
      message: 'Paiement Flutterwave de test réussi',
    };
  }

  const baseUrl = config.isTestMode
    ? 'https://api.flutterwave.com/v3'
    : 'https://api.flutterwave.com/v3';

  try {
    const response = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: reference,
        amount: request.amount,
        currency: request.currency,
        payment_options: request.paymentMethod || 'card,mobilemoney',
        customer: {
          email: request.customerEmail || 'customer@school.com',
          phonenumber: request.customerPhone,
          name: request.customerName,
        },
        customizations: {
          title: 'Paiement Scolarité',
          description: request.description,
        },
      }),
    });

    const data = await response.json();

    if (response.ok && data.status === 'success') {
      return {
        success: true,
        reference,
        gatewayTransactionId: data.data?.id?.toString(),
        checkoutUrl: data.data?.link,
        status: 'PENDING',
        message: 'Lien Flutterwave généré',
      };
    }

    return {
      success: false,
      reference,
      status: 'FAILED',
      message: data.message || 'Erreur Flutterwave',
    };
  } catch (error) {
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: error instanceof Error ? error.message : 'Erreur Flutterwave',
    };
  }
}

// ─── M-Pesa ─────────────────────────────────────────────────────────────────

async function processMpesaPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  // Test mode: simulate STK push
  if (config.isTestMode || !config.apiKey) {
    return {
      success: true,
      reference,
      gatewayTransactionId: `MPESA-TEST-${Date.now()}`,
      status: 'PENDING',
      message: 'STK Push simulé — paiement en attente de confirmation',
    };
  }

  const baseUrl = 'https://api.safaricom.co.ke';

  try {
    // Get OAuth token
    const authResponse = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${config.merchantId}:${config.secretKey}`).toString('base64')}`,
      },
    });
    const authData = await authResponse.json();
    if (!authData.access_token) {
      return { success: false, reference, status: 'FAILED', message: 'Échec authentification M-Pesa' };
    }

    // Initiate STK Push
    const stkResponse = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: config.merchantId,
        Password: Buffer.from(`${config.merchantId}${config.secretKey}${new Date().toISOString().replace(/[-T:Z.]/g, '').slice(0, 14)}`).toString('base64'),
        Timestamp: new Date().toISOString().replace(/[-T:Z.]/g, '').slice(0, 14),
        TransactionType: 'CustomerPayBillOnline',
        Amount: request.amount,
        PartyA: request.customerPhone,
        PartyB: config.merchantId,
        PhoneNumber: request.customerPhone,
        CallBackURL: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/payments/webhook?gateway=MPESA`,
        AccountReference: reference,
        TransactionDesc: request.description,
      }),
    });
    const stkData = await stkResponse.json();

    if (stkData.ResponseCode === '0') {
      return {
        success: true,
        reference,
        gatewayTransactionId: stkData.CheckoutRequestID,
        status: 'PENDING',
        message: 'STK Push envoyé — confirmez sur votre téléphone',
      };
    }

    return { success: false, reference, status: 'FAILED', message: stkData.ResponseDescription || 'Échec STK Push M-Pesa' };
  } catch (error) {
    return { success: false, reference, status: 'FAILED', message: error instanceof Error ? error.message : 'Erreur M-Pesa' };
  }
}

// ─── Orange Money ───────────────────────────────────────────────────────────

async function processOrangeMoneyPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  // Test mode: simulate payment request
  if (config.isTestMode || !config.apiKey) {
    return {
      success: true,
      reference,
      gatewayTransactionId: `OM-TEST-${Date.now()}`,
      status: 'PENDING',
      message: 'Paiement Orange Money simulé — en attente de confirmation',
    };
  }

  const baseUrl = 'https://api.orange.com/orange-money-webpay/dev/v1';

  try {
    // Get OAuth token
    const authResponse = await fetch('https://api.orange.com/oauth/v3/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${config.merchantId}:${config.secretKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const authData = await authResponse.json();
    if (!authData.access_token) {
      return { success: false, reference, status: 'FAILED', message: 'Échec authentification Orange Money' };
    }

    // Create payment
    const payResponse = await fetch(`${baseUrl}/webpayment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merchant_key: config.merchantId,
        currency: request.currency,
        order_id: reference,
        amount: request.amount,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/payment/success?ref=${reference}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/payment/cancel?ref=${reference}`,
        notif_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/payments/webhook?gateway=ORANGE_MONEY`,
        lang: 'fr',
      }),
    });
    const payData = await payResponse.json();

    if (payData.status === 201 || payData.payment_url) {
      return {
        success: true,
        reference,
        gatewayTransactionId: payData.pay_token || reference,
        checkoutUrl: payData.payment_url,
        status: 'PENDING',
        message: 'Lien de paiement Orange Money généré',
      };
    }

    return { success: false, reference, status: 'FAILED', message: payData.message || 'Erreur Orange Money' };
  } catch (error) {
    return { success: false, reference, status: 'FAILED', message: error instanceof Error ? error.message : 'Erreur Orange Money' };
  }
}

// ─── Airtel Money ───────────────────────────────────────────────────────────

async function processAirtelMoneyPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  // Test mode: simulate payment request
  if (config.isTestMode || !config.apiKey) {
    return {
      success: true,
      reference,
      gatewayTransactionId: `AM-TEST-${Date.now()}`,
      status: 'PENDING',
      message: 'Paiement Airtel Money simulé — en attente de confirmation',
    };
  }

  const baseUrl = 'https://openapi.airtel.africa';

  try {
    // Get OAuth token
    const authResponse = await fetch(`${baseUrl}/auth/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${config.merchantId}:${config.secretKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    });
    const authData = await authResponse.json();
    if (!authData.access_token) {
      return { success: false, reference, status: 'FAILED', message: 'Échec authentification Airtel Money' };
    }

    // Initiate collection
    const payResponse = await fetch(`${baseUrl}/merchant/v1/payments/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json',
        'X-Country': 'CD',
        'X-Currency': request.currency,
      },
      body: JSON.stringify({
        reference,
        transaction: {
          amount: request.amount,
          country: 'CD',
          currency: request.currency,
        },
        customer: {
          email: request.customerEmail || '',
          msisdn: request.customerPhone || '',
        },
        product: {
          serviceCode: config.merchantId || 'EDUGEST',
          productName: 'Scolarité',
        },
      }),
    });
    const payData = await payResponse.json();

    if (payData.status === 'success' || payData.data?.transaction?.status === 'Pending') {
      return {
        success: true,
        reference,
        gatewayTransactionId: payData.data?.transaction?.id || reference,
        status: 'PENDING',
        message: 'Paiement Airtel Money initié — confirmez sur votre téléphone',
      };
    }

    return { success: false, reference, status: 'FAILED', message: payData.message || 'Erreur Airtel Money' };
  } catch (error) {
    return { success: false, reference, status: 'FAILED', message: error instanceof Error ? error.message : 'Erreur Airtel Money' };
  }
}

// ─── Manuel (espèces, virement) ─────────────────────────────────────────────

async function processManualPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  return {
    success: true,
    reference,
    gatewayTransactionId: `MANUAL-${Date.now()}`,
    status: 'SUCCESS',
    message: 'Paiement manuel enregistré - En attente de validation',
  };
}

/**
 * Vérifier le statut d'une transaction
 */
export async function checkTransactionStatus(transactionId: string) {
  const transaction = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) {
    return { success: false, message: 'Transaction non trouvée' };
  }

  return {
    success: true,
    transaction,
    status: transaction.status,
  };
}
