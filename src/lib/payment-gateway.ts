/**
 * Service de passerelles de paiement
 * Mobile : M-Pesa, Orange Money, Airtel Money
 * Agrégateur : Bictorys (Wave, Orange Money, cartes — une seule API)
 * Cartes / internationales : Visa, Mastercard, Flutterwave
 *   (Stripe, PayPal et DPO retirés — non disponibles pour les marchands en RDC)
 * Manuel : espèces, virement
 * Paiements d'abonnement EduGest : passerelles configurées au niveau
 * plateforme (schoolId sentinelle PLATFORM_SCHOOL_ID).
 */

import { db } from '@/lib/db';
import { convertCurrency } from '@/lib/exchange-rate';
import { decryptSecret } from '@/lib/gateway-keys';
import { randomBytes } from 'crypto';

/** École sentinelle : passerelles de paiement de la PLATEFORME (abonnements EduGest) */
export const PLATFORM_SCHOOL_ID = '__PLATFORM__';

export type GatewayType =
  | 'MPESA'
  | 'ORANGE_MONEY'
  | 'AIRTEL_MONEY'
  | 'VISA'
  | 'MASTERCARD'
  | 'FLUTTERWAVE'
  | 'BICTORYS'
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
  /** @deprecated DONNÉES CARTE INTERDITES (PCI-DSS) : Visa/Mastercard passent
   *  uniquement par checkout hébergé. Ces champs sont IGNORÉS s'ils sont
   *  envoyés (défense en profondeur, voir initiate). */
  cardNumber?: string;
  cardExpiryMonth?: string | number;
  cardExpiryYear?: string | number;
  cardCvv?: string;
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
  /** Vrai si AUCUN appel réel n'a eu lieu (simulation mode TEST).
   *  Le frontend DOIT l'afficher (« MODE TEST ») et ne jamais le
   *  présenter comme un paiement réel. */
  testMode?: boolean;
}

export const GATEWAY_INFO: Record<GatewayType, {
  name: string;
  displayName: string;
  description: string;
  supportedCurrencies: string[];
  supportedMethods: string[];
  icon: string;
  /** Logo officiel servi depuis /public/logos/payment */
  logo: string;
  requiresWebhook: boolean;
}> = {
  VISA: {
    name: 'VISA',
    displayName: 'Visa',
    description: 'Cartes bancaires Visa (autorisation de paiement directe)',
    supportedCurrencies: ['USD', 'EUR', 'CDF', 'XOF', 'GBP'],
    supportedMethods: ['card'],
    icon: '💳',
    logo: '/logos/payment/visa.svg',
    requiresWebhook: false,
  },
  MASTERCARD: {
    name: 'MASTERCARD',
    displayName: 'Mastercard',
    description: 'Cartes bancaires Mastercard (passerelle de paiement)',
    supportedCurrencies: ['USD', 'EUR', 'CDF', 'XOF', 'GBP'],
    supportedMethods: ['card'],
    icon: '💳',
    logo: '/logos/payment/mastercard.svg',
    requiresWebhook: false,
  },
  FLUTTERWAVE: {
    name: 'FLUTTERWAVE',
    displayName: 'Flutterwave',
    description: 'Agrégateur africain : carte, transfert, mobile money (V3)',
    supportedCurrencies: ['USD', 'NGN', 'GHS', 'KES', 'XOF', 'CDF', 'ZAR'],
    supportedMethods: ['card', 'mobile_money', 'bank_transfer'],
    icon: '🌊',
    logo: '/logos/payment/flutterwave.png',
    requiresWebhook: true,
  },
  BICTORYS: {
    name: 'BICTORYS',
    displayName: 'Bictorys',
    description: 'Agrégateur sénégalais : Wave, Orange Money, cartes — une seule API',
    supportedCurrencies: ['XOF', 'XAF', 'GNF', 'NGN'],
    supportedMethods: ['mobile_money', 'card'],
    icon: '⚡',
    logo: '/logos/payment/bictorys.svg',
    requiresWebhook: true,
  },
  MPESA: {
    name: 'MPESA',
    displayName: 'M-Pesa',
    description: 'Mobile Money - Safaricom Kenya (STK Push)',
    supportedCurrencies: ['KES', 'USD', 'EUR'],
    supportedMethods: ['mobile_money'],
    icon: '📱',
    logo: '/logos/payment/mpesa.svg',
    requiresWebhook: true,
  },
  ORANGE_MONEY: {
    name: 'ORANGE_MONEY',
    displayName: 'Orange Money',
    description: 'Mobile Money - Orange',
    supportedCurrencies: ['CDF', 'XOF', 'EUR'],
    supportedMethods: ['mobile_money'],
    icon: '🟠',
    logo: '/logos/payment/orange_money.svg',
    requiresWebhook: true,
  },
  AIRTEL_MONEY: {
    name: 'AIRTEL_MONEY',
    displayName: 'Airtel Money',
    description: 'Mobile Money - Airtel',
    supportedCurrencies: ['CDF', 'XOF', 'NGN'],
    supportedMethods: ['mobile_money'],
    icon: '🔴',
    logo: '/logos/payment/airtel_money.svg',
    requiresWebhook: true,
  },
  MANUAL: {
    name: 'MANUAL',
    displayName: 'Paiement Manuel',
    description: 'Espèces, virement bancaire (validation manuelle)',
    supportedCurrencies: ['USD', 'EUR', 'CDF', 'NGN', 'XOF', 'GHS', 'KES', 'ZAR', 'GBP', 'CAD'],
    supportedMethods: ['cash', 'bank_transfer', 'check'],
    icon: '💵',
    logo: '/logos/payment/cash.svg',
    requiresWebhook: false,
  },
};

