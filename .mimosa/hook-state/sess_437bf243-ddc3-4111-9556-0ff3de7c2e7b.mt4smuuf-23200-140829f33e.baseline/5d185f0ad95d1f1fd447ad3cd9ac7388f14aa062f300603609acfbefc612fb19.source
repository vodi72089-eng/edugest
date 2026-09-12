import { db } from '@/lib/db';
import {
  requireAuth,
  requireRole,
  sanitizeError,
} from '@/lib/auth';
import {
  fetchExchangeRates,
  SUPPORTED_CURRENCIES,
} from '@/lib/exchange-rate';
import { NextRequest, NextResponse } from 'next/server';

const CONFIG_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN'];
const VALID_CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code);

// GET /api/currency/exchange-rates?base=USD
// Fetches live exchange rates from open source APIs.
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const base = (searchParams.get('base') || 'USD').toUpperCase();

    if (!VALID_CURRENCY_CODES.includes(base)) {
      return NextResponse.json(
        { error: `Monnaie de base non supportée: ${base}` },
        { status: 400 }
      );
    }

    const result = await fetchExchangeRates(base);

    return NextResponse.json({
      data: {
        base,
        rates: result.rates,
        source: result.source,
        fetchedAt: result.fetchedAt,
        supportedCurrencies: VALID_CURRENCY_CODES,
      },
    });
  } catch (error) {
    console.error('[ExchangeRates] Error fetching rates:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

// POST /api/currency/exchange-rates
// Force refresh exchange rates for a given base currency and persist them
// to the database (the fetchExchangeRates function already upserts rows in
// the ExchangeRate table).
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, CONFIG_ROLES);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json().catch(() => ({}));
    const baseCurrency = (body?.baseCurrency || 'USD').toUpperCase();

    if (!VALID_CURRENCY_CODES.includes(baseCurrency)) {
      return NextResponse.json(
        { error: `Monnaie de base non supportée: ${baseCurrency}` },
        { status: 400 }
      );
    }

    // Force a fresh fetch (saves to DB inside fetchExchangeRates)
    const result = await fetchExchangeRates(baseCurrency);

    // Update the school's lastRateUpdate timestamp if a config exists
    if (user.schoolId) {
      await db.schoolCurrencyConfig
        .update({
          where: { schoolId: user.schoolId },
          data: { lastRateUpdate: new Date() },
        })
        .catch(() => {
          // Silently ignore if no config exists for this school
        });
    }

    return NextResponse.json({
      data: {
        base: baseCurrency,
        rates: result.rates,
        source: result.source,
        fetchedAt: result.fetchedAt,
      },
      message: 'Taux de change rafraîchis avec succès',
    });
  } catch (error) {
    console.error('[ExchangeRates] Error refreshing rates:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
