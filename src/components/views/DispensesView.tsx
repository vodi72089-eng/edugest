'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  HeartPulse,
  Dumbbell,
  Plus,
  Search,
  Loader2,
  X,
  ChevronDown,
  CalendarDays,
  UserRound,
  Stethoscope,
  Inbox,
  CheckCircle2,
  Ban,
} from 'lucide-react'
import { toast } from 'sonner'
import StudentAvatar from '@/components/ui/StudentAvatar'
import { authFetch, useEduGestStore } from '@/lib/store'
import { GOLD, SUCCESS, WARNING, DANGER, ACCENT, IVORY, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Types (API: /api/dispenses, /api/students)
// ---------------------------------------------------------------------------

type DispenseStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED'

interface DispenseStudent {
  id: string
  firstName: string
  lastName: string
  matricule: string
  photoUrl?: string | null
  class?: { id: string; name: string } | null
}

interface Dispense {
  id: string
  student: DispenseStudent
  type?: string | null
  reason: string
  startDate: string
  endDate: string | null
  status: DispenseStatus | string
  note?: string | null
  createdByName?: string | null
  createdAt: string
}

type StatusFilter = 'ALL' | DispenseStatus

interface DispensesViewProps {
  mode?: 'EPS' | 'MEDICAL'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  ACTIVE: { label: 'Active', bg: 'oklch(60% 0.15 145 / 0.12)', fg: SUCCESS },
  EXPIRED: { label: 'Terminée', bg: 'oklch(72% 0.15 65 / 0.16)', fg: 'oklch(55% 0.13 65)' },
  CANCELLED: { label: 'Annulée', bg: 'oklch(58% 0.20 25 / 0.10)', fg: DANGER },
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'ACTIVE', label: 'Actives' },
  { key: 'EXPIRED', label: 'Terminées' },
  { key: 'CANCELLED', label: 'Annulées' },
]