/**
 * Initier un paiement via la passerelle configurée
 * @param configSchoolId Lire les identifiants depuis une autre école
 *                       (ex: PLATFORM_SCHOOL_ID pour les abonnements EduGest)
 */
export async function initiatePayment(
  gatewayType: GatewayType,
  request: PaymentRequest,
  options?: { configSchoolId?: string }
): Promise<PaymentResponse> {
  const configSchoolId = options?.configSchoolId || request.schoolId;
  const config = await db.paymentGatewayConfig.findUnique({
    where: {
      schoolId_gatewayType: {
        schoolId: configSchoolId,
        gatewayType,
      },
    },
  });

  if (!config || !config.isActive) {
    return {
      success: false,
      reference: '',
      status: 'FAILED',
      message: `La passerelle ${gatewayType} n'est pas configurée ou inactive`,
    };
  }

  const credConfig = {
    ...config,
    apiKey: decryptSecret(config.apiKey),
    secretKey: decryptSecret(config.secretKey),
    webhookSecret: decryptSecret(config.webhookSecret),
  } as any;

  const currencyConfig = await db.schoolCurrencyConfig.findUnique({
    where: { schoolId: request.schoolId },
  });

  const baseCurrency = currencyConfig?.baseCurrency || 'USD';

  let convertedAmount = request.amount;
  if (request.currency !== baseCurrency) {
    try {
      const conversion = await convertCurrency(request.amount, request.currency, baseCurrency);
      convertedAmount = conversion.convertedAmount;
    } catch (error) {
      console.warn('[PaymentGateway] Currency conversion failed:', error);
    }
  }

  // Référence interne unique : préfixe + temps + aléa (jamais tronquée ici ;
  // les limites fournisseur utilisent gatewayReference dédiée côté process).
  const reference = `PAY-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;
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

  try {
    let response: PaymentResponse;

    switch (gatewayType) {
      case 'MPESA':
        response = await processMpesaPayment(credConfig, request, reference);
        break;
      case 'ORANGE_MONEY':
        response = await processOrangeMoneyPayment(credConfig, request, reference);
        break;
      case 'AIRTEL_MONEY':
        response = await processAirtelMoneyPayment(credConfig, request, reference);
        break;
      case 'VISA':
        response = await processVisaPayment(credConfig, request, reference);
        break;
      case 'MASTERCARD':
        response = await processMastercardPayment(credConfig, request, reference);
        break;
      case 'FLUTTERWAVE':
        response = await processFlutterwavePayment(credConfig, request, reference);
        break;
      case 'BICTORYS':
        response = await processBictorysPayment(credConfig, request, reference);
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

// URL publique valide requise en mode live : les webhooks des passerelles
// (Safaricom, Orange, Airtel) doivent pouvoir joindre l'application depuis
// Internet. Une URL localhost/127.0.0.1 est rejetée avec un message clair.
function assertPublicAppUrl(gateway: string, appUrl: string): string | null {
  if (!appUrl) {
    return `NEXT_PUBLIC_APP_URL non configuré — URL de callback ${gateway} invalide (requis en mode live)`;
  }
  try {
    const u = new URL(appUrl);
    if (
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname === '0.0.0.0' ||
      u.hostname === '[::1]' ||
      u.hostname.endsWith('.local')
    ) {
      return `NEXT_PUBLIC_APP_URL vaut « ${appUrl} » — les webhooks ${gateway} ne peuvent pas joindre une URL locale. Configurez l'URL publique de votre serveur (ex: https://votre-domaine.com) dans la variable NEXT_PUBLIC_APP_URL.`;
    }
  } catch { /* URL invalide */ }
  return null;
}

