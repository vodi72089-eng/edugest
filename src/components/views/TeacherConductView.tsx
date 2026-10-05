'use client'

import { useCallback, useEffect, useState } from 'react'
import { useEduGestStore as useLookSchool360Store, authFetch, getActiveSchoolId } from '@/lib/store'
import type { StudentData } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, DANGER, WARNING, SUCCESS, BORDER, IVORY } from '@/lib/constants'
import { toast } from 'sonner'
import { Shield, Send, Loader2, Clock, CheckCircle2, XCircle } from 'lucide-react'
import StudentAvatar from '@/components/ui/StudentAvatar'
import AppSelect from '@/components/ui/AppSelect'

interface TeacherClass {
  id: string
  name: string
}

interface ConductRequest {
  id: string
  studentId: string
  type: string
  severity: string
  title: string
  description: string
  points: number
  listType: string
  status: string
  schoolId: string
  createdBy: string | null
  createdAt: string
  student?: { id: string; firstName: string; lastName: string; matricule: string; photoUrl?: string; class?: { id: string; name: string; section?: string } }
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'En attente', color: WARNING, bg: 'oklch(95% 0.04 85)' },
  CONFIRMED: { label: 'Acceptée', color: SUCCESS, bg: 'oklch(95% 0.04 145)' },
  REJECTED: { label: 'Refusée', color: DANGER, bg: 'oklch(95% 0.04 25)' },
}

const POINT_PRESETS = [1, 2, -1, -2]

/**
 * Vue « Conduite » (professeurs) : donne ou retire des points à un élève
 * pendant le cours. Chaque envoi est une DEMANDE (PENDING) adressée au
 * disciplinaire — ce n'est qu'à son approbation que les listes sont mises à
 * jour et que les parents sont notifiés.
 */
