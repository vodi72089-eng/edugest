'use client'

import { useState, useEffect, useMemo } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import type { GradeData, ClassData, StudentData } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY, DANGER } from '@/lib/constants'
import { getInitials } from '@/lib/helpers'
import { Plus, Check, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import SearchAutocomplete from './SearchAutocomplete'

export default function GradesView() {
  const { userRole, userData } = useEduGestStore()
  const [grades, setGrades] = useState<GradeData[]>([])
  const [classes, setClasses] = useState<ClassData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedTrimester, setSelectedTrimester] = useState('T1')
  const [selectedChildId, setSelectedChildId] = useState('')
  const [myChildren, setMyChildren] = useState<StudentData[]>([])
  const [childSearch, setChildSearch] = useState('')
  const [classSearch, setClassSearch] = useState('')
  const [selectedClassSearchId, setSelectedClassSearchId] = useState<string | null>(null)
  const [selectedChildSearchId, setSelectedChildSearchId] = useState<string | null>(null)
  const isParent = userRole === 'PARENT'
  const isTeacher = userRole === 'TEACHER' || userRole === 'HEAD_TEACHER'
  const [showGradeForm, setShowGradeForm] = useState(false)
  const [gradeStudentId, setGradeStudentId] = useState('')
  const [gradeStudentSearch, setGradeStudentSearch] = useState('')
  const [gradeStudentSearchId, setGradeStudentSearchId] = useState<string | null>(null)
  const [gradeSubjectId, setGradeSubjectId] = useState('')
  const [gradeClassId, setGradeClassId] = useState('')
  const [gradeScore, setGradeScore] = useState('')
  const [gradeComment, setGradeComment] = useState('')
  const [gradeTrimester, setGradeTrimester] = useState('T1')
  const [gradeSubmitting, setGradeSubmitting] = useState(false)
  const [subjects, setSubjects] = useState<{ id: string; name: string; coefficient: number }[]>([])
  const [classStudents, setClassStudents] = useState<StudentData[]>([])

  useEffect(() => {
    if (gradeClassId) {
      authFetch(`/api/subjects?classId=${gradeClassId}&limit=20`).then(r => r.json()).then(j => setSubjects(j.data || [])).catch(() => {})
      authFetch(`/api/students?classId=${gradeClassId}&limit=50`).then(r => r.json()).then(j => setClassStudents(j.data || [])).catch(() => {})
    }
  }, [gradeClassId])

  const gradeStudentSuggestions = useMemo(() => {
    if (gradeStudentSearch.length < 1) return classStudents.map(s => ({ id: s.id, label: `${s.firstName} ${s.lastName}`, sublabel: s.matricule }))
    return classStudents.filter(s =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(gradeStudentSearch.toLowerCase()) || s.matricule.toLowerCase().includes(gradeStudentSearch.toLowerCase())
    ).map(s => ({ id: s.id, label: `${s.firstName} ${s.lastName}`, sublabel: s.matricule }))
  }, [gradeStudentSearch, classStudents])

  useEffect(() => {
    authFetch(`/api/classes?limit=50${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`).then(r => r.json()).then(j => setClasses(j.data || [])).catch(() => {})
    if (isParent && userData?.id) {
      authFetch(`/api/students?parentId=${userData.id}&limit=20`)
        .then(r => r.json())
        .then(j => setMyChildren(j.data || []))
        .catch(() => {})
    }
    loadGrades()
  }, [])

  useEffect(() => {
    loadGrades()
  }, [selectedClass, selectedTrimester, selectedChildId])

  async function loadGrades() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (isParent && userData?.id) {
        params.set('parentId', userData.id)
        if (selectedChildId) {
          params.delete('parentId')
          params.set('studentId', selectedChildId)
        }
      } else {
        if (selectedClass) params.set('classId', selectedClass)
      }
      params.set('trimester', selectedTrimester)
      params.set('limit', '100')
      const res = await authFetch(`/api/grades?${params}`)
      const json = await res.json()
      setGrades(json.data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function handleAddGrade() {
    if (!gradeStudentId || !gradeSubjectId || !gradeClassId || !gradeScore || !userData?.schoolId) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }
    const score = parseFloat(gradeScore)
    if (isNaN(score) || score < 0 || score > 20) {
      toast.error('La note doit être entre 0 et 20')
      return
    }
    setGradeSubmitting(true)
    try {
      const res = await authFetch('/api/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: gradeStudentId,
          subjectId: gradeSubjectId,
          classId: gradeClassId,
          trimester: gradeTrimester,
          score,
          comment: gradeComment || null,
        }),
      })
      if (res.ok) {
        toast.success('Note enregistrée !')
        setShowGradeForm(false)
        setGradeStudentId(''); setGradeScore(''); setGradeComment('')
        setGradeStudentSearchId(null); setGradeStudentSearch('')
        loadGrades()
      } else {
        const errData = await res.json().catch(() => ({}))
        toast.error(errData?.error || 'Erreur lors de l\'enregistrement')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setGradeSubmitting(false)
  }

  const childSuggestions = useMemo(() => {
    if (!isParent) return []
    if (childSearch.length < 1) return myChildren.map(c => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, sublabel: c.matricule }))
    return myChildren.filter(c =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(childSearch.toLowerCase()) || c.matricule.toLowerCase().includes(childSearch.toLowerCase())
    ).map(c => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, sublabel: c.matricule }))
  }, [childSearch, myChildren, isParent])

  const classSuggestions = useMemo(() => {
    if (isParent) return []
    if (classSearch.length < 1) return classes.map(c => ({ id: c.id, label: c.name, sublabel: `${c._count?.students || 0} élèves` }))
    return classes.filter(c => c.name.toLowerCase().includes(classSearch.toLowerCase())).map(c => ({ id: c.id, label: c.name, sublabel: `${c._count?.students || 0} élèves` }))
  }, [classSearch, classes, isParent])
  const gradesByStudent = isParent ? Object.entries(
    grades.reduce((acc, g) => {
      const key = g.studentId
      if (!acc[key]) acc[key] = { student: g.student, grades: [] }
      acc[key].grades.push(g)
      return acc
    }, {} as Record<string, { student: GradeData['student']; grades: GradeData[] }>)
  ) : []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Notes</h1>
        </div>
        {isTeacher && (
          <button onClick={() => setShowGradeForm(!showGradeForm)} className="edu-gold-cta px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
            <Plus size={14} /> Nouvelle note
          </button>
        )}
      </div>

      {isTeacher && showGradeForm && (
        <div className="bg-white border-2 border-[oklch(72%_0.15_65_/_0.3)] rounded-2xl p-6 shadow-md mb-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
            <BookOpen size={16} style={{ color: GOLD }} /> Saisir une note
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Classe *</label>
              <select value={gradeClassId} onChange={e => { setGradeClassId(e.target.value); setGradeStudentId(''); setGradeStudentSearchId(null) }} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                <option value="">Sélectionner une classe</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Matière *</label>
              <select value={gradeSubjectId} onChange={e => setGradeSubjectId(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" disabled={!gradeClassId}>
                <option value="">{gradeClassId ? 'Sélectionner une matière' : 'D\'abord choisir une classe'}</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name} (coef. {s.coefficient})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Trimestre *</label>
              <select value={gradeTrimester} onChange={e => setGradeTrimester(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                <option value="T1">Trimestre 1</option>
                <option value="T2">Trimestre 2</option>
                <option value="T3">Trimestre 3</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Élève *</label>
              {!gradeClassId ? (
                <div className="px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm" style={{ color: TEXT_MUTED_LUXE }}>D'abord choisir une classe</div>
              ) : (
                <SearchAutocomplete
                  label=""
                  placeholder="Tapez le nom de l'élève..."
                  items={gradeStudentSuggestions}
                  selectedId={gradeStudentSearchId}
                  onSelect={(item) => { setGradeStudentSearchId(item.id); setGradeStudentId(item.id) }}
                  onClear={() => { setGradeStudentSearchId(null); setGradeStudentId(''); setGradeStudentSearch('') }}
                  searchQuery={gradeStudentSearch}
                  onSearchChange={setGradeStudentSearch}
                  itemTypeName="élève"
                />
              )}
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Note /20 *</label>
              <input type="number" min="0" max="20" step="0.5" value={gradeScore} onChange={e => setGradeScore(e.target.value)} placeholder="0-20" className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Commentaire</label>
              <input value={gradeComment} onChange={e => setGradeComment(e.target.value)} placeholder="Optionnel" className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAddGrade} disabled={gradeSubmitting || !gradeStudentId || !gradeSubjectId || !gradeClassId || !gradeScore} className="edu-gold-cta px-6 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {gradeSubmitting ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
              Enregistrer la note
            </button>
            <button onClick={() => setShowGradeForm(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)]" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-3 mb-5 bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm" style={{ background: IVORY }}>
        {isParent ? (
          <SearchAutocomplete
            label="Mes enfants"
            placeholder="Tapez le nom de l'enfant..."
            items={childSuggestions}
            selectedId={selectedChildSearchId}
            onSelect={(item) => { setSelectedChildSearchId(item.id); setSelectedChildId(item.id) }}
            onClear={() => { setSelectedChildSearchId(null); setSelectedChildId(''); setChildSearch('') }}
            searchQuery={childSearch}
            onSearchChange={setChildSearch}
            itemTypeName="enfant"
            className="w-full max-w-xs"
          />
        ) : (
          <SearchAutocomplete
            label="Filtrer par classe"
            placeholder="Tapez le nom de la classe..."
            items={classSuggestions}
            selectedId={selectedClassSearchId}
            onSelect={(item) => { setSelectedClassSearchId(item.id); setSelectedClass(item.id) }}
            onClear={() => { setSelectedClassSearchId(null); setSelectedClass(''); setClassSearch('') }}
            searchQuery={classSearch}
            onSearchChange={setClassSearch}
            itemTypeName="classe"
            className="w-full max-w-xs"
          />
        )}
        <div className={isParent ? 'mt-6' : 'mt-6'}>
          <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Trimestre</label>
          <select value={selectedTrimester} onChange={e => setSelectedTrimester(e.target.value)} className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
            <option value="T1">Trimestre 1</option>
            <option value="T2">Trimestre 2</option>
            <option value="T3">Trimestre 3</option>
          </select>
        </div>
      </div>

      {isParent && gradesByStudent.length > 0 ? (
        <div className="space-y-6">
          {gradesByStudent.map(([studentId, { student, grades: studentGrades }]) => {
            const avg = studentGrades.length > 0
              ? studentGrades.reduce((sum, g) => sum + g.score * (g.subject?.coefficient || 1), 0) / studentGrades.reduce((sum, g) => sum + (g.subject?.coefficient || 1), 0)
              : 0
            return (
              <div key={studentId} className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 flex items-center gap-3" style={{ background: IVORY }}>
                  <div className="w-10 h-10 rounded-full grid place-items-center text-white font-bold text-sm" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                    {student ? getInitials(`${student.firstName} ${student.lastName}`) : '??'}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold" style={{ color: TEXT_PRIMARY }}>{student?.firstName} {student?.lastName}</div>
                    <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>{studentGrades.length} notes · Moyenne: <span className="font-semibold" style={{ color: avg >= 10 ? GOLD : DANGER }}>{avg.toFixed(1)}/20</span></div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2" style={{ color: GOLD }}>Matière</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2" style={{ color: GOLD }}>Note /20</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2" style={{ color: GOLD }}>Coef.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentGrades.map(g => (
                        <tr key={g.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                          <td className="px-3 py-2 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{g.subject?.name}</td>
                          <td className="px-3 py-2">
                            <span className="text-[13px] font-semibold" style={{ color: g.score >= 10 ? GOLD : DANGER }}>{g.score.toFixed(1)}</span>
                          </td>
                          <td className="px-3 py-2 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>×{g.subject?.coefficient || 1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: IVORY }}>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Élève</th>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Matière</th>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Note /20</th>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Coef.</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
                ) : grades.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucune note</td></tr>
                ) : grades.slice(0, 30).map(g => (
                  <tr key={g.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                    <td className="px-3 py-2.5 text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{g.student?.firstName} {g.student?.lastName}</td>
                    <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{g.subject?.name}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[13px] font-semibold" style={{ color: g.score >= 10 ? GOLD : DANGER }}>
                        {g.score.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>×{g.subject?.coefficient || 1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
