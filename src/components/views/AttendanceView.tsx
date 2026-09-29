'use client'

// ─── Liste de présence (appel quotidien) — vue autonome ────────────────────
// Extraite du panneau inline de DisciplineView : MÊME mécanique d'appel API.
//  - GET  /api/classes?limit=100&schoolId=…  → classes (super admin : TOUJOURS
//    schoolId=getActiveSchoolId() ; rôles école : param omis, le serveur scelle
//    sur user.schoolId)
//  - GET  /api/attendance?classId=…&date=…   → élèves de la classe + statuts
//    déjà en base pour le jour (scellé côté serveur par assertClassAccess :
//    école + cycle), records avec auteur (recordedBy) et heure (updatedAt)
//  - POST /api/attendance { classId, date, entries:[{studentId,status}] }
//    → upsert par @@unique([studentId, date]) → réponse { data: { saved } }
// La persistance est rendue VISIBLE : compteurs, bandeau de confirmation du
// POST (X enregistrements) et section « Historique du jour » lue en base.

import { useState, useEffect, useMemo } from 'react'
import { useEduGestStore, authFetch, getActiveSchoolId } from '@/lib/store'
import type { UserRole } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY, GOLD_SOFT, DANGER, SUCCESS, SUCCESS_SOFT } from '@/lib/constants'
import StudentAvatar from '@/components/ui/StudentAvatar'
import { CalendarCheck, ClipboardList, Check, Database, ShieldAlert, Clock, Users, Download } from 'lucide-react'
import { toast } from 'sonner'
import AppSelect from '@/components/ui/AppSelect'

interface ClassRow { id: string; name: string; section?: string | null }
interface AttendanceStudent { id: string; firstName: string; lastName: string; matricule: string; photoUrl?: string | null }
interface AttendanceRecordRow { studentId: string; status: string; recordedBy?: string | null; updatedAt?: string }

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  PRESENT: { label: 'Présent', bg: 'oklch(95% 0.04 145)', color: SUCCESS },
  ABSENT: { label: 'Absent', bg: 'oklch(95% 0.04 25)', color: DANGER },
  LATE: { label: 'Retard', bg: GOLD_SOFT, color: GOLD },
}

function todayLocalISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AttendanceView() {
  const { userRole } = useEduGestStore()
  const isSAG = userRole === 'SUPER_ADMIN_GLOBAL'

  // Même garde-fou que le panneau d'origine de DisciplineView.
  const disciplineRoles: UserRole[] = ['DISCIPLINE_MATERNELLE', 'DISCIPLINE_PRIMAIRE', 'DISCIPLINE_SECONDAIRE']
  const directionVariants: UserRole[] = ['DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE']
  const isDisciplineRole = disciplineRoles.includes(userRole as UserRole)
  const isTeacherRole = userRole === 'TEACHER' || userRole === 'HEAD_TEACHER'
  const canTakeAttendance = isDisciplineRole || directionVariants.includes(userRole as UserRole) || userRole === 'SCHOOL_ADMIN' || isSAG || isTeacherRole

  const [classes, setClasses] = useState<ClassRow[]>([])
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState(todayLocalISO)
  const [students, setStudents] = useState<AttendanceStudent[]>([])
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({})
  const [dbRecords, setDbRecords] = useState<AttendanceRecordRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSave, setLastSave] = useState<{ saved: number; at: string } | null>(null)

  // ── Présence des professeurs ─────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'students' | 'teachers' | 'history'>('students')
  const [teachers, setTeachers] = useState<{ id: string; name: string; email: string; role: string; subjectName: string | null; classNames: string | null; attendance: string | null }[]>([])
  const [teacherAttendanceMap, setTeacherAttendanceMap] = useState<Record<string, string>>({})
  const [teachersLoading, setTeachersLoading] = useState(false)
  const [teachersSaving, setTeachersSaving] = useState(false)
  const [teachersLastSave, setTeachersLastSave] = useState<{ saved: number; at: string } | null>(null)

  // ── Historique de présence (élèves + profs) ────────────────────────────
  const [historyRecords, setHistoryRecords] = useState<{ id: string; date: string; status: string; studentId?: string; teacherId?: string; student?: { firstName: string; lastName: string; matricule: string } | null; teacher?: { name: string; email: string; role: string; subjectName: string | null; classNames: string | null } | null }[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<'all' | 'students' | 'teachers'>('all')
  const [historyDate, setHistoryDate] = useState('')
  const [historyClassId, setHistoryClassId] = useState('')

  // Classes : super admin → TOUJOURS schoolId=getActiveSchoolId() (sans école
  // active : aucune requête, vue plateforme vide) ; rôles école → param omis,
  // le serveur impose user.schoolId.
  useEffect(() => {
    if (!canTakeAttendance) return
    const schoolId = getActiveSchoolId()
    if (!schoolId && isSAG) return
    const params = new URLSearchParams({ limit: '100' })
    if (schoolId) params.set('schoolId', schoolId)
    authFetch(`/api/classes?${params}`)
      .then(r => r.json())
      .then(j => setClasses(j.data || []))
      .catch(() => {})
  }, [canTakeAttendance, isSAG, getActiveSchoolId()])

  // Élèves + statuts déjà en base pour la classe/date : UN SEUL appel
  // (l'endpoint renvoie la liste complète des élèves de la classe, vérifiée
  // côté serveur — école + cycle — sans limite de taille).
  useEffect(() => {
    if (!classId || !date) return
    let cancelled = false
    authFetch(`/api/attendance?classId=${classId}&date=${date}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        setStudents(j.data?.students || [])
        const recs: AttendanceRecordRow[] = j.data?.records || []
        setDbRecords(recs)
        const map: Record<string, string> = {}
        for (const rec of recs) map[rec.studentId] = rec.status
        setAttendanceMap(map)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [classId, date])

  // Charger les professeurs + leurs statuts du jour
  useEffect(() => {
    if (!canTakeAttendance || activeTab !== 'teachers') return
    const schoolId = getActiveSchoolId()
    if (!schoolId && isSAG) return
    let cancelled = false
    setTeachersLoading(true)
    const params = new URLSearchParams({ date })
    if (schoolId) params.set('schoolId', schoolId)
    authFetch(`/api/attendance/teachers?${params}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        setTeachers(j.data?.teachers || [])
        const map: Record<string, string> = {}
        for (const t of j.data?.teachers || []) {
          if (t.attendance) map[t.id] = t.attendance
        }
        setTeacherAttendanceMap(map)
        setTeachersLoading(false)
      })
      .catch(() => { if (!cancelled) setTeachersLoading(false) })
    return () => { cancelled = true }
  }, [canTakeAttendance, isSAG, getActiveSchoolId(), activeTab, date])

  // Charger l'historique de présence (élèves + profs)
  useEffect(() => {
    if (!canTakeAttendance || activeTab !== 'history') return
    const schoolId = getActiveSchoolId()
    if (!schoolId && isSAG) return
    let cancelled = false
    setHistoryLoading(true)
    const params = new URLSearchParams()
    if (schoolId) params.set('schoolId', schoolId)
    if (historyDate) params.set('date', historyDate)
    authFetch(`/api/attendance/teachers/history?${params}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        setHistoryRecords(j.data?.records || [])
        setHistoryLoading(false)
      })
      .catch(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [canTakeAttendance, isSAG, getActiveSchoolId(), activeTab, historyDate])

  const counts = useMemo(() => {
    let present = 0, absent = 0, late = 0
    for (const s of students) {
      const st = attendanceMap[s.id]
      if (st === 'PRESENT') present++
      else if (st === 'ABSENT') absent++
      else if (st === 'LATE') late++
    }
    return { present, absent, late, unmarked: students.length - present - absent - late }
  }, [students, attendanceMap])

  const nameById = useMemo(() => {
    const m = new Map<string, AttendanceStudent>()
    for (const s of students) m.set(s.id, s)
    return m
  }, [students])

  const dateLabel = useMemo(() => {
    try {
      return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    } catch {
      return date
    }
  }, [date])

  async function handleSaveTeacherAttendance() {
    const schoolId = getActiveSchoolId()
    if (!schoolId) { toast.error('Erreur: école non trouvée'); return }
    const entries = Object.entries(teacherAttendanceMap).map(([teacherId, status]) => ({ teacherId, status }))
    if (entries.length === 0) { toast.error('Marquez au moins un professeur'); return }
    setTeachersSaving(true)
    try {
      const res = await authFetch('/api/attendance/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId, date, entries }),
      })
      if (res.ok) {
        const j = await res.json().catch(() => null)
        const saved = typeof j?.data?.saved === 'number' ? j.data.saved : entries.length
        setTeachersLastSave({ saved, at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) })
        toast.success(`Présence professeurs enregistrée — ${saved} enregistrement${saved > 1 ? 's' : ''}`)
      } else {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error || 'Erreur lors de l\'enregistrement')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setTeachersSaving(false)
  }

  async function handleDownloadTeacherPdf(teacherId: string) {
    const schoolId = getActiveSchoolId()
    if (!schoolId) { toast.error('Erreur: école non trouvée'); return }
    try {
      const res = await authFetch(`/api/attendance/teachers/history/pdf?teacherId=${teacherId}&schoolId=${schoolId}`)
      if (!res.ok) { toast.error('Erreur lors du téléchargement'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `presence-prof-${teacherId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erreur de connexion')
    }
  }

  async function refreshDbRecords() {
    try {
      const r = await authFetch(`/api/attendance?classId=${classId}&date=${date}`)
      const j = await r.json()
      setDbRecords(j.data?.records || [])
    } catch {
      // silencieux : l'historique sera rechargé au prochain changement
    }
  }

  // Même logique d'upsert que le panneau d'origine : statuts marqués → entries,
  // POST /api/attendance, réponse { data: { saved } } affichée.
  async function handleSave() {
    if (!classId || !date) return
    const entries = Object.entries(attendanceMap).map(([studentId, status]) => ({ studentId, status }))
    if (entries.length === 0) {
      toast.error('Marquez au moins un élève')
      return
    }
    setSaving(true)
    try {
      const res = await authFetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, date, entries }),
      })
      if (res.ok) {
        const j = await res.json().catch(() => null)
        const saved = typeof j?.data?.saved === 'number' ? j.data.saved : entries.length
        setLastSave({ saved, at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) })
        toast.success(`Liste de présence enregistrée en base — ${saved} enregistrement${saved > 1 ? 's' : ''}`)
        refreshDbRecords()
      } else {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error || 'Erreur lors de l\'enregistrement')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setSaving(false)
  }

  // Garde d'accès placée APRÈS tous les hooks (règles React).
  if (!canTakeAttendance) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Liste de présence</h1>
        </div>
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-10 shadow-sm text-center">
          <div className="w-12 h-12 rounded-2xl grid place-items-center mx-auto mb-4" style={{ background: 'oklch(95% 0.04 25)' }}>
            <ShieldAlert size={22} style={{ color: DANGER }} />
          </div>
          <p className="font-semibold mb-1" style={{ color: TEXT_PRIMARY }}>Accès non autorisé</p>
          <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>La liste de présence est réservée aux comptes discipline, direction, admin d&apos;école et super admin.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Liste de présence</h1>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ background: GOLD_SOFT, color: GOLD }}>Appel quotidien</span>
        <span className="text-xs hidden sm:block" style={{ color: TEXT_MUTED_LUXE }}>Enregistré en base de données — scellé par école</span>
      </div>

      {/* ── Onglets ──────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-6">
        {([['students', 'Appel du jour', CalendarCheck], ['teachers', 'Présence profs', Users], ['history', 'Historique', Database]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold border transition"
            style={activeTab === key
              ? { background: GOLD, color: 'white', borderColor: GOLD }
              : { background: 'white', color: TEXT_MUTED_LUXE, borderColor: 'oklch(90% 0.01 175)' }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Appel du jour (élèves) ─────────────────────────────────────── */}
      {activeTab === 'students' && (
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2 mr-2">
            <CalendarCheck size={16} style={{ color: GOLD }} />
            <h3 className="font-semibold text-[15px]" style={{ color: TEXT_PRIMARY }}>Appel du jour</h3>
          </div>
          <AppSelect
            value={classId}
            onChange={(v) => { setClassId(v); setLoading(true); setLastSave(null) }}
            className="w-48"
            options={[{ value: '', label: 'Choisir une classe' }, ...classes.map(c => ({ value: c.id, label: c.name }))]}
          />
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setLoading(true); setLastSave(null) }}
            className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
          />
        </div>

        {!classId ? (
          <div className="text-center py-6 text-sm" style={{ color: TEXT_MUTED_LUXE }}>
            <ClipboardList size={28} className="mx-auto mb-2 opacity-30" />
            Sélectionnez une classe pour faire l&apos;appel du jour
          </div>
        ) : loading ? (
          <div className="text-center py-6 text-sm" style={{ color: TEXT_MUTED_LUXE }}>Chargement des élèves...</div>
        ) : students.length === 0 ? (
          <div className="text-center py-6 text-sm" style={{ color: TEXT_MUTED_LUXE }}>Aucun élève dans cette classe</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] font-semibold">
              <span className="px-2 py-1 rounded-full" style={{ background: 'oklch(95% 0.04 145)', color: SUCCESS }}>Présents : {counts.present}</span>
              <span className="px-2 py-1 rounded-full" style={{ background: 'oklch(95% 0.04 25)', color: DANGER }}>Absents : {counts.absent}</span>
              <span className="px-2 py-1 rounded-full" style={{ background: GOLD_SOFT, color: GOLD }}>Retards : {counts.late}</span>
              <span className="px-2 py-1 rounded-full" style={{ background: 'oklch(95% 0.04 175)', color: TEXT_MUTED_LUXE }}>Non marqués : {counts.unmarked}</span>
              <button onClick={handleSave} disabled={saving} className="edu-gold-cta ml-auto px-4 py-2 rounded-xl text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                {saving ? <div className="h-3.5 w-3.5 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={13} />}
                Enregistrer l&apos;appel
              </button>
            </div>

            {lastSave && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3 text-[12px] font-medium" style={{ background: SUCCESS_SOFT, color: SUCCESS }}>
                <Database size={13} />
                Persistance confirmée : {lastSave.saved} enregistrement{lastSave.saved > 1 ? 's' : ''} en base de données à {lastSave.at}
              </div>
            )}

            <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-1.5">
              {students.map(s => {
                const st = attendanceMap[s.id] || ''
                return (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition">
                    <StudentAvatar firstName={s.firstName} lastName={s.lastName} photoUrl={s.photoUrl || undefined} size={30} className="text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate" style={{ color: TEXT_PRIMARY }}>{s.firstName} {s.lastName}</div>
                      <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{s.matricule}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {([['PRESENT', 'Présent', SUCCESS], ['LATE', 'Retard', GOLD], ['ABSENT', 'Absent', DANGER]] as const).map(([val, label, color]) => (
                        <button
                          key={val}
                          onClick={() => setAttendanceMap(prev => {
                            const next = { ...prev }
                            if (st === val) delete next[s.id]
                            else next[s.id] = val
                            return next
                          })}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition"
                          style={st === val ? { background: color, color: 'white', borderColor: color } : { background: 'white', color: TEXT_MUTED_LUXE, borderColor: 'oklch(90% 0.01 175)' }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
      )}

      {/* ── Présence profs ────────────────────────────────────────────── */}
      {activeTab === 'teachers' && (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm mb-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2 mr-2">
              <Users size={16} style={{ color: GOLD }} />
              <h3 className="font-semibold text-[15px]" style={{ color: TEXT_PRIMARY }}>Présence des professeurs</h3>
            </div>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
            />
            <button onClick={handleSaveTeacherAttendance} disabled={teachersSaving} className="edu-gold-cta ml-auto px-4 py-2 rounded-xl text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
              {teachersSaving ? <div className="h-3.5 w-3.5 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={13} />}
              Enregistrer
            </button>
          </div>

          {teachersLastSave && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3 text-[12px] font-medium" style={{ background: SUCCESS_SOFT, color: SUCCESS }}>
              <Database size={13} />
              {teachersLastSave.saved} enregistrement{teachersLastSave.saved > 1 ? 's' : ''} à {teachersLastSave.at}
            </div>
          )}

          {teachersLoading ? (
            <div className="text-center py-6 text-sm" style={{ color: TEXT_MUTED_LUXE }}>Chargement des professeurs...</div>
          ) : teachers.length === 0 ? (
            <div className="text-center py-6 text-sm" style={{ color: TEXT_MUTED_LUXE }}>Aucun professeur dans ce cycle</div>
          ) : (
            <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-1.5">
              {teachers.map(t => {
                const st = teacherAttendanceMap[t.id] || ''
                return (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition">
                    <div className="w-8 h-8 rounded-full grid place-items-center text-white text-[11px] font-semibold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                      {t.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate" style={{ color: TEXT_PRIMARY }}>{t.name}</div>
                      <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{t.subjectName || t.classNames || t.email}</div>
                    </div>
                    <button
                      onClick={() => handleDownloadTeacherPdf(t.id)}
                      className="p-1.5 rounded-lg border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition"
                      title="Télécharger l'historique PDF"
                    >
                      <Download size={13} style={{ color: GOLD }} />
                    </button>
                    <div className="flex gap-1 shrink-0">
                      {([['PRESENT', 'Présent', SUCCESS], ['ABSENT', 'Absent', DANGER]] as const).map(([val, label, color]) => (
                        <button
                          key={val}
                          onClick={() => setTeacherAttendanceMap(prev => {
                            const next = { ...prev }
                            if (st === val) delete next[t.id]
                            else next[t.id] = val
                            return next
                          })}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition"
                          style={st === val ? { background: color, color: 'white', borderColor: color } : { background: 'white', color: TEXT_MUTED_LUXE, borderColor: 'oklch(90% 0.01 175)' }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Historique ─────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm mb-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2 mr-2">
              <Database size={16} style={{ color: GOLD }} />
              <h3 className="font-semibold text-[15px]" style={{ color: TEXT_PRIMARY }}>Historique de présence</h3>
            </div>
            <input
              type="date"
              value={historyDate}
              onChange={e => setHistoryDate(e.target.value)}
              className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
            />
            <AppSelect
              value={historyFilter}
              onChange={(v) => setHistoryFilter(v as 'all' | 'students' | 'teachers')}
              className="w-40"
              options={[
                { value: 'all', label: 'Tous' },
                { value: 'students', label: 'Élèves' },
                { value: 'teachers', label: 'Profs' },
              ]}
            />
          </div>

          {historyLoading ? (
            <div className="text-center py-6 text-sm" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div>
          ) : historyRecords.length === 0 ? (
            <div className="text-center py-6 text-sm" style={{ color: TEXT_MUTED_LUXE }}>Aucun enregistrement</div>
          ) : (
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>
                    <th className="pb-2 font-semibold">Date</th>
                    <th className="pb-2 font-semibold">Nom</th>
                    <th className="pb-2 font-semibold">Type</th>
                    <th className="pb-2 font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRecords.map((rec, i) => {
                    const name = rec.teacher?.name || (rec.student ? `${rec.student.firstName} ${rec.student.lastName}` : '—')
                    const type = rec.teacher ? 'Prof' : 'Élève'
                    const meta = STATUS_META[rec.status] || { label: rec.status, bg: 'oklch(95% 0.04 175)', color: TEXT_MUTED_LUXE }
                    return (
                      <tr key={rec.id || i} className="border-t border-[oklch(90%_0.01_175)]">
                        <td className="py-2 text-[12px]" style={{ color: TEXT_MUTED_LUXE }}>{rec.date}</td>
                        <td className="py-2 text-[12px] font-medium" style={{ color: TEXT_PRIMARY }}>{name}</td>
                        <td className="py-2 text-[12px]" style={{ color: TEXT_MUTED_LUXE }}>{type}</td>
                        <td className="py-2">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>
                            {meta.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Historique du jour (lu en base) ────────────────────────────── */}
      {activeTab === 'students' && classId && !loading && (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-2 border-b border-[oklch(90%_0.01_175)]" style={{ background: IVORY }}>
            <Database size={15} style={{ color: GOLD }} />
            <h3 className="font-semibold text-[14px]" style={{ color: TEXT_PRIMARY }}>Historique du jour</h3>
            <span className="text-[11px] capitalize" style={{ color: TEXT_MUTED_LUXE }}>{dateLabel}</span>
            <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: GOLD_SOFT, color: GOLD }}>
              {dbRecords.length} enregistrement{dbRecords.length > 1 ? 's' : ''} en base
            </span>
          </div>
          <div className="p-5">
            {dbRecords.length === 0 ? (
              <div className="text-center py-4 text-sm" style={{ color: TEXT_MUTED_LUXE }}>
                Aucun enregistrement en base de données pour cette date. Faites l&apos;appel puis enregistrez.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
                {dbRecords.map((rec, i) => {
                  const student = nameById.get(rec.studentId)
                  const meta = STATUS_META[rec.status] || { label: rec.status, bg: 'oklch(95% 0.04 175)', color: TEXT_MUTED_LUXE }
                  return (
                    <div key={`${rec.studentId}-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-[oklch(90%_0.01_175)]">
                      {student ? (
                        <StudentAvatar firstName={student.firstName} lastName={student.lastName} photoUrl={student.photoUrl || undefined} size={28} className="text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
                      ) : (
                        <div className="w-7 h-7 rounded-full grid place-items-center text-white text-[10px] font-semibold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>?</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate" style={{ color: TEXT_PRIMARY }}>
                          {student ? `${student.firstName} ${student.lastName}` : `Élève ${rec.studentId.slice(0, 8)}…`}
                        </div>
                        <div className="text-[11px] flex items-center gap-1" style={{ color: TEXT_MUTED_LUXE }}>
                          <Clock size={9} />
                          {rec.updatedAt ? new Date(rec.updatedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                          {rec.recordedBy ? ` · par ${rec.recordedBy}` : ''}
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