// Nettoie un numéro de téléphone au format international sans « + » ni
// espaces (format attendu par M-Pesa PartyA/PhoneNumber et Airtel msisdn).
function sanitizeMsisdn(phone: string | undefined): string {
  return String(phone || '').replace(/[^0-9]/g, '');
}

// ─── M-Pesa ─────────────────────────────────────────────────────────────────
// Mapping des identifiants (mode live) :
//   merchantId  = Business ShortCode (ex: 174379)
//   apiKey      = Consumer Key (application Safaricom)
//   secretKey   = Consumer Secret (application Safaricom)
//   publicKey   = Passkey « Lipa Na M-Pesa »
async function processMpesaPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  if (config.isTestMode || !config.apiKey) {
    return {
      success: true,
      reference,
      gatewayTransactionId: `MPESA-TEST-${Date.now()}`,
      status: 'PENDING',
      message: 'STK Push simulé — paiement en attente de confirmation',
      testMode: true,
    };
  }

  const baseUrl = 'https://api.safaricom.co.ke';
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const appUrlError = assertPublicAppUrl('M-Pesa', appUrl);
  if (appUrlError) {
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: appUrlError,
    };
  }

  // Identifiants live requis : Shortcode + Consumer Key + Consumer Secret + Passkey
  const missing: string[] = [];
  if (!config.merchantId) missing.push('Merchant ID (Business ShortCode)');
  if (!config.apiKey) missing.push('API Key (Consumer Key)');
  if (!config.secretKey) missing.push('Secret Key (Consumer Secret)');
  if (!config.publicKey) missing.push('Passkey (Lipa Na M-Pesa)');
  if (missing.length > 0) {
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: `Identifiants M-Pesa incomplets — renseignez : ${missing.join(', ')}`,
    };
  }

  const customerMsisdn = sanitizeMsisdn(request.customerPhone);
  if (!customerMsisdn || customerMsisdn.length < 10) {
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: 'Numéro de téléphone du payeur invalide (format international attendu, ex: 2547XXXXXXXX)',
    };
  }

  try {
    // OAuth Safaricom : Consumer Key (apiKey) + Consumer Secret (secretKey)
    const authResponse = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${config.apiKey}:${config.secretKey}`).toString('base64')}`,
      },
    });
    const authData = await authResponse.json();
    if (!authData.access_token) {
      return { success: false, reference, status: 'FAILED', message: 'Échec authentification M-Pesa (vérifiez Consumer Key et Consumer Secret)' };
    }

    // Un seul calcul du timestamp : Password et Timestamp doivent correspondre
    // exactement (YYYYMMDDHHMMSS en heure de Nairobi/EAT, UTC+3).
    // Password = base64(ShortCode + Passkey + Timestamp)
    const timestamp = new Date(Date.now() + 3 * 60 * 60 * 1000)
      .toISOString()
      .replace(/[-T:Z.]/g, '')
      .slice(0, 14);

    const stkResponse = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: config.merchantId,
        Password: Buffer.from(`${config.merchantId}${config.publicKey}${timestamp}`).toString('base64'),
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: request.amount,
        PartyA: customerMsisdn,
        PartyB: config.merchantId,
        PhoneNumber: customerMsisdn,
        CallBackURL: `${appUrl}/api/payments/webhook?gateway=MPESA`,
        AccountReference: reference.slice(0, 12), // limite M-Pesa : 12 caractères
        TransactionDesc: request.description.slice(0, 20), // limite M-Pesa : 20 caractères
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

    return { success: false, reference, status: 'FAILED', message: stkData.errorMessage || stkData.ResponseDescription || 'Échec STK Push M-Pesa' };
  } catch (error) {
    return { success: false, reference, status: 'FAILED', message: error instanceof Error ? error.message : 'Erreur M-Pesa' };
  }
}

