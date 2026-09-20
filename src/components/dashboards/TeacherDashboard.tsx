'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { School, Users, PenTool, BookOpen, Trophy, TrendingDown } from 'lucide-react'
import { ACCENT, SUCCESS, WARNING, DANGER, INFO, GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'
import StatCard from './StatCard'

interface TeacherAssignment {
  id: string
  class: { id: string; name: string; _count?: { students: number } }
  subject: { id: string; name: string }
  teacher: { id: string; name: string }
}

interface ClassPerformance {
  classId: string
  className: string
  avgGrade: number // moyenne pondérée /20
  incidents: number
  score: number // note globale pénalisée par la discipline
}

export default function TeacherDashboard() {
  const { userData, setCurrentView } = useEduGestStore()
  const [classCount, setClassCount] = useState(0)
  const [studentCount, setStudentCount] = useState(0)
  const [homeworkCount, setHomeworkCount] = useState(0)
  const [subjects, setSubjects] = useState<string[]>([])
  const [performance, setPerformance] = useState<ClassPerformance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function fetchData() {
      if (!userData?.schoolId) {
        setLoading(false)
        return
      }

      // Try teacher assignments first
      authFetch(`/api/teacher-assignments?teacherId=${userData.id}`)
        .then(r => r.json())
        .then(j => {
          const assignments: TeacherAssignment[] = j.data || []
          if (assignments.length > 0) {
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

            // ── Performance par classe (2+ classes uniquement) ─────────────
            // Note globale : moyenne pondérée par coefficient des notes de la
            // classe ; Discipline : nombre d'incidents de la classe.
            if (classMap.size >= 2) {
              const classIds = [...classMap.keys()]
              const gradeSums = new Map<string, { wSum: number; coef: number }>()
              authFetch(`/api/grades?schoolId=${userData.schoolId}&limit=200`)
                .then(r => r.json())
                .then(jg => {
                  for (const g of (jg.data || []) as { classId: string; score: number; subject?: { coefficient?: number } }[]) {
                    if (!classIds.includes(g.classId)) continue
                    const coef = g.subject?.coefficient || 1
                    const prev = gradeSums.get(g.classId) || { wSum: 0, coef: 0 }
                    gradeSums.set(g.classId, { wSum: prev.wSum + g.score * coef, coef: prev.coef + coef })
                  }
                  // Incidents : records discipline → map élève → classe
                  authFetch(`/api/students?schoolId=${userData.schoolId}&limit=100`)
                    .then(rs => rs.json())
                    .then(js => {
                      const studentClass = new Map<string, string>()
                      for (const s of (js.data || []) as { id: string; classId: string }[]) {
                        studentClass.set(s.id, s.classId)
                      }
                      authFetch(`/api/discipline?schoolId=${userData.schoolId}&limit=200`)
                        .then(rd => rd.json())
                        .then(jd => {
                          const incidents = new Map<string, number>()
                          for (const rec of (jd.data || []) as { studentId: string }[]) {
                            const cid = studentClass.get(rec.studentId)
                            if (cid && classIds.includes(cid)) {
                              incidents.set(cid, (incidents.get(cid) || 0) + 1)
                            }
                          }
                          const perf: ClassPerformance[] = classIds.map(cid => {
                            const gs = gradeSums.get(cid)
                            const avg = gs && gs.coef > 0 ? gs.wSum / gs.coef : 0
                            const inc = incidents.get(cid) || 0
                            // Score combiné : moyenne globale pénalisée par les incidents
                            return { classId: cid, className: classMap.get(cid)?.name || cid, avgGrade: avg, incidents: inc, score: avg - Math.min(inc, 10) * 0.5 }
                          })
                          setPerformance(perf)
                        })
                        .catch(() => {
                          setPerformance(classIds.map(cid => {
                            const gs = gradeSums.get(cid)
                            const avg = gs && gs.coef > 0 ? gs.wSum / gs.coef : 0
                            return { classId: cid, className: classMap.get(cid)?.name || cid, avgGrade: avg, incidents: 0, score: avg }
                          }))
                        })
                    })
                    .catch(() => {})
                })
                .catch(() => {})
            } else {
              setPerformance([])
            }
          } else {
            // No assignments — fallback to all school classes
            authFetch(`/api/classes?schoolId=${userData.schoolId}&limit=50`)
              .then(r => r.json())
              .then(j => {
                const classes: { id: string; name: string; _count?: { students: number } }[] = j.data || []
                setClassCount(classes.length)
                setStudentCount(classes.reduce((sum, c) => sum + (c._count?.students || 0), 0))
              })
              .catch(() => {})
          }
        })
        .catch(() => {
          // Fallback to all school classes
          authFetch(`/api/classes?schoolId=${userData.schoolId}&limit=50`)
            .then(r => r.json())
            .then(j => {
              const classes: { id: string; name: string; _count?: { students: number } }[] = j.data || []
              setClassCount(classes.length)
              setStudentCount(classes.reduce((sum, c) => sum + (c._count?.students || 0), 0))
            })
            .catch(() => {})
        })
        .finally(() => setLoading(false))

      authFetch(`/api/homework?schoolId=${userData.schoolId}&limit=50`)
        .then(r => r.json())
        .then(j => {
          const allHw: { teacherId?: string; teacherName: string }[] = j.data || []
          const myHw = allHw.filter(h => h.teacherId === userData?.id || h.teacherName === userData?.name)
          setHomeworkCount(myHw.length)
        })
        .catch(() => {})
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [userData?.schoolId, userData?.name, userData?.id])

  // Meilleure / pire classe selon la liste de discipline ET la note globale
  const sortedPerf = [...performance].sort((a, b) => b.score - a.score)
  const bestClass = sortedPerf[0]
  const worstClass = sortedPerf[sortedPerf.length - 1]

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Bonjour {userData?.name || 'Professeur'}</h1>
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

      {/* Meilleures / pires classes — visible avec plusieurs classes */}
      {classCount >= 2 && bestClass && worstClass && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-2xl p-6 border" style={{ borderColor: `${SUCCESS}44`, boxShadow: '0 1px 3px oklch(20% 0.02 250 / 0.04)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: `linear-gradient(135deg, ${SUCCESS}, ${ACCENT})` }}>
                <Trophy size={16} className="text-white" />
              </div>
              <div>
                <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Meilleure classe</div>
                <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>Selon discipline et note globale</div>
              </div>
            </div>
            <div className="text-2xl font-extrabold mb-2" style={{ color: TEXT_PRIMARY }}>{bestClass.className}</div>
            <div className="flex flex-wrap gap-4 text-[13px]">
              <span style={{ color: TEXT_MUTED_LUXE }}>Note globale : <b style={{ color: bestClass.avgGrade >= 10 ? SUCCESS : DANGER }}>{bestClass.avgGrade.toFixed(2)}/20</b></span>
              <span style={{ color: TEXT_MUTED_LUXE }}>Incidents : <b style={{ color: TEXT_PRIMARY }}>{bestClass.incidents}</b></span>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 border" style={{ borderColor: `${WARNING}55`, boxShadow: '0 1px 3px oklch(20% 0.02 250 / 0.04)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: `linear-gradient(135deg, ${WARNING}, ${DANGER})` }}>
                <TrendingDown size={16} className="text-white" />
              </div>
              <div>
                <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Classe à améliorer</div>
                <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>Selon discipline et note globale</div>
              </div>
            </div>
            <div className="text-2xl font-extrabold mb-2" style={{ color: TEXT_PRIMARY }}>{worstClass.className}</div>
            <div className="flex flex-wrap gap-4 text-[13px]">
              <span style={{ color: TEXT_MUTED_LUXE }}>Note globale : <b style={{ color: worstClass.avgGrade >= 10 ? SUCCESS : DANGER }}>{worstClass.avgGrade.toFixed(2)}/20</b></span>
              <span style={{ color: TEXT_MUTED_LUXE }}>Incidents : <b style={{ color: TEXT_PRIMARY }}>{worstClass.incidents}</b></span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
