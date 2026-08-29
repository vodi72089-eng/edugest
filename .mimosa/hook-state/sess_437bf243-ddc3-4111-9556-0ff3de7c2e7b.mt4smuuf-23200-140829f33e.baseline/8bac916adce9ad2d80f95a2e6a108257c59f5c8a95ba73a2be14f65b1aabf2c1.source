/**
 * Service de taux de change utilisant des APIs open source
 * Source principale: exchangerate-api (open source, gratuit, sans clé API)
 * Source de secours: frankfurter.app (Banque Centrale Européenne)
 */

import { db } from '@/lib/db';

const OPEN_SOURCES = [
  {
    name: 'open-er-api',
    url: (base: string) => `https://open.er-api.com/v6/latest/${base}`,
    parse: (data: any) => data.rates,
  },
  {
    name: 'exchangerate-host',
    url: (base: string) => `https://api.exchangerate.host/latest?base=${base}`,
    parse: (data: any) => data.rates,
  },
  {
    name: 'frankfurter',
    url: (base: string) => `https://api.frankfurter.app/latest?from=${base}`,
    parse: (data: any) => data.rates,
  },
];

// Taux de secours si toutes les APIs échouent (mise à jour Décembre 2024)
const FALLBACK_RATES: Record<string, Record<string, number>> = {
  USD: { USD: 1, EUR: 0.92, CDF: 2500, NGN: 1500, XOF: 600, GHS: 12, KES: 130, ZAR: 18, GBP: 0.79, CAD: 1.36 },
  EUR: { USD: 1.09, EUR: 1, CDF: 2720, NGN: 1630, XOF: 655, GHS: 13, KES: 141, ZAR: 19.5, GBP: 0.86, CAD: 1.48 },
  CDF: { USD: 0.0004, EUR: 0.00037, CDF: 1, NGN: 0.6, XOF: 0.24, GHS: 0.0048, KES: 0.052, ZAR: 0.0072, GBP: 0.00032, CAD: 0.00054 },
};

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

export async function fetchExchangeRates(baseCurrency: string = 'USD'): Promise<{
  rates: Record<string, number>;
  source: string;
  fetchedAt: Date;
}> {
  // Essayer chaque source open source
  for (const source of OPEN_SOURCES) {
    try {
      const response = await fetch(source.url(baseCurrency), {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) continue;

      const data = await response.json();
      const rates = source.parse(data);

      if (rates && Object.keys(rates).length > 0) {
        // S'assurer que la monnaie de base est à 1
        rates[baseCurrency] = 1;

        // Sauvegarder en base pour audit
        await saveRatesToDatabase(baseCurrency, rates, source.name);

        return {
          rates,
          source: source.name,
          fetchedAt: new Date(),
        };
      }
    } catch (error) {
      console.warn(`[ExchangeRate] Source ${source.name} failed:`, error);
      continue;
    }
  }

  // Si toutes les APIs échouent, utiliser les taux de secours
  const fallbackRates = FALLBACK_RATES[baseCurrency] || FALLBACK_RATES.USD;

  return {
    rates: fallbackRates,
    source: 'fallback',
    fetchedAt: new Date(),
  };
}

async function saveRatesToDatabase(
  base: string,
  rates: Record<string, number>,
  source: string
) {
  try {
    for (const [target, rate] of Object.entries(rates)) {
      await db.exchangeRate.upsert({
        where: {
          base_target_source: { base, target, source },
        },
        update: {
          rate,
          fetchedAt: new Date(),
        },
        create: {
          base,
          target,
          rate,
          source,
        },
      });
    }
  } catch (error) {
    console.warn('[ExchangeRate] Failed to save rates to database:', error);
  }
}

export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<{ convertedAmount: number; rate: number; source: string }> {
  if (from === to) {
    return { convertedAmount: amount, rate: 1, source: 'same-currency' };
  }

  // Vérifier la base de données d'abord
  const cachedRate = await db.exchangeRate.findUnique({
    where: {
      base_target_source: { base: from, target: to, source: 'frankfurter' },
    },
  });

  let rates: Record<string, number>;
  let source: string;

  // Si cache récent (moins de 6 heures), l'utiliser
  if (cachedRate && (Date.now() - cachedRate.fetchedAt.getTime()) < 6 * 60 * 60 * 1000) {
    rates = { [to]: cachedRate.rate };
    source = 'frankfurter-cached';
  } else {
    // Sinon, récupérer les nouveaux taux
    const result = await fetchExchangeRates(from);
    rates = result.rates;
    source = result.source;
  }

  const rate = rates[to];
  if (!rate) {
    throw new Error(`Taux de change non disponible pour ${from} -> ${to}`);
  }

  return {
    convertedAmount: amount * rate,
    rate,
    source,
  };
}

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