// ─── Orange Money ───────────────────────────────────────────────────────────
// Mapping des identifiants (mode live) :
//   merchantId  = Client ID (OAuth)
//   secretKey   = Client Secret (OAuth)
//   apiKey      = Merchant Key (clé marchand du compte Orange Money)
async function processOrangeMoneyPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  if (config.isTestMode || !config.apiKey) {
    return {
      success: true,
      reference,
      gatewayTransactionId: `OM-TEST-${Date.now()}`,
      status: 'PENDING',
      message: 'Paiement Orange Money simulé — en attente de confirmation',
      testMode: true,
    };
  }

  // Environnement : production par défaut en mode live, sandbox si isTestMode
  const baseUrl = config.isTestMode
    ? 'https://api.orange.com/orange-money-webpay/dev/v1'
    : 'https://api.orange.com/orange-money-webpay/v1';
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const appUrlError = assertPublicAppUrl('Orange Money', appUrl);
  if (appUrlError) {
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: appUrlError,
    };
  }

  const missing: string[] = [];
  if (!config.merchantId) missing.push('Merchant ID (Client ID)');
  if (!config.secretKey) missing.push('Secret Key (Client Secret)');
  if (!config.apiKey) missing.push('API Key (Merchant Key)');
  if (missing.length > 0) {
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: `Identifiants Orange Money incomplets — renseignez : ${missing.join(', ')}`,
    };
  }

  try {
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
      return { success: false, reference, status: 'FAILED', message: 'Échec authentification Orange Money (vérifiez Client ID et Client Secret)' };
    }

    const payResponse = await fetch(`${baseUrl}/webpayment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merchant_key: config.apiKey,
        currency: request.currency,
        order_id: reference,
        amount: request.amount,
        return_url: `${appUrl}/?payment=success&ref=${reference}`,
        cancel_url: `${appUrl}/?payment=cancel&ref=${reference}`,
        notif_url: `${appUrl}/api/payments/webhook?gateway=ORANGE_MONEY`,
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
// Mapping des identifiants (mode live) :
//   merchantId  = Client ID (OAuth Airtel)
//   secretKey   = Client Secret (OAuth Airtel)
async function processAirtelMoneyPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  if (config.isTestMode || !config.apiKey) {
    return {
      success: true,
      reference,
      gatewayTransactionId: `AM-TEST-${Date.now()}`,
      status: 'PENDING',
      message: 'Paiement Airtel Money simulé — en attente de confirmation',
      testMode: true,
    };
  }

  // Pays dérivé de la monnaie (Airtel exige l'en-tête X-Country)
  const COUNTRY_BY_CURRENCY: Record<string, string> = {
    CDF: 'CD', KES: 'KE', XOF: 'NE', NGN: 'NG', TZS: 'TZ',
    UGX: 'UG', ZMW: 'ZM', RWF: 'RW', MWK: 'MW', INR: 'IN',
  };
  const country = COUNTRY_BY_CURRENCY[request.currency] || 'CD';

  const baseUrl = 'https://openapi.airtel.africa';

  const missing: string[] = [];
  if (!config.merchantId) missing.push('Merchant ID (Client ID)');
  if (!config.secretKey) missing.push('Secret Key (Client Secret)');
  if (missing.length > 0) {
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: `Identifiants Airtel Money incomplets — renseignez : ${missing.join(', ')}`,
    };
  }

  const customerMsisdn = sanitizeMsisdn(request.customerPhone);

  try {
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
      return { success: false, reference, status: 'FAILED', message: 'Échec authentification Airtel Money (vérifiez Client ID et Client Secret)' };
    }

    const payResponse = await fetch(`${baseUrl}/merchant/v1/payments/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json',
        'X-Country': country,
        'X-Currency': request.currency,
      },
      body: JSON.stringify({
        reference,
        transaction: {
          amount: request.amount,
          country,
          currency: request.currency,
        },
        customer: {
          email: request.customerEmail || '',
          msisdn: customerMsisdn,
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

    return { success: false, reference, status: 'FAILED', message: payData.message || payData.status?.message || 'Erreur Airtel Money' };
  } catch (error) {
    return { success: false, reference, status: 'FAILED', message: error instanceof Error ? error.message : 'Erreur Airtel Money' };
  }
}

// ─── Manuel (espèces, virement) ─────────────────────────────────────────────
// AUCUNE preuve externe : reste TOUJOURS PENDING jusqu'à validation caissier.
// Ne retourne jamais SUCCESS (un succès sans preuve est un faux succès).
async function processManualPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  return {
    success: true,
    reference,
    status: 'PENDING',
    message: 'Demande de paiement manuel enregistrée — en attente de validation par le caissier',
    testMode: false,
  };
}