function todayStr(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function formatFrDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function DispensesView({ mode = 'EPS' }: DispensesViewProps) {
  const isMedical = mode === 'MEDICAL'
  const schoolId = useEduGestStore((s) => s.userData?.schoolId ?? '')

  const [dispenses, setDispenses] = useState<Dispense[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  // --- Formulaire « Nouvelle dispense » (MEDICAL uniquement) ---
  const [showForm, setShowForm] = useState(false)
  const [studentQuery, setStudentQuery] = useState('')
  const [studentResults, setStudentResults] = useState<DispenseStudent[]>([])
  const [searching, setSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<DispenseStudent | null>(null)
  const [reason, setReason] = useState('')
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // --- Actions de statut ---
  const [busyId, setBusyId] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchBoxRef = useRef<HTMLDivElement | null>(null)

  // -------------------------------------------------------------------------
  // Chargement des dispensés
  // -------------------------------------------------------------------------

  const fetchDispenses = useCallback(async () => {
    if (!schoolId) {
      setDispenses([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const res = await authFetch(`/api/dispenses?schoolId=${encodeURIComponent(schoolId)}&status=ALL`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setDispenses(Array.isArray(json?.data) ? (json.data as Dispense[]) : [])
    } catch {
      toast.error('Impossible de charger la liste des dispensés.')
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => {
    fetchDispenses()
  }, [fetchDispenses])

  // -------------------------------------------------------------------------
  // Recherche d'élèves (debounce 300 ms, min 2 caractères) — MEDICAL
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isMedical) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (studentQuery.trim().length < 2 || selectedStudent) {
      setStudentResults([])
      setSearching(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await authFetch(
          `/api/students?search=${encodeURIComponent(studentQuery.trim())}&limit=8&schoolId=${encodeURIComponent(schoolId)}`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setStudentResults(Array.isArray(json?.data) ? (json.data as DispenseStudent[]) : [])
        setShowSuggestions(true)
      } catch {
        setStudentResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [studentQuery, isMedical, schoolId, selectedStudent])

  // Ferme les suggestions au clic extérieur
  useEffect(() => {
    if (!isMedical) return
    function onDocClick(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [isMedical])

  function handleSelectStudent(s: DispenseStudent) {
    setSelectedStudent(s)
    setStudentQuery('')
    setStudentResults([])
    setShowSuggestions(false)
  }

  function resetForm() {
    setSelectedStudent(null)
    setStudentQuery('')
    setReason('')
    setStartDate(todayStr())
    setEndDate('')
    setNote('')
  }

  // -------------------------------------------------------------------------
  // Création (MEDICAL)
  // -------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStudent) {
      toast.error('Veuillez sélectionner un élève.')
      return
    }
    if (!reason.trim()) {
      toast.error('Veuillez indiquer le motif de la dispense.')
      return
    }
    if (!startDate) {
      toast.error('Veuillez choisir la date de début.')
      return
    }
    setSubmitting(true)
    try {
      const res = await authFetch('/api/dispenses', {
        method: 'POST',
        body: JSON.stringify({
          studentId: selectedStudent.id,
          reason: reason.trim(),
          startDate: new Date(startDate).toISOString(),
          endDate: endDate ? new Date(endDate).toISOString() : null,
          note: note.trim(),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success('Dispense enregistrée — les professeurs EPS ont été notifiés')
      resetForm()
      setShowForm(false)
      fetchDispenses()
    } catch {
      toast.error("Échec de l'enregistrement. Veuillez réessayer.")
    } finally {
      setSubmitting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Clôture / Annulation (MEDICAL)
  // -------------------------------------------------------------------------

  async function updateStatus(d: Dispense, status: DispenseStatus) {
    setBusyId(d.id)
    try {
      const res = await authFetch(`/api/dispenses/${d.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status, endDate: d.endDate ?? null, note: d.note ?? '' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success(
        status === 'EXPIRED' ? 'Dispense clôturée' : 'Dispense annulée'
      )
      fetchDispenses()
    } catch {
      toast.error('Impossible de mettre à jour cette dispense.')
    } finally {
      setBusyId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Statistiques + filtre
  // -------------------------------------------------------------------------

  const stats = useMemo(() => {
    const active = dispenses.filter((d) => d.status === 'ACTIVE').length
    const ended = dispenses.filter((d) => d.status === 'EXPIRED').length
    return { active, ended, total: dispenses.length }
  }, [dispenses])

  const filtered = useMemo(() => {
    if (statusFilter === 'ALL') return dispenses
    return dispenses.filter((d) => d.status === statusFilter)
  }, [dispenses, statusFilter])

  const inputClass =
    'w-full rounded-xl border border-[oklch(90%_0.01_175)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[oklch(55%_0.15_175/0.25)] transition'
  const labelClass = 'text-[11px] font-bold uppercase tracking-wide mb-1.5 block'

  const HeaderIcon = isMedical ? HeartPulse : Dumbbell

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center gap-2.5">
        <span
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: isMedical ? 'oklch(58% 0.20 25 / 0.10)' : 'oklch(95% 0.04 175)', color: isMedical ? DANGER : ACCENT }}
        >
          <HeaderIcon className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold tracking-tight" style={{ color: TEXT_PRIMARY }}>
            {isMedical ? 'Élèves dispensés (EPS)' : 'Mes élèves dispensés'}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>
            {isMedical
              ? "Vos dispensés sont automatiquement communiqués aux professeurs d'EPS."
              : "Liste transmise par le service médical de l'école."}
          </p>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-3 sm:p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXT_MUTED_LUXE }}>Actives</p>
          <p className="text-xl sm:text-2xl font-extrabold mt-1" style={{ color: SUCCESS }}>{stats.active}</p>
        </div>
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-3 sm:p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXT_MUTED_LUXE }}>Terminées</p>
          <p className="text-xl sm:text-2xl font-extrabold mt-1" style={{ color: 'oklch(55% 0.13 65)' }}>{stats.ended}</p>
        </div>
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-3 sm:p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXT_MUTED_LUXE }}>Total</p>
          <p className="text-xl sm:text-2xl font-extrabold mt-1" style={{ color: TEXT_PRIMARY }}>{stats.total}</p>
        </div>
      </div>

      {/* Formulaire de création — MEDICAL uniquement */}
      {isMedical && (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-4 sm:p-6">
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-2.5">
              <span
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'oklch(58% 0.20 25 / 0.10)', color: DANGER }}
              >
                {showForm ? <Stethoscope className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </span>
              <span>
                <span className="text-sm font-extrabold tracking-tight block" style={{ color: TEXT_PRIMARY }}>
                  Nouvelle dispense
                </span>
                <span className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>
                  Enregistrer un élève dispensé d&apos;EPS
                </span>
              </span>
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showForm ? 'rotate-180' : ''}`} style={{ color: TEXT_MUTED_LUXE }} />
          </button>

          {showForm && (
            <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-[oklch(92%_0.01_175)] space-y-3">
              {/* Recherche d'élève + autocomplete custom */}
              <div className="relative" ref={searchBoxRef}>
                <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
                  Élève concerné
                </label>
                {selectedStudent ? (
                  <div className="flex items-center gap-2.5 rounded-xl border border-[oklch(88%_0.02_175)] bg-[oklch(98%_0.005_175)] px-3 py-2">
                    <StudentAvatar
                      firstName={selectedStudent.firstName}
                      lastName={selectedStudent.lastName}
                      photoUrl={selectedStudent.photoUrl}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate" style={{ color: TEXT_PRIMARY }}>
                        {selectedStudent.firstName} {selectedStudent.lastName}
                      </p>
                      <p className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>
                        {selectedStudent.matricule}
                        {selectedStudent.class?.name ? ` · ${selectedStudent.class.name}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedStudent(null)}
                      className="shrink-0 rounded-lg p-1 hover:bg-[oklch(94%_0.008_175)]"
                      title="Changer d'élève"
                    >
                      <X className="w-4 h-4" style={{ color: TEXT_MUTED_LUXE }} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: TEXT_MUTED_LUXE }} />
                      <input
                        type="text"
                        value={studentQuery}
                        onChange={(e) => setStudentQuery(e.target.value)}
                        onFocus={() => studentResults.length > 0 && setShowSuggestions(true)}
                        placeholder="Rechercher un élève (nom, matricule…) — min. 2 caractères"
                        className={`${inputClass} pl-9 pr-9`}
                      />
                      {searching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" style={{ color: TEXT_MUTED_LUXE }} />
                      )}
                    </div>
                    {showSuggestions && (
                      <div className="absolute z-20 left-0 right-0 mt-1.5 rounded-xl border border-[oklch(90%_0.01_175)] bg-white shadow-lg overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                        {studentResults.length === 0 ? (
                          <p className="px-3 py-3 text-xs text-center" style={{ color: TEXT_MUTED_LUXE }}>
                            Aucun élève trouvé
                          </p>
                        ) : (
                          studentResults.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleSelectStudent(s)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[oklch(97%_0.008_175)] transition-colors"
                            >
                              <StudentAvatar
                                firstName={s.firstName}
                                lastName={s.lastName}
                                photoUrl={s.photoUrl}
                                size={30}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold truncate" style={{ color: TEXT_PRIMARY }}>
                                  {s.firstName} {s.lastName}
                                </p>
                                <p className="text-[10px]" style={{ color: TEXT_MUTED_LUXE }}>
                                  {s.matricule}
                                  {s.class?.name ? ` · ${s.class.name}` : ''}
                                </p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
                  Motif <span style={{ color: DANGER }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex. : entorse à la cheville, asthme, opération…"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
                    Date de début
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
                    Date de fin (optionnel)
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
                  Note (optionnel)
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Précisions pour le professeur d'EPS…"
                  className={`${inputClass} resize-none`}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                style={{ background: 'oklch(15% 0.02 250)' }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {submitting ? 'Enregistrement…' : 'Enregistrer la dispense'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Filtres de statut */}
      <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 -mx-1 px-1">
        {FILTERS.map((f) => {
          const active = statusFilter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-150 border ${
                active ? 'border-transparent shadow-sm' : 'bg-white hover:bg-[oklch(97%_0.005_175)]'
              }`}
              style={active ? { background: 'oklch(15% 0.02 250)', color: IVORY } : { borderColor: 'oklch(90%_0.01_175)', color: TEXT_MUTED_LUXE }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Liste des dispensés */}
      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-4">
              <div className="animate-pulse flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-[oklch(93%_0.01_175)] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 rounded bg-[oklch(93%_0.01_175)]" />
                  <div className="h-3 w-2/3 rounded bg-[oklch(93%_0.01_175)]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-8 text-center">
          <Inbox className="w-8 h-8 mx-auto mb-2" style={{ color: TEXT_MUTED_LUXE }} />
          <p className="text-sm font-bold" style={{ color: TEXT_PRIMARY }}>Aucune dispense enregistrée</p>
          <p className="text-xs mt-1" style={{ color: TEXT_MUTED_LUXE }}>
            {isMedical
              ? 'Utilisez le formulaire ci-dessus pour enregistrer un élève dispensé.'
              : 'Les dispensés du service médical apparaîtront ici automatiquement.'}
          </p>
        </div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto custom-scrollbar pr-1 space-y-2.5">
          {filtered.map((d) => {
            const meta = STATUS_META[d.status] ?? STATUS_META.ACTIVE
            const busy = busyId === d.id
            return (
              <div
                key={d.id}
                className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <StudentAvatar
                    firstName={d.student.firstName}
                    lastName={d.student.lastName}
                    photoUrl={d.student.photoUrl}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold tracking-tight truncate" style={{ color: TEXT_PRIMARY }}>
                          {d.student.firstName} {d.student.lastName}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono" style={{ color: TEXT_MUTED_LUXE }}>
                            <UserRound className="w-3 h-3" />
                            {d.student.matricule}
                          </span>
                          {d.student.class?.name && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                              style={{ background: 'oklch(95% 0.04 175)', color: ACCENT }}
                            >
                              {d.student.class.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: meta.bg, color: meta.fg }}
                      >
                        {meta.label}
                      </span>
                    </div>

                    {/* Motif */}
                    <p className="mt-2 text-xs font-semibold flex items-start gap-1.5" style={{ color: TEXT_PRIMARY }}>
                      <HeartPulse className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: DANGER }} />
                      {d.reason}
                    </p>

                    {/* Période */}
                    <p className="mt-1 text-[11px] flex items-center gap-1.5" style={{ color: TEXT_MUTED_LUXE }}>
                      <CalendarDays className="w-3 h-3 shrink-0" />
                      du {formatFrDate(d.startDate)} au {formatFrDate(d.endDate)}
                    </p>

                    {/* Note */}
                    {d.note && (
                      <p className="mt-1.5 text-[11px] italic rounded-lg bg-[oklch(97%_0.008_175)] px-2.5 py-1.5" style={{ color: TEXT_MUTED_LUXE }}>
                        {d.note}
                      </p>
                    )}

                    <p className="mt-2 text-[10px]" style={{ color: TEXT_MUTED_LUXE }}>
                      Déclarée par {d.createdByName || '—'} · {formatFrDate(d.createdAt)}
                    </p>

                    {/* Actions — MEDICAL uniquement */}
                    {isMedical && d.status === 'ACTIVE' && (
                      <div className="mt-2.5 flex gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => updateStatus(d, 'EXPIRED')}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition hover:opacity-85 disabled:opacity-50"
                          style={{ background: WARNING, color: IVORY }}
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Clôturer
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(d, 'CANCELLED')}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition hover:opacity-85 disabled:opacity-50"
                          style={{ background: 'oklch(58% 0.20 25 / 0.10)', color: DANGER }}
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                          Annuler
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Note discrète de liaison EPS ↔ médical */}
      <p className="text-[11px] flex items-center gap-1.5 px-1" style={{ color: TEXT_MUTED_LUXE }}>
        <Stethoscope className="w-3 h-3 shrink-0" style={{ color: GOLD }} />
        {isMedical
          ? "Chaque dispense enregistrée est visible immédiatement par les professeurs d'EPS concernés."
          : "Cette liste est gérée par le service médical — elle est en lecture seule."}
      </p>
    </div>
  )
}
