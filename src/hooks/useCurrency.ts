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
        if (!c) return
        let manual: Record<string, number> | null = null
        const mr = c.manualRates
        if (mr) {
          if (typeof mr === 'string') { try { manual = JSON.parse(mr) } catch { manual = null } }
          else if (typeof mr === 'object') manual = mr
        }
        setCurrencyDisplay({
          baseCurrency: c.baseCurrency || 'CDF',
          displayCurrency: c.displayCurrency || c.baseCurrency || 'CDF',
          rates: j?.data?.exchangeRates || {},
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
