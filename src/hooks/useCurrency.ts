'use client'

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import { authFetch, getActiveSchoolId } from '@/lib/store'
import {
  setCurrencyDisplay,
  subscribeCurrency,
  getCurrencyVersion,
  getCurrencyDisplay,
  formatAmount,
} from '@/lib/currency-display'
import { SUPPORTED_CURRENCIES } from '@/lib/exchange-rate'

// Taux de secours CDF → devises (mise à jour Décembre 2024). Servent de fallback
// APPLICATIF dans useCurrency quand le serveur n'a pas de taux CDF adéquats
// (config absente, base USD par défaut, APIs offline) — la conversion n'est
// plus silencieusement ignorée.
const CDF_FALLBACK: Record<string, number> = {
  USD: 0.0004, EUR: 0.00037, CDF: 1, NGN: 0.6, XOF: 0.24, GHS: 0.0048,
  KES: 0.052, ZAR: 0.0072, GBP: 0.00032, CAD: 0.00054,
}

function effectiveRates(cfg: { baseCurrency: string; displayCurrency: string; rates: Record<string, number>; manualRates: Record<string, number> | null; useManualRates: boolean }): Record<string, number> {
  const table = cfg.useManualRates && cfg.manualRates ? cfg.manualRates : cfg.rates
  const target = cfg.displayCurrency
  if (table?.[target] && table[target] > 0) return table
  // Repli CDF (absence de config = monnaie de base implicite CDF).
  if (CDF_FALLBACK[target]) return CDF_FALLBACK
  return {}
}

/**
 * Hook devise — source de vérité UNIQUE : le module currency-display.
 * - Charge la config de l'école (base + affichage + taux) et l'applique au
 *   module (tous les consommateurs de formatAmount se mettent à jour).
 * - Réactif : se re-rend quand setCurrencyDisplay est appelé ailleurs
 *   (chargement global, sauvegarde immédiate depuis Config. Paiements).
 * - L'école active prime : schoolId param > école active (SAG) > undefined.
 */
export function useCurrency(schoolIdParam?: string | null) {
  // Réactivité globale : bump de version à chaque setCurrencyDisplay.
  useSyncExternalStore(subscribeCurrency, getCurrencyVersion, getCurrencyVersion)
  const [loading, setLoading] = useState(false)
  const schoolId = schoolIdParam ?? getActiveSchoolId()

  useEffect(() => {
    if (!schoolId) return
    let cancelled = false
    setLoading(true)
    authFetch(`/api/currency?schoolId=${schoolId}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        const c = j?.data?.config
        if (!c) {
          // Pas de config enregistrée : les montants sont stockés en CDF (FC)
          // mais l'API répond base=USD par défaut → la conversion échouait
          // silencieusement. On impose base=CDF + taux de secours CDF.
          setCurrencyDisplay({
            baseCurrency: 'CDF',
            displayCurrency: 'CDF',
            rates: CDF_FALLBACK,
            manualRates: null,
            useManualRates: false,
          })
          return
        }
        let manual: Record<string, number> | null = null
        const mr = c.manualRates
        if (mr) {
          if (typeof mr === 'string') { try { manual = JSON.parse(mr) } catch { manual = null } }
          else if (typeof mr === 'object') manual = mr
        }
        const baseCurrency = c.baseCurrency || 'CDF'
        // Si la base est CDF, fusionner les taux de secours CDF (certains taux
        // peuvent manquer selon la source) — la conversion ne doit jamais être
        // silencieusement ignorée.
        const serverRates = j?.data?.exchangeRates || {}
        const rates = baseCurrency === 'CDF' ? { ...CDF_FALLBACK, ...serverRates } : serverRates
        setCurrencyDisplay({
          baseCurrency,
          displayCurrency: c.displayCurrency || baseCurrency || 'CDF',
          rates,
          manualRates: manual,
          useManualRates: !!c.useManualRates,
        })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [schoolId])

  // Lecture fraîche du module à chaque rendu (la version bump garantit le re-render)
  const { displayCurrency, baseCurrency, rates } = getCurrencyDisplay()

  // Conversion base → affichage (montants stockés → montants affichés)
  const convert = useCallback((amountBase: number): number => {
    const cfg = getCurrencyDisplay()
    if (!cfg.displayCurrency || cfg.displayCurrency === cfg.baseCurrency) return amountBase
    const table = cfg.useManualRates && cfg.manualRates ? cfg.manualRates : cfg.rates
    const rate = table?.[cfg.displayCurrency]
    if (!rate || !(rate > 0)) return amountBase
    return Math.round(amountBase * rate)
  }, [])

  const format = useCallback((amountBase: number): string => formatAmount(amountBase), [])

  const changeCurrency = useCallback((code: string) => {
    // Bascule locale d'affichage : remplace l'override localStorage (supprimé)
    // par une application immédiate + réactive via le module central.
    const cfg = getCurrencyDisplay()
    setCurrencyDisplay({ ...cfg, displayCurrency: code })
    try { localStorage.removeItem('displayCurrency') } catch { /* noop */ }
  }, [])

  return { displayCurrency, baseCurrency, changeCurrency, convert, format, rates, loading, supportedCurrencies: SUPPORTED_CURRENCIES }
}
