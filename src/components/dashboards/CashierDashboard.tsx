'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { DollarSign, Wallet, TrendingUp, AlertTriangle, CreditCard } from 'lucide-react'
import { ACCENT, SUCCESS, WARNING, DANGER, INFO, GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'
import { formatCurrency } from '@/lib/helpers'
import { useCurrency } from '@/hooks/useCurrency'
import StatCard from './StatCard'

export default function CashierDashboard() {
  const { userData, setCurrentView } = useEduGestStore()
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)
  const { displayCurrency, changeCurrency, format: fmt, supportedCurrencies } = useCurrency(userData?.schoolId)

  useEffect(() => {
    function fetchStats() {
      if (userData?.schoolId) {
        authFetch(`/api/stats?schoolId=${userData.schoolId}`).then(r => r.json()).then(j => setStats(j.data)).catch(() => {})
      }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [userData?.schoolId])

  const paymentStats = stats?.payments as { total: number; paid: number; pending: number; partial: number; overdue: number; expectedAmount: number; collectedAmount: number; collectionRate: number } | undefined
  const totalStudents = (stats?.students as Record<string, number>)?.total || 0
  const classDist = (stats?.classes as Record<string, unknown>)?.distribution as { name: string; _count: { students: number } }[] | undefined

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Bonjour {userData?.name || 'Caissier'}</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>Suivi financier — {userData?.schoolName || 'École'}</p>
        </div>
        <select
          value={displayCurrency}
          onChange={(e) => changeCurrency(e.target.value)}
          className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
          style={{ color: TEXT_PRIMARY }}
        >
          {supportedCurrencies.map(c => (
            <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        <StatCard label="Total encaissé" value={fmt(paymentStats?.collectedAmount || 0)} icon={<DollarSign size={16} />} color={ACCENT} onClick={() => setCurrentView('payments')} />
        <StatCard label="Montant attendu" value={fmt(paymentStats?.expectedAmount || 0)} icon={<Wallet size={16} />} color={INFO} onClick={() => setCurrentView('payments')} />
        <StatCard label="Taux recouvrement" value={`${paymentStats?.collectionRate?.toFixed(0) || 0}%`} icon={<TrendingUp size={16} />} color={SUCCESS} onClick={() => setCurrentView('payments')} />
        <StatCard label="Impayés" value={String(paymentStats?.overdue || 0)} delta={`${paymentStats?.pending || 0} en attente`} icon={<AlertTriangle size={16} />} color={DANGER} onClick={() => setCurrentView('payments')} />
      </div>

      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
        <div className="mb-4">
          <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Résumé des paiements</div>
          <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>{totalStudents} élèves · {paymentStats?.paid || 0} payés · {paymentStats?.partial || 0} partiels · {paymentStats?.overdue || 0} impayés</div>
        </div>
            {classDist && classDist.length > 0 ? (
          <div className="space-y-3">
            {classDist.map(c => {
              const occupancy = totalStudents > 0 ? (c._count.students / totalStudents) * 100 : 0
              return (
                <div key={c.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium" style={{ color: TEXT_PRIMARY }}>{c.name}</span>
                    <span style={{ color: TEXT_MUTED_LUXE }}>{c._count.students} élèves · {occupancy.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-[oklch(92%_0.005_175)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(occupancy, 100)}%`, background: `linear-gradient(90deg, ${ACCENT}, oklch(72% 0.15 65))` }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>
            <CreditCard size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucune donnée de paiement disponible</p>
          </div>
        )}
      </div>
    </div>
  )
}
