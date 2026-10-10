import { db } from '@/lib/db';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
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

    // ── SÉCURITÉ (IDOR P1, signalé le 26/09 puis resté ouvert) : le schoolId du
    // query n'était jamais confronté à l'utilisateur — tout rôle disposant de
    // school:read (SECRETARY, DIRECTION, CASHIER…) lisait devise de base, devise
    // d'affichage et taux manuels d'une école concurrente.
    // SUPER_ADMIN_GLOBAL conserve l'accès transverse (verifySchoolAccess).
    if (!verifySchoolAccess(authResult.user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
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