// ─── Cartes bancaires : helpers communs ─────────────────────────────────────
// Format E.123 compact : supprime espaces/tirets, garde les chiffres.
const compactPan = (pan: string) => String(pan || '').replace(/[^0-9]/g, '');

/** Simulation commune mode TEST pour les paiements carte */
function simulateCardPayment(prefix: string, reference: string): PaymentResponse {
  return {
    success: true,
    reference,
    gatewayTransactionId: `${prefix}-TEST-${Date.now()}`,
    status: 'PENDING',
    message: 'Paiement carte simulé (mode test) — en attente de capture',
    testMode: true,
  };
}

// ─── Visa (Visa Direct / Cybersource REST) ──────────────────────────────────
// Mapping des identifiants (mode live) :
//   merchantId  = Merchant ID (identifiant marchand Cybersource/Visa)
//   apiKey      = User ID (utilisateur REST marchand)
//   secretKey   = Password (secret REST marchand)
//   publicKey   = (optionnel) clé publique / shared secret
async function processVisaPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  if (config.isTestMode || !config.apiKey) {
    return simulateCardPayment('VISA', reference);
  }

  const missing: string[] = [];
  if (!config.merchantId) missing.push('Merchant ID');
  if (!config.apiKey) missing.push('User ID (API)');
  if (!config.secretKey) missing.push('Password (secret API)');
  if (missing.length > 0) {
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: `Identifiants Visa incomplets — renseignez : ${missing.join(', ')}`,
    };
  }

  // PCI-DSS : AUCUN numéro de carte ne transite par nos serveurs.
  // Le paiement carte direct (PAN/CVV) est REFUSÉ : utilisez le checkout
  // hébergé du fournisseur (redirection). Aucune tokenisation disponible
  // côté EduGest à ce jour.
  return {
    success: false,
    reference,
    status: 'FAILED',
    message: 'Paiement carte direct non supporté (sécurité PCI-DSS) — utilisez le checkout hébergé du fournisseur',
  };
}

// ─── Mastercard (Mastercard Payment Gateway Services) ───────────────────────
// Mapping des identifiants (mode live) :
//   merchantId  = Merchant ID (MPGS)
//   apiKey      = User ID (API)
//   secretKey   = Password (API)
// PCI-DSS : voir Visa ci-dessus — pas de PAN sur nos serveurs.
async function processMastercardPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  if (config.isTestMode || !config.apiKey) {
    return simulateCardPayment('MC', reference);
  }

  const missing: string[] = [];
  if (!config.merchantId) missing.push('Merchant ID');
  if (!config.apiKey) missing.push('User ID (API)');
  if (!config.secretKey) missing.push('Password (API)');
  if (missing.length > 0) {
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: `Identifiants Mastercard incomplets — renseignez : ${missing.join(', ')}`,
    };
  }

  // PCI-DSS : AUCUN numéro de carte ne transite par nos serveurs (voir Visa).
  return {
    success: false,
    reference,
    status: 'FAILED',
    message: 'Paiement carte direct non supporté (sécurité PCI-DSS) — utilisez le checkout hébergé du fournisseur',
  };
}

