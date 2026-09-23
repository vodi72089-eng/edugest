/**
 * URLs d'API OFFICIELLES par passerelle de paiement — SANS dépendances serveur
 * (importable depuis les composants client ; NE PAS importer @/lib/db ici).
 *
 * Affichées dans le modal de configuration (Paramètres → Paiements →
 * Passerelles) pour que l'administrateur sache exactement :
 *  1. quelle URL EduGest appelle réellement (base API, prod + sandbox —
 *     valeurs reflétées du code d'initiation de src/lib/payment-gateway.ts) ;
 *  2. sur quel portail créer un compte marchand et récupérer ses clés API ;
 *  3. où trouver la documentation développeur.
 *
 * `null` pour les passerelles sans API directe : Visa/Mastercard passent
 * uniquement par le checkout hébergé Flutterwave/Bictorys (PCI-DSS) ;
 * MANUAL = espèces/virement validés par le caissier.
 */
export interface GatewayApiInfo {
  /** URL de base de l'API de production (celle qu'EduGest appelle en live) */
  apiBase: string | null;
  /** URL de base de l'API sandbox (mode test), si distincte */
  sandboxBase?: string | null;
  /** Portail marchand où créer un compte et récupérer les clés API */
  dashboardUrl: string | null;
  /** Documentation développeur */
  docsUrl: string | null;
  /** Étapes concrètes pour obtenir les identifiants à saisir dans EduGest */
  keysHint: string | null;
}

export type GatewayApiInfoMap = Record<string, GatewayApiInfo>;

export const GATEWAY_API_INFO: GatewayApiInfoMap = {
  MPESA: {
    apiBase: 'https://api.safaricom.co.ke',
    sandboxBase: null, // Daraja sandbox : https://sandbox.safaricom.co.ke (identifiants dédiés)
    dashboardUrl: 'https://developer.safaricom.co.ke',
    docsUrl: 'https://developer.safaricom.co.ke/APIs',
    keysHint: "Créez une application sur le portail Daraja → « My Apps » pour obtenir la Consumer Key et le Consumer Secret, puis récupérez votre Business ShortCode (Lipa Na M-Pesa). En mode test, remplacez api.safaricom.co.ke par sandbox.safaricom.co.ke avec les identifiants de l'app sandbox.",
  },
  ORANGE_MONEY: {
    apiBase: 'https://api.orange.com/orange-money-webpay/v1',
    sandboxBase: 'https://api.orange.com/orange-money-webpay/dev/v1',
    dashboardUrl: 'https://developer.orange.com/myapps',
    docsUrl: 'https://developer.orange.com/orange-money-webpay',
    keysHint: "Sur developer.orange.com → « My Apps », créez une application avec le produit « Orange Money Web Pay » : vous obtenez le Client ID et le Client Secret (jeton OAuth : https://api.orange.com/oauth/v3/token). La Merchant Key vous est fournie par Orange après validation du contrat marchand.",
  },
  AIRTEL_MONEY: {
    apiBase: 'https://openapi.airtel.africa',
    sandboxBase: null,
    dashboardUrl: 'https://developers.airtel.africa',
    docsUrl: 'https://developers.airtel.africa/documentation',
    keysHint: "Créez un compte sur le portail Airtel Open API → « My Apps » : Client ID + Client Secret. Le champ Merchant ID reçoit l'identifiant de marché (pays/devise) fourni par Airtel.",
  },
  VISA: {
    apiBase: null,
    dashboardUrl: null,
    docsUrl: null,
    keysHint: "Les cartes Visa ne sont pas acceptées en direct (PCI-DSS) : elles passent par le checkout hébergé Flutterwave ou Bictorys. Configurez l'une de ces deux passerelles.",
  },
  MASTERCARD: {
    apiBase: null,
    dashboardUrl: null,
    docsUrl: null,
    keysHint: "Les cartes Mastercard ne sont pas acceptées en direct (PCI-DSS) : elles passent par le checkout hébergé Flutterwave ou Bictorys. Configurez l'une de ces deux passerelles.",
  },
  FLUTTERWAVE: {
    apiBase: 'https://api.flutterwave.com/v3',
    sandboxBase: null, // Sandbox Flutterwave = mêmes URLs avec les clés de test du dashboard
    dashboardUrl: 'https://dashboard.flutterwave.com',
    docsUrl: 'https://developer.flutterwave.com/docs',
    keysHint: "Dashboard Flutterwave → « Settings » → « API » : copiez la Secret Key et la Public Key (onglet Test pour le mode test). Le champ Merchant ID reçoit l'Encryption Key. Ajoutez l'URL de webhook dans les réglages webhook du dashboard.",
  },
  BICTORYS: {
    apiBase: 'https://api.bictorys.com',
    sandboxBase: 'https://api.test.bictorys.com',
    dashboardUrl: 'https://dashboard.bictorys.com',
    docsUrl: 'https://docs.bictorys.com',
    keysHint: "Dashboard Bictorys → « API » : créez une clé API (App ID / App Key). Le mode test utilise automatiquement api.test.bictorys.com. Configurez ensuite l'URL de webhook dans le dashboard.",
  },
  MANUAL: {
    apiBase: null,
    dashboardUrl: null,
    docsUrl: null,
    keysHint: null,
  },
};
