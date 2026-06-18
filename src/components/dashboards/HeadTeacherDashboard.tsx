'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { Users, Target, Award } from 'lucide-react'
import { ACCENT, SUCCESS, INFO, GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'
import StatCard from './StatCard'

export default function HeadTeacherDashboard() {
  const { userData } = useEduGestStore()
  const [classInfo, setClassInfo] = useState<{ name: string; studentCount: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function fetchData() {
      if (userData?.schoolId) {
        authFetch(`/api/classes?limit=50&schoolId=${userData.schoolId}`)
          .then(r => r.json())
          .then(j => {
            const allClasses: { id: string; name: string; _count?: { students: number } }[] = j.data || []
            const teacherClassNames = userData?.classNames
            let myClass: { id: string; name: string; _count?: { students: number } } | undefined
            if (teacherClassNames) {
              const nameList = teacherClassNames.split(',').map(n => n.trim().toLowerCase())
              myClass = allClasses.find(c => nameList.some(n => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase())))
            }
            if (myClass) {
              setClassInfo({ name: myClass.name, studentCount: myClass._count?.students || 0 })
            } else if (allClasses.length > 0 && teacherClassNames) {
              setClassInfo(null)
            } else if (!teacherClassNames && allClasses.length > 0) {
              setClassInfo(null)
            }
            setLoading(false)
          })
          .catch(() => setLoading(false))
      } else {
        setTimeout(() => setLoading(false), 0)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [userData?.schoolId])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Bonjour {userData?.name || 'Prof. Principal'}</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>{classInfo ? `Suivi de la classe ${classInfo.name}` : 'Aucune classe assignée — Contactez l\'administration'}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <StatCard label="Élèves" value={String(classInfo?.studentCount || 0)} icon={<Users size={16} />} color={ACCENT} />
        <StatCard label="Matière" value={userData?.subjectName || '—'} icon={<Target size={16} />} color={SUCCESS} />
        <StatCard label="Titulaire" value={userData?.isTitulaire ? 'Oui' : 'Non'} icon={<Award size={16} />} color={INFO} />
      </div>
    </div>
  )
}
