'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch, ViewType } from '@/lib/store'
import { Users, School, AlertTriangle, Clock, BarChart3, UserPlus, MessageSquare, CreditCard, Megaphone } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'
import { ACCENT, SUCCESS, WARNING, DANGER, INFO, GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'
import { formatNumber } from '@/lib/helpers'
import StatCard from './StatCard'

export default function SecretaryDashboard() {
  const { setCurrentView, userData } = useEduGestStore()
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function fetchStats() {
      if (userData?.schoolId) {
        authFetch(`/api/stats?schoolId=${userData.schoolId}`).then(r => r.json()).then(j => { setStats(j.data); setLoading(false) }).catch(() => setLoading(false))
      } else {
        setTimeout(() => setLoading(false), 0)
      }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [userData?.schoolId])

  const totalStudents = (stats?.students as Record<string, number>)?.total || 0
  const totalClasses = (stats?.classes as Record<string, unknown>)?.total as number || 0
  const classDist = (stats?.classes as Record<string, unknown>)?.distribution as { name: string; _count: { students: number } }[] | undefined
  const barData = classDist?.map(c => ({ name: c.name, élèves: c._count.students })) || []
  const disciplineStats = stats?.discipline as { total: number; blacklist: number; greylist: number; whitelist: number } | undefined
  const paymentStats = stats?.payments as { total: number; paid: number; pending: number; partial: number; overdue: number; expectedAmount: number; collectedAmount: number; collectionRate: number } | undefined

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Bonjour {userData?.name || 'Secrétaire'}</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>{userData?.schoolName || 'Gestion scolaire'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        <StatCard label="Total élèves" value={formatNumber(totalStudents)} icon={<Users size={16} />} color={ACCENT} />
        <StatCard label="Classes actives" value={String(totalClasses)} icon={<School size={16} />} color={INFO} />
        <StatCard label="Avertissements" value={String(disciplineStats?.greylist || 0)} icon={<AlertTriangle size={16} />} color={WARNING} />
        <StatCard label="Impayés" value={String(paymentStats?.overdue || 0)} icon={<Clock size={16} />} color={DANGER} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6 mb-6">
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
          <div className="mb-4">
            <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Élèves par classe</div>
            <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Année scolaire en cours</div>
          </div>
          {barData.length > 0 ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="2 4" stroke="oklch(90% 0.01 175)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: TEXT_MUTED_LUXE }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: TEXT_MUTED_LUXE }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="élèves" fill={ACCENT} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[240px] flex items-center justify-center" style={{ color: TEXT_MUTED_LUXE }}>
              <div className="text-center">
                <BarChart3 size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Aucune donnée de classe disponible</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
          <div className="mb-4">
            <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Actions rapides</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: <UserPlus size={20} />, label: 'Ajouter élève', view: 'students' as ViewType, color: ACCENT },
              { icon: <MessageSquare size={20} />, label: 'Communication', view: 'communications' as ViewType, color: INFO },
              { icon: <CreditCard size={20} />, label: 'Paiement', view: 'payments' as ViewType, color: SUCCESS },
              { icon: <Megaphone size={20} />, label: 'Convocation', view: 'convocation' as ViewType, color: WARNING },
            ].map(a => (
              <button key={a.label} onClick={() => setCurrentView(a.view)} className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-[oklch(90%_0.01_175)] hover:border-[oklch(72%_0.15_65_/_0.3)] hover:shadow-md edu-card-lift transition">
                <div className="w-10 h-10 rounded-full grid place-items-center" style={{ color: 'white', background: `linear-gradient(135deg, ${a.color}, oklch(72% 0.15 65))` }}>{a.icon}</div>
                <span className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