// ─── Flutterwave (V3 standard payment) ──────────────────────────────────────
// Mapping des identifiants (mode live) :
//   secretKey   = SECRET_KEY (FLWSECK-…)
//   publicKey   = PUBLIC_KEY (FLWPUBK-…) — optionnel
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
      status: 'PENDING',
      message: 'Lien de paiement Flutterwave simulé (mode test)',
      testMode: true,
    };
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

  try {
    const response = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: reference,
        amount: request.amount,
        currency: request.currency,
        redirect_url: appUrl ? `${appUrl}/?payment=flutterwave&ref=${reference}` : undefined,
        customer: {
          email: request.customerEmail || 'client@edugest.app',
          name: request.customerName || 'Client EduGest',
          phonenumber: request.customerPhone || undefined,
        },
        customizations: {
          title: 'EduGest',
          description: request.description.slice(0, 100),
        },
      }),
    });
    const data = await response.json();

    if (data.status === 'success' && data.data?.link) {
      return {
        success: true,
        reference,
        gatewayTransactionId: data.data.id ? String(data.data.id) : reference,
        checkoutUrl: data.data.link,
        status: 'PENDING',
        message: 'Lien de paiement Flutterwave généré',
      };
    }

    return { success: false, reference, status: 'FAILED', message: data.message || 'Erreur Flutterwave' };
  } catch (error) {
    return { success: false, reference, status: 'FAILED', message: error instanceof Error ? error.message : 'Erreur Flutterwave' };
  }
}

// ─── Bictorys (agrégateur : Wave, Orange Money, cartes) ────────────────────
// Mapping des identifiants (PaymentGatewayConfig) :
//   apiKey     = clé API PUBLIQUE Bictorys (header X-Api-Key) — obligatoire
//   merchantId = code pays marchand (SN, CI, CM, NG, GN…) — optionnel, défaut SN
//   secretKey  = clé PRIVÉE Bictorys (vérification de transaction) — optionnel
// Sandbox : https://api.test.bictorys.com — Production : https://api.bictorys.com
// Gotchas (spec Afrotools) : errorRedirectUrl en minuscule, redirects https://
//   obligatoires, HTTP 201 = flux direct (redirectUrl), 202 = checkout hébergé
//   (link). Le webhook signé reste la source de vérité.
async function processBictorysPayment(
  config: any,
  request: PaymentRequest,
  reference: string
): Promise<PaymentResponse> {
  if (config.isTestMode || !config.apiKey) {
    return {
      success: true,
      reference,
      gatewayTransactionId: `BCT-TEST-${Date.now()}`,
      status: 'PENDING',
      message: 'Lien de paiement Bictorys simulé (mode test)',
      testMode: true,
    };
  }

  const country = (config.merchantId || 'SN').toUpperCase().slice(0, 2);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const baseUrl = config.isTestMode
    ? 'https://api.test.bictorys.com'
    : 'https://api.bictorys.com';

  const phoneDigits = request.customerPhone
    ? Number(request.customerPhone.replace(/\D/g, ''))
    : undefined;

  try {
    const response = await fetch(`${baseUrl}/pay/v1/charges`, {
      method: 'POST',
      headers: {
        'X-Api-Key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: request.amount,
        currency: request.currency,
        country,
        paymentReference: reference,
        successRedirectUrl: appUrl ? `${appUrl}/?payment=bictorys&ref=${reference}` : undefined,
        errorRedirectUrl: appUrl ? `${appUrl}/?payment=cancel&ref=${reference}` : undefined,
        customerObject: {
          name: request.customerName || 'Client EduGest',
          phone: phoneDigits,
          email: request.customerEmail || undefined,
          country,
        },
      }),
    });

    // 201 = flux direct (mobile money / 3DS), 202 = checkout hébergé Bictorys
    if (response.status === 201 || response.status === 202) {
      const data = await response.json();
      const checkoutUrl = data.redirectUrl || data.link;
      return {
        success: true,
        reference,
        gatewayTransactionId: data.transactionId || data.chargeId || reference,
        checkoutUrl,
        status: 'PENDING',
        message:
          response.status === 201
            ? 'Paiement Bictorys initié — finalisez sur la page opérateur'
            : 'Checkout hébergé Bictorys généré — choisissez votre moyen de paiement',
      };
    }

    const data = await response.json().catch(() => ({}));
    return {
      success: false,
      reference,
      status: 'FAILED',
      message: data.details || data.title || `Erreur Bictorys (HTTP ${response.status})`,
    };
  } catch (error) {
    return { success: false, reference, status: 'FAILED', message: error instanceof Error ? error.message : 'Erreur Bictorys' };
  }
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
