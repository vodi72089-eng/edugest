import {
  requireAuth,
  sanitizeError,
} from '@/lib/auth';
import {
  convertCurrency,
  SUPPORTED_CURRENCIES,
  getCurrencySymbol,
} from '@/lib/exchange-rate';
import { NextRequest, NextResponse } from 'next/server';

const VALID_CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code);

// POST /api/currency/convert
// Converts an amount between two currencies using live exchange rates.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;

    const body = await request.json();
    const { amount, from, to } = body;

    // Validate amount
    if (
      amount === undefined || amount === null || amount === '' ||
      isNaN(Number(amount)) || !Number.isFinite(Number(amount))
    ) {
      return NextResponse.json(
        { error: 'Montant invalide' },
        { status: 400 }
      );
    }

    const numericAmount = Number(amount);
    if (numericAmount < 0) {
      return NextResponse.json(
        { error: 'Le montant ne peut pas être négatif' },
        { status: 400 }
      );
    }

    // Validate currencies
    const fromCurrency = (from || '').toString().toUpperCase();
    const toCurrency = (to || '').toString().toUpperCase();

    if (!fromCurrency || !toCurrency) {
      return NextResponse.json(
        { error: 'Les monnaies source (from) et cible (to) sont requises' },
        { status: 400 }
      );
    }

    if (!VALID_CURRENCY_CODES.includes(fromCurrency)) {
      return NextResponse.json(
        { error: `Monnaie source non supportée: ${fromCurrency}` },
        { status: 400 }
      );
    }

    if (!VALID_CURRENCY_CODES.includes(toCurrency)) {
      return NextResponse.json(
        { error: `Monnaie cible non supportée: ${toCurrency}` },
        { status: 400 }
      );
    }

    // Perform conversion
    const result = await convertCurrency(
      numericAmount,
      fromCurrency,
      toCurrency
    );

    return NextResponse.json({
      data: {
        amount: numericAmount,
        from: fromCurrency,
        to: toCurrency,
        convertedAmount: result.convertedAmount,
        rate: result.rate,
        source: result.source,
        fromSymbol: getCurrencySymbol(fromCurrency),
        toSymbol: getCurrencySymbol(toCurrency),
      },
    });
  } catch (error) {
    console.error('[Currency] Error converting currency:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
