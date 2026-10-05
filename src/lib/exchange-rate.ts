/**
 * Service de taux de change utilisant des APIs open source
 * Source principale: exchangerate-api (open source, gratuit, sans clé API)
 * Source de secours: frankfurter.app (Banque Centrale Européenne)
 */

/**
 * Service de taux de change — constantes et utilitaires PURES (safe navigateur).
 *
 * ⚠️ NE JAMAIS importer `@/lib/db` (ni Prisma, ni le driver PG) dans ce
 * fichier : il est importé depuis le bundle client (useCurrency,
 * PaymentsView, OnlinePaymentView). Un tel import embarquait `pg` dans le
 * navigateur, qui exécute `Buffer` → `ReferenceError: Buffer is not
 * defined` → page blanche en production.
 *
 * Appels d'API externes + écritures en base : voir ./exchange-rate-server.
 */

export const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'Dollar Américain', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'CDF', name: 'Franc Congolais', symbol: 'FC' },
  { code: 'NGN', name: 'Naira', symbol: '₦' },
  { code: 'XOF', name: 'Franc CFA', symbol: 'CFA' },
  { code: 'GHS', name: 'Cedi', symbol: '₵' },
  { code: 'KES', name: 'Shilling Kenyan', symbol: 'KSh' },
  { code: 'ZAR', name: 'Rand', symbol: 'R' },
  { code: 'GBP', name: 'Livre Sterling', symbol: '£' },
  { code: 'CAD', name: 'Dollar Canadien', symbol: 'C$' },
];

export function getCurrencySymbol(code: string): string {
  const currency = SUPPORTED_CURRENCIES.find(c => c.code === code);
  return currency?.symbol || code;
}

export function formatCurrency(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  return `${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)} ${symbol}`;
}
