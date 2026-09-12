'use client'

import { useState, useEffect, useCallback } from 'react'
import { authFetch } from '@/lib/store'
import { SUPPORTED_CURRENCIES } from '@/lib/exchange-rate'

export function useCurrency(schoolId?: string) {
  const [displayCurrency, setDisplayCurrency] = useState<string>('CDF')
  const [rates, setRates] = useState<Record<string, number>>({ CDF: 1 })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('displayCurrency')
    if (saved) setDisplayCurrency(saved)
  }, [])

  useEffect(() => {
    if (!schoolId) return
    setLoading(true)
    authFetch(`/api/currency?schoolId=${schoolId}`)
      .then(r => r.json())
      .then(j => {
        if (j.data?.exchangeRates) {
          setRates(j.data.exchangeRates)
        }
        if (j.data?.config?.displayCurrency) {
          setDisplayCurrency(j.data.config.displayCurrency)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [schoolId])

  const changeCurrency = useCallback((code: string) => {
    setDisplayCurrency(code)
    localStorage.setItem('displayCurrency', code)
  }, [])

  const convert = useCallback((amountCdf: number): number => {
    if (displayCurrency === 'CDF') return amountCdf
    const targetRate = rates[displayCurrency]
    const cdfRate = rates.CDF
    if (!targetRate || !cdfRate) return amountCdf
    return Math.round(amountCdf * (targetRate / cdfRate))
  }, [displayCurrency, rates])

  const format = useCallback((amountCdf: number): string => {
    const converted = convert(amountCdf)
    const currency = SUPPORTED_CURRENCIES.find(c => c.code === displayCurrency)
    const symbol = currency?.symbol || displayCurrency
    return `${converted.toLocaleString('fr-FR')} ${symbol}`
  }, [convert, displayCurrency])

  return { displayCurrency, changeCurrency, convert, format, rates, loading, supportedCurrencies: SUPPORTED_CURRENCIES }
}
