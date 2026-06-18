'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { Ban, AlertTriangle, Award } from 'lucide-react'
import { DANGER, WARNING, SUCCESS, GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'
import StatCard from './StatCard'

export default function DisciplineDashboardView() {
  const { userData, userRole, setCurrentView } = useEduGestStore()
  const [stats, setStats] = useState<{ blacklist: number; greylist: number; whitelist: number; totalStudents: number }>({ blacklist: 0, greylist: 0, whitelist: 0, totalStudents: 0 })
  const [loading, setLoading] = useState(true)

  const sectionLevel = userRole === 'DISCIPLINE_MATERNELLE' ? 'MATERNELLE' : userRole === 'DISCIPLINE_PRIMAIRE' ? 'PRIMAIRE' : userRole === 'DISCIPLINE_SECONDAIRE' ? 'SECONDAIRE' : ''

  useEffect(() => {
    function fetchStats() {
      if (userData?.schoolId) {
        authFetch(`/api/stats?schoolId=${userData.schoolId}`)
          .then(r => r.json())
          .then(j => {
            const disciplineStats = j.data?.discipline as { total: number; blacklist: number; greylist: number; whitelist: number } | undefined
            const studentStats = j.data?.students as { total: number } | undefined
            setStats({
              blacklist: disciplineStats?.blacklist || 0,
              greylist: disciplineStats?.greylist || 0,
              whitelist: disciplineStats?.whitelist || 0,
              totalStudents: studentStats?.total || 0,
            })
            setLoading(false)
          })
          .catch(() => setLoading(false))
      } else {
        setTimeout(() => setLoading(false), 0)
      }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [userData?.schoolId])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Dashboard Discipline</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>Suivi disciplinaire{sectionLevel ? ` — ${sectionLevel}` : ''} · {stats.totalStudents} élèves</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <StatCard label="Liste Noire" value={String(stats.blacklist)} icon={<Ban size={16} />} color={DANGER} onClick={() => setCurrentView('discipline')} />
        <StatCard label="Liste Grise" value={String(stats.greylist)} icon={<AlertTriangle size={16} />} color={WARNING} onClick={() => setCurrentView('discipline')} />
        <StatCard label="Liste Blanche" value={String(stats.whitelist)} icon={<Award size={16} />} color={SUCCESS} onClick={() => setCurrentView('discipline')} />
      </div>
    </div>
  )
}
