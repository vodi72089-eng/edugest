import { db } from '@/lib/db';
import {
  requireAuth,
  requireRole,
  verifySchoolAccess,
  sanitizeError,
} from '@/lib/auth';
import {
  SUPPORTED_CURRENCIES,
  fetchExchangeRates,
  getCurrencySymbol,
} from '@/lib/exchange-rate';
import { NextRequest, NextResponse } from 'next/server';

// Roles allowed to manage currency configuration
const CONFIG_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN'];

// GET /api/currency?schoolId=...
// Returns the school's currency configuration, supported currencies list,
// and the current exchange rates for the school's base currency.
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || user.schoolId;

    if (!schoolId) {
      return NextResponse.json(
        { error: 'schoolId est requis' },
        { status: 400 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Fetch the school's currency config (or defaults if none yet)
    const config = await db.schoolCurrencyConfig.findUnique({
      where: { schoolId },
    });

    const baseCurrency = config?.baseCurrency || 'USD';
    const displayCurrency = config?.displayCurrency || 'USD';
    const enabledCurrencies = config?.enabledCurrencies
      ? config.enabledCurrencies.split(',').filter(Boolean)
      : ['USD', 'EUR', 'CDF'];

    let manualRates: Record<string, number> | null = null;
    if (config?.manualRates) {
      try {
        manualRates = JSON.parse(config.manualRates);
      } catch {
        manualRates = null;
      }
    }

    // Fetch current exchange rates for the base currency.
    // Try DB first to avoid hammering the external API on every request.
    let exchangeRates: Record<string, number> = {};
    let rateSource = 'unknown';
    let ratesFetchedAt: Date | null = null;

    const cachedRates = await db.exchangeRate.findMany({
      where: { base: baseCurrency },
      orderBy: { fetchedAt: 'desc' },
    });

    if (cachedRates.length > 0) {
      // Keep the most recent entry per target/source
      const seen = new Set<string>();
      for (const r of cachedRates) {
        const key = `${r.target}-${r.source}`;
        if (seen.has(key)) continue;
        seen.add(key);
        exchangeRates[r.target] = r.rate;
        if (!ratesFetchedAt || r.fetchedAt > ratesFetchedAt) {
          ratesFetchedAt = r.fetchedAt;
          rateSource = r.source;
        }
      }
    }

    // If no cached rates, attempt to fetch live rates
    if (Object.keys(exchangeRates).length === 0) {
      try {
        const live = await fetchExchangeRates(baseCurrency);
        exchangeRates = live.rates;
        rateSource = live.source;
        ratesFetchedAt = live.fetchedAt;
      } catch (error) {
        console.warn('[Currency] Failed to fetch live rates:', error);
      }
    }

    return NextResponse.json({
      data: {
        config: config
          ? {
              id: config.id,
              schoolId: config.schoolId,
              baseCurrency: config.baseCurrency,
              displayCurrency: config.displayCurrency,
              enabledCurrencies,
              manualRates,
              useManualRates: config.useManualRates,
              lastRateUpdate: config.lastRateUpdate,
              createdAt: config.createdAt,
              updatedAt: config.updatedAt,
            }
          : null,
        supportedCurrencies: SUPPORTED_CURRENCIES,
        exchangeRates,
        rateSource,
        ratesFetchedAt,
        // Convenience for the UI
        baseCurrencySymbol: getCurrencySymbol(baseCurrency),
        displayCurrencySymbol: getCurrencySymbol(displayCurrency),
      },
    });
  } catch (error) {
    console.error('[Currency] Error fetching currency config:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

// POST /api/currency
// Create or update a school's currency configuration.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, CONFIG_ROLES);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const {
      schoolId,
      baseCurrency,
      displayCurrency,
      enabledCurrencies,
      useManualRates,
      manualRates,
    } = body;

    if (!schoolId) {
      return NextResponse.json(
        { error: 'schoolId est requis' },
        { status: 400 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Validate base currency
    const validCodes = SUPPORTED_CURRENCIES.map((c) => c.code);
    if (baseCurrency && !validCodes.includes(baseCurrency)) {
      return NextResponse.json(
        { error: `Monnaie de base invalide: ${baseCurrency}` },
        { status: 400 }
      );
    }

    if (displayCurrency && !validCodes.includes(displayCurrency)) {
      return NextResponse.json(
        { error: `Monnaie d'affichage invalide: ${displayCurrency}` },
        { status: 400 }
      );
    }

    // Normalize enabledCurrencies (array -> CSV string)
    let enabledCurrenciesStr: string | undefined;
    if (enabledCurrencies !== undefined) {
      if (!Array.isArray(enabledCurrencies)) {
        return NextResponse.json(
          { error: 'enabledCurrencies doit être un tableau' },
          { status: 400 }
        );
      }
      const invalid = enabledCurrencies.filter(
        (c: string) => !validCodes.includes(c)
      );
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Monnaies invalides: ${invalid.join(', ')}` },
          { status: 400 }
        );
      }
      enabledCurrenciesStr = enabledCurrencies.join(',');
    }

    // Normalize manualRates (object -> JSON string)
    let manualRatesStr: string | undefined | null;
    if (manualRates !== undefined) {
      if (manualRates === null) {
        manualRatesStr = null;
      } else if (typeof manualRates === 'object') {
        // Validate all values are numbers
        const entries = Object.entries(manualRates);
        for (const [key, value] of entries) {
          if (typeof value !== 'number' || isNaN(value)) {
            return NextResponse.json(
              { error: `Taux manuel invalide pour ${key}` },
              { status: 400 }
            );
          }
        }
        manualRatesStr = JSON.stringify(manualRates);
      } else {
        return NextResponse.json(
          { error: 'manualRates doit être un objet' },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (baseCurrency) updateData.baseCurrency = baseCurrency;
    if (displayCurrency) updateData.displayCurrency = displayCurrency;
    if (enabledCurrenciesStr !== undefined)
      updateData.enabledCurrencies = enabledCurrenciesStr;
    if (useManualRates !== undefined)
      updateData.useManualRates = Boolean(useManualRates);
    if (manualRatesStr !== undefined) updateData.manualRates = manualRatesStr;

    const config = await db.schoolCurrencyConfig.upsert({
      where: { schoolId },
      update: updateData,
      create: {
        schoolId,
        baseCurrency: baseCurrency || 'USD',
        displayCurrency: displayCurrency || 'USD',
        enabledCurrencies: enabledCurrenciesStr || 'USD,EUR,CDF',
        useManualRates: Boolean(useManualRates),
        manualRates: manualRatesStr ?? null,
        ...(updateData as any),
      },
    });

    return NextResponse.json({
      data: {
        id: config.id,
        schoolId: config.schoolId,
        baseCurrency: config.baseCurrency,
        displayCurrency: config.displayCurrency,
        enabledCurrencies: config.enabledCurrencies
          .split(',')
          .filter(Boolean),
        manualRates: config.manualRates
          ? (() => {
              try {
                return JSON.parse(config.manualRates);
              } catch {
                return null;
              }
            })()
          : null,
        useManualRates: config.useManualRates,
        lastRateUpdate: config.lastRateUpdate,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
      message: 'Configuration de monnaie enregistrée avec succès',
    });
  } catch (error) {
    console.error('[Currency] Error saving currency config:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
