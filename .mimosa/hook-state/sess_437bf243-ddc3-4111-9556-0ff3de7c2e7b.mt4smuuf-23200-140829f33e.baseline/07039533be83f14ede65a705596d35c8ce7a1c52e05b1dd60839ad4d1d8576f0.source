import { db } from '@/lib/db';
import { requirePermission, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/school-currency?schoolId=xxx — Get currency config for a school
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'school:read');
    if ('error' in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    }

    const config = await db.schoolCurrencyConfig.findUnique({
      where: { schoolId },
    });

    if (!config) {
      // Return defaults if no config exists
      return NextResponse.json({
        data: {
          baseCurrency: 'CDF',
          displayCurrency: 'CDF',
          enabledCurrencies: 'USD,EUR,CDF',
          manualRates: null,
          useManualRates: false,
        },
      });
    }

    return NextResponse.json({ data: config });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
