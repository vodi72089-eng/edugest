import { requirePermission, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { convertCurrency, fetchExchangeRates, SUPPORTED_CURRENCIES } from '@/lib/exchange-rate';

// GET /api/exchange-rate?from=USD&to=CDF&amount=100 — Convert currency
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'school:read');
    if ('error' in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || 'USD';
    const to = searchParams.get('to') || 'CDF';
    const amount = parseFloat(searchParams.get('amount') || '1');

    if (from === to) {
      return NextResponse.json({
        data: { convertedAmount: amount, rate: 1, source: 'same-currency', from, to },
      });
    }

    const result = await convertCurrency(amount, from, to);

    return NextResponse.json({
      data: { ...result, from, to },
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// GET /api/exchange-rate/rates?base=USD — Get all rates for a base currency
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'school:read');
    if ('error' in authResult) return authResult.error;

    const body = await request.json();
    const { base } = body;

    const result = await fetchExchangeRates(base || 'USD');

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
