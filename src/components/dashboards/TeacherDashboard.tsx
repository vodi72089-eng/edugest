'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { School, Users, PenTool, BookOpen } from 'lucide-react'
import { ACCENT, SUCCESS, WARNING, DANGER, INFO, GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'
import StatCard from './StatCard'

interface TeacherAssignment {
  id: string
  class: { id: string; name: string; _count?: { students: number } }
  subject: { id: string; name: string }
  teacher: { id: string; name: string }
}

export default function TeacherDashboard() {
  const { userData, setCurrentView } = useEduGestStore()
  const [classCount, setClassCount] = useState(0)
  const [studentCount, setStudentCount] = useState(0)
  const [homeworkCount, setHomeworkCount] = useState(0)
  const [subjects, setSubjects] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function fetchData() {
      if (!userData?.schoolId) {
        setLoading(false)
        return
      }
      authFetch(`/api/teacher-assignments?teacherId=${userData.id}`)
        .then(r => r.json())
        .then(j => {
          const assignments: TeacherAssignment[] = j.data || []
          const classMap = new Map<string, { name: string; students: number }>()
          const subjectSet = new Set<string>()
          let totalStudents = 0
          for (const a of assignments) {
            if (!classMap.has(a.class.id)) {
              classMap.set(a.class.id, { name: a.class.name, students: a.class._count?.students || 0 })
              totalStudents += a.class._count?.students || 0
            }
            subjectSet.add(a.subject.name)
          }
          setClassCount(classMap.size)
          setStudentCount(totalStudents)
          setSubjects([...subjectSet])
        })
        .catch(() => {})
      authFetch(`/api/homework?schoolId=${userData.schoolId}&limit=50`)
        .then(r => r.json())
        .then(j => {
          const allHw: { teacherId?: string; teacherName: string }[] = j.data || []
          const myHw = allHw.filter(h => h.teacherId === userData?.id || h.teacherName === userData?.name)
          setHomeworkCount(myHw.length)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
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
            {userData?.isTitulaire ? 'Titulaire' : 'Enseignant'} · {subjects.length > 0 ? subjects.join(', ') : 'Aucune matière assignée'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        <StatCard label="Mes classes" value={String(classCount)} icon={<School size={16} />} color={ACCENT} onClick={() => setCurrentView('students')} />
        <StatCard label="Élèves total" value={String(studentCount)} icon={<Users size={16} />} color={INFO} onClick={() => setCurrentView('students')} />
        <StatCard label="Devoirs créés" value={String(homeworkCount)} icon={<PenTool size={16} />} color={WARNING} onClick={() => setCurrentView('homework')} />
        <StatCard label="Matières" value={subjects.length > 0 ? subjects.join(', ') : '—'} icon={<BookOpen size={16} />} color={DANGER} onClick={() => setCurrentView('grades')} />
      </div>
    </div>
  )
}
