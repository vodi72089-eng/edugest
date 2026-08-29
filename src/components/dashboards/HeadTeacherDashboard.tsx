'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { Users, Target, Award } from 'lucide-react'
import { ACCENT, SUCCESS, INFO, GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'
import StatCard from './StatCard'

export default function HeadTeacherDashboard() {
  const { userData, setCurrentView } = useEduGestStore()
  const [classInfo, setClassInfo] = useState<{ id: string; name: string; studentCount: number } | null>(null)
  const [subjectName, setSubjectName] = useState<string>('--')
  const [isTitulaire, setIsTitulaire] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function fetchData() {
      if (userData?.schoolId && userData?.id) {
        Promise.all([
          authFetch(`/api/classes?limit=50&schoolId=${userData.schoolId}`).then(r => r.json()),
          authFetch(`/api/teacher-assignments?teacherId=${userData.id}`).then(r => r.json()),
        ])
          .then(([classesJson, assignmentsJson]) => {
            const allClasses: { id: string; name: string; headTeacherId?: string | null; _count?: { students: number } }[] = classesJson.data || []
            const assignments: { class?: { id: string; name: string }; subject?: { name: string } }[] = assignmentsJson.data || []

            const myClass = allClasses.find(c => c.headTeacherId === userData.id)
            if (myClass) {
              setClassInfo({ id: myClass.id, name: myClass.name, studentCount: myClass._count?.students || 0 })
              setIsTitulaire(true)
            } else {
              const teacherClassNames = userData?.classNames
              if (teacherClassNames) {
                const nameList = teacherClassNames.split(',').map(n => n.trim().toLowerCase())
                const fallback = allClasses.find(c => nameList.some(n => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase())))
                if (fallback) {
                  setClassInfo({ id: fallback.id, name: fallback.name, studentCount: fallback._count?.students || 0 })
                }
              }
              setIsTitulaire(false)
            }

            const subjects = assignments.map(a => a.subject?.name).filter(Boolean)
            if (userData?.subjectName) {
              setSubjectName(userData.subjectName)
            } else if (subjects.length > 0) {
              setSubjectName(subjects.join(', '))
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
  }, [userData?.schoolId, userData?.id])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Bonjour {userData?.name || 'Prof. Principal'}</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>{classInfo ? `Suivi de la classe ${classInfo.name}` : 'Aucune classe assignée — Contactez l\'administration'}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <StatCard label="Élèves" value={String(classInfo?.studentCount || 0)} icon={<Users size={16} />} color={ACCENT} onClick={() => setCurrentView('classes')} />
        <StatCard label="Matière" value={subjectName} icon={<Target size={16} />} color={SUCCESS} />
        <StatCard label="Titulaire" value={isTitulaire ? 'Oui' : 'Non'} icon={<Award size={16} />} color={INFO} />
      </div>
    </div>
  )
}
