'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { Ban, AlertTriangle, Award } from 'lucide-react'
import { toast } from 'sonner'
import { DANGER, WARNING, SUCCESS, GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'
import StatCard from './StatCard'

export default function DisciplineDashboardView() {
  const { userData, userRole, setCurrentView, setDisciplineTab } = useEduGestStore()
  const [stats, setStats] = useState<{ blacklist: number; greylist: number; whitelist: number; totalStudents: number }>({ blacklist: 0, greylist: 0, whitelist: 0, totalStudents: 0 })
  const [loading, setLoading] = useState(true)
  // Une erreur de lecture ne doit JAMAIS se présenter comme « 0 infraction ».
  const [loadError, setLoadError] = useState(false)

  const sectionLevel = userRole === 'DISCIPLINE_MATERNELLE' ? 'MATERNELLE' : userRole === 'DISCIPLINE_PRIMAIRE' ? 'PRIMAIRE' : userRole === 'DISCIPLINE_SECONDAIRE' ? 'SECONDAIRE' : ''

  useEffect(() => {
    function fetchStats() {
      if (!userData?.schoolId) { setLoading(false); return }
      // Fetch all discipline records and count by listType
      authFetch(`/api/discipline?schoolId=${userData.schoolId}&limit=500`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(j => {
          const records = j.data || []
          let blacklist = 0, greylist = 0, whitelist = 0
          for (const r of records) {
            if (r.listType === 'BLACKLIST') blacklist++
            else if (r.listType === 'GREYLIST') greylist++
            else if (r.listType === 'WHITELIST') whitelist++
          }
          setStats({ blacklist, greylist, whitelist, totalStudents: records.length })
          setLoadError(false)
          setLoading(false)
        })
        .catch(() => {
          // Avant : un 403/500 laissait les compteurs à 0, c'est-à-dire
          // « aucune infraction » — un faux négatif dangereux pour un
          // disciplinaire. On signale explicitement l'échec.
          setLoadError(true)
          setLoading(false)
          toast.error('Données disciplinaires indisponibles — compteurs non fiables')
        })
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
      {loadError && (
        <div className="mb-6 px-4 py-3 rounded-xl text-[13px] font-medium" style={{ background: `${DANGER}12`, color: DANGER }}>
          Les données disciplinaires n'ont pas pu être chargées : les compteurs ci-dessous restent à zéro et ne reflètent PAS la réalité.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <StatCard label="Liste Noire" value={String(stats.blacklist)} icon={<Ban size={16} />} color={DANGER} onClick={() => { setDisciplineTab('BLACKLIST'); setCurrentView('discipline') }} />
        <StatCard label="Liste Grise" value={String(stats.greylist)} icon={<AlertTriangle size={16} />} color={WARNING} onClick={() => { setDisciplineTab('GREYLIST'); setCurrentView('discipline') }} />
        <StatCard label="Liste Blanche" value={String(stats.whitelist)} icon={<Award size={16} />} color={SUCCESS} onClick={() => { setDisciplineTab('WHITELIST'); setCurrentView('discipline') }} />
      </div>
    </div>
  )
}