export default function TeacherConductView() {
  const { userData } = useLookSchool360Store()
  const [classes, setClasses] = useState<TeacherClass[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [students, setStudents] = useState<StudentData[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [requests, setRequests] = useState<ConductRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(true)
  // Brouillons en cours par élève : points + raison
  const [draftPoints, setDraftPoints] = useState<Record<string, number>>({})
  const [draftReason, setDraftReason] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  // ── Classes du professeur ──────────────────────────────────────────────
  useEffect(() => {
    if (!userData?.id) return
    authFetch(`/api/teacher-assignments?teacherId=${userData.id}`)
      .then(r => r.json())
      .then(j => {
        const list: TeacherClass[] = (j.data || []).map((a: { class: { id: string; name: string } }) => ({
          id: a.class.id,
          name: a.class.name,
        }))
        // Dédupliquer : un prof peut avoir plusieurs matières dans la même classe
        const seen = new Set<string>()
        const unique = list.filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)))
        setClasses(unique)
        setSelectedClassId(prev => prev || (unique[0]?.id ?? ''))
      })
      .catch(() => {})
  }, [userData?.id])

  // ── Élèves de la classe sélectionnée ───────────────────────────────────
  // Tous les setState sont délégués à un tick (jamais de setState synchrone
  // dans un effet — règle react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      if (cancelled) return
      if (!selectedClassId) { setStudents([]); return }
      setLoadingStudents(true)
      authFetch(`/api/students?classId=${selectedClassId}&limit=100`)
        .then(r => r.json())
        .then(j => { if (!cancelled) setStudents(j.data || []) })
        .catch(() => { if (!cancelled) setStudents([]) })
        .finally(() => { if (!cancelled) setLoadingStudents(false) })
    }, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [selectedClassId])

  // ── Mes demandes (créées par ce prof) ──────────────────────────────────
  const loadRequests = useCallback(() => {
    if (!getActiveSchoolId()) return
    setLoadingRequests(true)
    authFetch(`/api/discipline?schoolId=${getActiveSchoolId()}&limit=200`)
      .then(r => r.json())
      .then(j => {
        const mine = ((j.data || []) as ConductRequest[]).filter(r => r.createdBy === userData?.id)
        setRequests(mine)
      })
      .catch(() => {})
      .finally(() => setLoadingRequests(false))
  }, [userData?.id])

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => { if (!cancelled) loadRequests() }, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [loadRequests])

  // ── Envoi d'une demande au disciplinaire ───────────────────────────────
  async function submitRequest(student: StudentData) {
    const points = draftPoints[student.id] ?? 0
    const reason = (draftReason[student.id] || '').trim()
    if (points === 0) { toast.error('Choisissez un nombre de points (positif ou négatif)'); return }
    if (reason.length < 5) { toast.error('Raison trop courte (min. 5 caractères)'); return }
    setSubmitting(student.id)
    try {
      const res = await authFetch('/api/discipline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          description: reason,
          points,
          schoolId: getActiveSchoolId(),
          isRequest: true,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`Demande envoyée au disciplinaire pour ${student.firstName} ${student.lastName}`)
        setDraftPoints(prev => ({ ...prev, [student.id]: 0 }))
        setDraftReason(prev => ({ ...prev, [student.id]: '' }))
        loadRequests()
      } else {
        toast.error(j.error || "Erreur lors de l'envoi")
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8" style={{ backgroundColor: IVORY }}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* En-tête */}
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>
              Conduite
            </h1>
            <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>
              Donnez ou retirez des points à un élève pendant le cours — le disciplinaire
              valide chaque demande avant la mise à jour des listes et la notification des parents.
            </p>
          </div>
        </div>

        {/* Nouvelle demande */}
        <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}`, backgroundColor: '#ffffff' }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-2">
              <Shield className="h-4 w-4" style={{ color: GOLD }} aria-hidden="true" />
              <h2 className="text-base font-bold" style={{ color: TEXT_PRIMARY }}>Nouvelle demande</h2>
            </div>
            <AppSelect
              value={selectedClassId}
              onChange={setSelectedClassId}
              disabled={classes.length === 0}
              placeholder="Aucune classe assignée"
              style={{ border: `1px solid ${BORDER}`, backgroundColor: IVORY, color: TEXT_PRIMARY }}
              options={classes.map(c => ({ value: c.id, label: c.name }))}
            />
          </div>

          {classes.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: TEXT_MUTED_LUXE }}>
              Aucune classe ne vous est assignée — contactez l&apos;administration de l&apos;école.
            </p>
          ) : loadingStudents ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} aria-hidden="true" />
            </div>
          ) : students.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: TEXT_MUTED_LUXE }}>Aucun élève dans cette classe.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {students.map(student => {
                const points = draftPoints[student.id] ?? 0
                const reason = draftReason[student.id] || ''
                const isSubmitting = submitting === student.id
                return (
                  <div
                    key={student.id}
                    className="rounded-xl p-3.5 flex flex-col gap-3 lg:flex-row lg:items-center"
                    style={{ border: `1px solid ${BORDER}`, backgroundColor: IVORY }}
                  >
                    <div className="flex items-center gap-3 min-w-0 lg:w-64">
                      <StudentAvatar
                        firstName={student.firstName}
                        lastName={student.lastName}
                        photoUrl={student.photoUrl}
                        size={36}
                        className="text-white shrink-0"
                        style={{ background: `linear-gradient(135deg, ${GOLD}, #c47d0e)` }}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: TEXT_PRIMARY }}>
                          {student.firstName} {student.lastName}
                        </div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{student.matricule}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: TEXT_MUTED_LUXE }}>Points</span>
                      {POINT_PRESETS.map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setDraftPoints(prev => ({ ...prev, [student.id]: p }))}
                          className="h-8 min-w-8 px-2 rounded-lg text-[13px] font-bold transition"
                          style={points === p
                            ? { backgroundColor: p > 0 ? SUCCESS : DANGER, color: '#ffffff' }
                            : { border: `1px solid ${BORDER}`, color: TEXT_PRIMARY, backgroundColor: '#ffffff' }}
                        >
                          {p > 0 ? `+${p}` : p}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={reason}
                      onChange={e => setDraftReason(prev => ({ ...prev, [student.id]: e.target.value }))}
                      placeholder="Raison (ex. : participation remarquable, bavardage…)"
                      maxLength={200}
                      className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
                      style={{ border: `1px solid ${BORDER}`, color: TEXT_PRIMARY, backgroundColor: '#ffffff' }}
                    />

                    <button
                      type="button"
                      onClick={() => submitRequest(student)}
                      disabled={isSubmitting || points === 0 || reason.trim().length < 5}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition disabled:opacity-50"
                      style={{ background: `linear-gradient(135deg, ${GOLD}, #c47d0e)` }}
                    >
                      {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                      Envoyer
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Mes demandes */}
        <div className="rounded-2xl p-5" style={{ border: `1px solid ${BORDER}`, backgroundColor: '#ffffff' }}>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" style={{ color: GOLD }} aria-hidden="true" />
            <h2 className="text-base font-bold" style={{ color: TEXT_PRIMARY }}>Mes demandes</h2>
            <span
              className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
              style={{ backgroundColor: IVORY, color: TEXT_MUTED_LUXE }}
            >
              {requests.length}
            </span>
          </div>

          {loadingRequests ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} aria-hidden="true" />
            </div>
          ) : requests.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: TEXT_MUTED_LUXE }}>
              Aucune demande pour le moment — les demandes envoyées apparaîtront ici avec leur statut.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {requests.slice(0, 10).map(r => {
                const st = STATUS_LABEL[r.status] || { label: r.status, color: TEXT_MUTED_LUXE, bg: IVORY }
                return (
                  <div
                    key={r.id}
                    className="rounded-xl p-3 flex items-center gap-3"
                    style={{ border: `1px solid ${BORDER}`, backgroundColor: IVORY }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate" style={{ color: TEXT_PRIMARY }}>
                        {r.student ? `${r.student.firstName} ${r.student.lastName}` : 'Élève'}
                        <span className="ml-2 font-bold" style={{ color: r.points > 0 ? SUCCESS : DANGER }}>
                          {r.points > 0 ? `+${r.points}` : r.points} pts
                        </span>
                      </div>
                      <div className="text-xs truncate mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>{r.description}</div>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0"
                      style={{ backgroundColor: st.bg, color: st.color }}
                    >
                      {r.status === 'CONFIRMED' && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                      {r.status === 'REJECTED' && <XCircle className="h-3 w-3" aria-hidden="true" />}
                      {st.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
