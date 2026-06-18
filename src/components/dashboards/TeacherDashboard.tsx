'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { School, Users, PenTool, BookOpen } from 'lucide-react'
import { ACCENT, SUCCESS, WARNING, DANGER, INFO, GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'
import StatCard from './StatCard'

export default function TeacherDashboard() {
  const { userData } = useEduGestStore()
  const [classCount, setClassCount] = useState(0)
  const [studentCount, setStudentCount] = useState(0)
  const [homeworkCount, setHomeworkCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (userData?.schoolId) {
      // Get classes
      authFetch(`/api/classes?limit=50&schoolId=${userData.schoolId}`)
        .then(r => r.json())
        .then(j => {
          const allClasses: { id: string; name: string; _count?: { students: number } }[] = j.data || []
          // Filter classes that match the teacher's assigned classNames
          const teacherClassNames = userData?.classNames
          let myClasses = allClasses
          if (teacherClassNames) {
            const nameList = teacherClassNames.split(',').map(n => n.trim().toLowerCase())
            myClasses = allClasses.filter(c => nameList.some(n => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase())))
          }
          setClassCount(myClasses.length)
          const totalStudents = myClasses.reduce((sum, c) => sum + (c._count?.students || 0), 0)
          setStudentCount(totalStudents)
        })
        .catch(() => {})

      // Get homework count - filter by teacherId
      authFetch(`/api/homework?schoolId=${userData.schoolId}&limit=50`)
        .then(r => r.json())
        .then(j => {
          const allHw: { teacherId?: string; teacherName: string }[] = j.data || []
          const myHw = allHw.filter(h => h.teacherId === userData?.id || h.teacherName === userData?.name)
          setHomeworkCount(myHw.length)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    } else {
      setTimeout(() => setLoading(false), 0)
    }
  }, [userData?.schoolId, userData?.name, userData?.id])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Bonjour {userData?.name || 'Professeur'}</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>
            {userData?.isTitulaire ? '🎓 Titulaire' : 'Enseignant'} · {userData?.subjectName || 'Vos classes et notes'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        <StatCard label="Mes classes" value={String(classCount)} icon={<School size={16} />} color={ACCENT} />
        <StatCard label="Élèves total" value={String(studentCount)} icon={<Users size={16} />} color={INFO} />
        <StatCard label="Devoirs créés" value={String(homeworkCount)} icon={<PenTool size={16} />} color={WARNING} />
        <StatCard label="Matière" value={userData?.subjectName || '—'} icon={<BookOpen size={16} />} color={DANGER} />
      </div>
    </div>
  )
}
