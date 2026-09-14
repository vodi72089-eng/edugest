'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { Ban, AlertTriangle, Award } from 'lucide-react'
import { DANGER, WARNING, SUCCESS, GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'
import StatCard from './StatCard'

export default function DisciplineDashboardView() {
  const { userData, userRole, setCurrentView, setDisciplineTab } = useEduGestStore()
  const [stats, setStats] = useState<{ blacklist: number; greylist: number; whitelist: number; totalStudents: number }>({ blacklist: 0, greylist: 0, whitelist: 0, totalStudents: 0 })
  const [loading, setLoading] = useState(true)

  const sectionLevel = userRole === 'DISCIPLINE_MATERNELLE' ? 'MATERNELLE' : userRole === 'DISCIPLINE_PRIMAIRE' ? 'PRIMAIRE' : userRole === 'DISCIPLINE_SECONDAIRE' ? 'SECONDAIRE' : ''

  useEffect(() => {
    function fetchStats() {
      if (!userData?.schoolId) { setLoading(false); return }
      // Fetch all discipline records and count by listType
      authFetch(`/api/discipline?schoolId=${userData.schoolId}&limit=500`)
        .then(r => r.json())
        .then(j => {
          const records = j.data || []
          let blacklist = 0, greylist = 0, whitelist = 0
          for (const r of records) {
            if (r.listType === 'BLACKLIST') blacklist++
            else if (r.listType === 'GREYLIST') greylist++
            else if (r.listType === 'WHITELIST') whitelist++
          }
          setStats({ blacklist, greylist, whitelist, totalStudents: records.length })
          setLoading(false)
        })
        .catch(() => setLoading(false))
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
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Dashboard Discipline</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>Suivi disciplinaire{sectionLevel ? ` — ${sectionLevel}` : ''} · {stats.totalStudents} cas</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <StatCard label="Liste Noire" value={String(stats.blacklist)} icon={<Ban size={16} />} color={DANGER} onClick={() => { setDisciplineTab('BLACKLIST'); setCurrentView('discipline') }} />
        <StatCard label="Liste Grise" value={String(stats.greylist)} icon={<AlertTriangle size={16} />} color={WARNING} onClick={() => { setDisciplineTab('GREYLIST'); setCurrentView('discipline') }} />
        <StatCard label="Liste Blanche" value={String(stats.whitelist)} icon={<Award size={16} />} color={SUCCESS} onClick={() => { setDisciplineTab('WHITELIST'); setCurrentView('discipline') }} />
      </div>
    </div>
  )
}
