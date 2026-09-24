'use client'

// ─── Rapports d'activité — vue autonome (TOUS les comptes) ──────────────────
//  - GET /api/reports?schoolId=…&days=1|3|4|7 → rapport JSON SENSIBLE AU RÔLE
//    (super admin : TOUJOURS schoolId=getActiveSchoolId() ; rôles école :
//    param omis, le serveur scelle sur user.schoolId)
//  - POST /api/reports/send { schoolId, days } → génère le TEXTE WhatsApp et
//    l'envoie via l'agent WhatsApp de l'école au personnel administratif
//    (SCHOOL_ADMIN + DIRECTION_*). Réponse { data: { text, sent, warning? } } :
//    si sent=false (ou appelant SUPER_ADMIN_GLOBAL), modale « Partager » avec
//    copie + lien wa.me en secours.
//  - Aucune donnée personnelle d'élève : compteurs et agrégats uniquement.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useEduGestStore, authFetch, getActiveSchoolId } from '@/lib/store'
import SearchAutocomplete from '@/components/views/SearchAutocomplete'
import { getRoleSealLabel } from '@/lib/helpers'
import { GOLD, GOLD_SOFT, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY, SUCCESS, SUCCESS_SOFT, DANGER, WARNING } from '@/lib/constants'
import { formatAmount } from '@/lib/currency-display'
import {
  FileText, Send, Copy, Users, Wallet, ShieldAlert, GraduationCap,
  Megaphone, CalendarDays, Trophy, Loader2, X, Share2, CheckCircle2,
  UserCheck, AlertTriangle, ClipboardCheck, FileDown, Bot, Clock3, Play,
  Trash2, Power, Plus,
} from 'lucide-react'
import { toast } from 'sonner'

interface ReportData {
  school: { id: string; name: string; shortName: string }
  period: { from: string; to: string; days: number }
  generatedAt: string
  role: string
  viewerName: string
  cycle?: string
  note?: string
  students?: { total: number; classesCount: number; byClass: { className: string; count: number }[] }
  personnel?: { teachers: number }
  payments?: { transactions: number; collected: number; expected: number; unpaid: number }
  discipline?: { incidents: number; positives: number; convocations: number; bySeverity: Record<string, number> }
  attendance?: { present: number; absent: number; late: number; total: number; rate: number | null }
  topClasses?: { className: string; rate: number; total: number }[]
  communications?: { sent: number }
  events?: { title: string; startAt: string; category: string; location: string | null }[]
  teacher?: {
    classNames: string[]
    attendance: { present: number; absent: number; late: number; total: number; rate: number | null }
    homework: { mine: number; forClasses: number }
  }
}

interface SendResult {
  text: string
  sent: boolean
  sentCount?: number
  failedCount?: number
  recipientCount?: number
  agentConnected?: boolean
  warning?: string
}

interface ScheduleItem {
  id: string
  schoolId: string
  intervalDays: number
  freqLabel: string
  hour: number
  minute: number
  timeLabel: string
  recipients: string[]
  sendPdf: boolean
  isActive: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  lastStatus: string | null
  lastDetail: string | null
  runCount: number
  createdBy: string
  createdByName: string
}

const FREQ_OPTIONS = [
  { days: 1, label: 'Chaque jour' },
  { days: 2, label: 'Tous les 2 jours' },
  { days: 3, label: 'Tous les 3 jours' },
  { days: 7, label: 'Chaque semaine' },
]

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  success: { label: 'Dernier envoi : réussi', bg: SUCCESS_SOFT, color: SUCCESS },
  partial: { label: 'Dernier envoi : partiel', bg: GOLD_SOFT, color: GOLD },
  failed: { label: 'Dernier envoi : échec', bg: 'oklch(95% 0.04 25)', color: DANGER },
  agent_offline: { label: 'Agent WhatsApp hors ligne', bg: 'oklch(95% 0.04 65)', color: WARNING },
}

const PERIODS = [
  { days: 1, label: 'Aujourd\'hui' },
  { days: 3, label: '3 jours' },
  { days: 4, label: '4 jours' },
  { days: 7, label: '7 jours' },
]

function fmtNum(n: number): string {
  return (Number(n) || 0).toLocaleString('fr-FR')
}

function fmtDate(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}

function fmtEventDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
  } catch {
    return iso
  }
}

function StatCard({ icon: Icon, label, value, bg, color }: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  label: string
  value: string
  bg: string
  color: string
}) {
  return (
    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: bg }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-extrabold leading-tight truncate" style={{ color: TEXT_PRIMARY }}>{value}</div>
        <div className="text-[11px] truncate" style={{ color: TEXT_MUTED_LUXE }}>{label}</div>
      </div>
    </div>
  )
}

export default function ReportsView() {
  const { userRole, userData, setActiveSchoolId } = useEduGestStore()
  const isSAG = userRole === 'SUPER_ADMIN_GLOBAL'
  const isParent = userRole === 'PARENT'
  // Automatisation agentique : réservée au propriétaire (SCHOOL_ADMIN) et au super admin
  const canAutomate = userRole === 'SCHOOL_ADMIN' || isSAG

  const [days, setDays] = useState(7)
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [shareText, setShareText] = useState<string | null>(null)
  const [lastWarning, setLastWarning] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  // ── Automatisation ──
  const [schedules, setSchedules] = useState<ScheduleItem[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(true)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [autoFreq, setAutoFreq] = useState(1)
  const [autoTime, setAutoTime] = useState('08:00')
  const [autoRecipients, setAutoRecipients] = useState('')
  const [recipientsTouched, setRecipientsTouched] = useState(false)
  const [autoPdf, setAutoPdf] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)

  const schoolId = getActiveSchoolId()
  const activeSchoolId = useMemo(() => schoolId, [schoolId])

  // Aucun setState synchrone dans le corps de l'effet : tout passe par les
  // callbacks .then/.finally (règle react-hooks/set-state-in-effect).
  const load = useCallback((periodDays: number) => {
    const params = new URLSearchParams({ days: String(periodDays) })
    if (activeSchoolId) params.set('schoolId', activeSchoolId)
    return authFetch(`/api/reports?${params}`)
      .then(async res => {
        const j = await res.json().catch(() => ({}))
        if (res.ok) {
          setReport(j.data || null)
        } else {
          setReport(null)
          toast.error(j.error || 'Erreur lors de la génération du rapport')
        }
      })
      .catch(() => toast.error('Erreur de connexion'))
      .finally(() => setLoading(false))
  }, [isSAG, activeSchoolId])

  useEffect(() => {
    if (isSAG && !activeSchoolId) return
    load(days)
  }, [load, days, isSAG, activeSchoolId])

  // ── Sélecteur d'école inline (SAG sans école active) ─────────────────────
  const [pickerSchools, setPickerSchools] = useState<{ id: string; name: string; shortName?: string; city?: string }[]>([])
  const [schoolPickerQuery, setSchoolPickerQuery] = useState('')

  useEffect(() => {
    if (!isSAG) return
    authFetch('/api/schools?limit=100')
      .then(async r => { const j = await r.json().catch(() => ({})); if (j.data) setPickerSchools(j.data) })
      .catch(() => {})
  }, [isSAG])

  // ── Automatisation : chargement des programmes de l'école active ───────
  // (aucun setState synchrone dans l'effet — règle react-hooks ; l'état de
  // chargement initial est simplement `true`)
  const loadSchedules = useCallback(() => {
    if (!canAutomate) return
    const params = new URLSearchParams()
    if (activeSchoolId) params.set('schoolId', activeSchoolId)
    authFetch(`/api/reports/schedule?${params}`)
      .then(async res => {
        const j = await res.json().catch(() => ({}))
        if (res.ok) setSchedules(j.data || [])
      })
      .catch(() => {})
      .finally(() => setLoadingSchedules(false))
  }, [canAutomate, activeSchoolId])

  useEffect(() => {
    if (isSAG && !activeSchoolId) return
    loadSchedules()
  }, [loadSchedules, isSAG, activeSchoolId])

  // Pré-remplissage sans effet : le téléphone du compte courant sert de
  // valeur affichée tant que l'utilisateur n'a rien saisi.
  const effectiveRecipients =
    autoRecipients || (!recipientsTouched && schedules.length === 0 ? userData?.phone || '' : '')

  function parseRecipientsInput(raw: string): string[] {
    return raw.split(/[,;\/\s]+/).map(s => s.trim()).filter(s => s.length >= 6)
  }

  async function saveSchedule() {
    const recipients = parseRecipientsInput(effectiveRecipients)
    if (!recipients.length) { toast.error('Ajoutez au moins un numéro WhatsApp destinataire'); return }
    const [hh, mm] = autoTime.split(':').map(x => Number.parseInt(x, 10))
    setSavingSchedule(true)
    try {
      const res = await authFetch('/api/reports/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId || undefined,
          ...(activeSchoolId ? { schoolId: activeSchoolId } : {}),
          intervalDays: autoFreq,
          hour: Number.isFinite(hh) ? hh : 8,
          minute: Number.isFinite(mm) ? mm : 0,
          recipients,
          sendPdf: autoPdf,
          isActive: true,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error || 'Erreur lors de l\'enregistrement'); return }
      toast.success(editingId ? 'Automatisation mise à jour' : `Automatisation activée — ${j.data?.freqLabel || ''} à ${j.data?.timeLabel || ''}`)
      setEditingId(null)
      loadSchedules()
    } catch {
      toast.error('Erreur de connexion')
    }
    setSavingSchedule(false)
  }

  async function toggleSchedule(s: ScheduleItem) {
    try {
      const res = await authFetch('/api/reports/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: s.id,
          ...(activeSchoolId ? { schoolId: activeSchoolId } : {}),
          intervalDays: s.intervalDays,
          hour: s.hour,
          minute: s.minute,
          recipients: s.recipients,
          sendPdf: s.sendPdf,
          isActive: !s.isActive,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error || 'Erreur'); return }
      toast.success(!s.isActive ? 'Automatisation activée' : 'Automatisation mise en pause')
      loadSchedules()
    } catch { toast.error('Erreur de connexion') }
  }

  async function runNow(s: ScheduleItem) {
    setRunningId(s.id)
    try {
      const res = await authFetch('/api/reports/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', id: s.id, ...(activeSchoolId ? { schoolId: activeSchoolId } : {}) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error || 'Erreur lors de l\'exécution'); return }
      const run = j.data?.run || {}
      if (run.status === 'success') toast.success(run.detail || 'Rapport envoyé !')
      else if (run.status === 'partial') toast.warning(run.detail || 'Envoi partiel')
      else toast.error(run.detail || 'Envoi non abouti')
      loadSchedules()
    } catch { toast.error('Erreur de connexion') }
    setRunningId(null)
  }

  async function deleteSchedule(s: ScheduleItem) {
    try {
      const params = new URLSearchParams({ id: s.id })
      const res = await authFetch(`/api/reports/schedule?${params}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error || 'Erreur'); return }
      toast.success('Automatisation supprimée')
      if (editingId === s.id) setEditingId(null)
      loadSchedules()
    } catch { toast.error('Erreur de connexion') }
  }

  function editSchedule(s: ScheduleItem) {
    setEditingId(s.id)
    setAutoFreq(s.intervalDays)
    setAutoTime(s.timeLabel)
    setAutoRecipients(s.recipients.join(', '))
    setAutoPdf(s.sendPdf)
    toast.info('Modification en cours — ajustez puis enregistrez')
  }

  async function downloadPdf() {
    if (isSAG && !activeSchoolId) { toast.error('Sélectionnez d\'abord une école'); return }
    setPdfLoading(true)
    try {
      const params = new URLSearchParams({ days: String(days) })
      if (activeSchoolId) params.set('schoolId', activeSchoolId)
      const res = await authFetch(`/api/reports/pdf?${params}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error || 'Erreur lors de la génération du PDF')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rapport-edugest-${report?.period.to || new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('PDF téléchargé')
    } catch {
      toast.error('Erreur de connexion')
    }
    setPdfLoading(false)
  }

  async function handleSend() {
    if (isSAG && !activeSchoolId) { toast.error('Sélectionnez d\'abord une école'); return }
    setSending(true)
    setLastWarning(null)
    try {
      const res = await authFetch('/api/reports/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(activeSchoolId ? { schoolId: activeSchoolId } : {}), days }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j.error || 'Erreur lors de l\'envoi du rapport')
      } else {
        const data: SendResult = j.data
        if (data.sent) {
          toast.success(`Rapport envoyé — ${data.sentCount} message${(data.sentCount || 0) > 1 ? 's' : ''} WhatsApp`)
        }
        if (data.warning) {
          setLastWarning(data.warning)
          toast.warning(data.warning)
        }
        // Modale « Partager » : envoi raté / agent déconnecté, ou super admin
        // qui partage le rapport via le WhatsApp de l'app.
        if (data.text && (!data.sent || isSAG)) {
          setShareText(data.text)
        }
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setSending(false)
  }

  async function copyShareText() {
    if (!shareText) return
    try {
      await navigator.clipboard.writeText(shareText)
      toast.success('Texte copié — collez-le dans WhatsApp')
    } catch {
      toast.error('Impossible de copier automatiquement — sélectionnez le texte manuellement')
    }
  }

  const attendance = report?.attendance
  const teacherAttendance = report?.teacher?.attendance
  const rateForBar = attendance?.rate
  const periodLabel = report
    ? `${fmtDate(report.period.from)} → ${fmtDate(report.period.to)}`
    : ''

  // Garde d'accès : les parents n'ont pas accès aux rapports internes.
  if (isParent) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Rapports</h1>
        </div>
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-10 shadow-sm text-center">
          <div className="w-12 h-12 rounded-2xl grid place-items-center mx-auto mb-4" style={{ background: 'oklch(95% 0.04 25)' }}>
            <ShieldAlert size={22} style={{ color: DANGER }} />
          </div>
          <p className="font-semibold mb-1" style={{ color: TEXT_PRIMARY }}>Accès non autorisé</p>
          <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Les rapports d&apos;activité sont réservés au personnel de l&apos;école.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Rapports</h1>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ background: GOLD_SOFT, color: GOLD }}>Activité de l&apos;école</span>
        <span className="text-xs hidden sm:block" style={{ color: TEXT_MUTED_LUXE }}>Compteurs et agrégats — aucune donnée personnelle</span>
      </div>

      {isSAG && !activeSchoolId ? (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-10 shadow-sm text-center">
          <FileText size={28} className="mx-auto mb-2 opacity-30" style={{ color: TEXT_MUTED_LUXE }} />
          <p className="font-semibold mb-1" style={{ color: TEXT_PRIMARY }}>Aucune école sélectionnée</p>
          <p className="text-sm mb-5" style={{ color: TEXT_MUTED_LUXE }}>
            Choisissez une école — ci-dessous, ou dans la barre latérale (« École active ») — pour générer son rapport.
          </p>
          <div className="max-w-sm mx-auto text-left">
            <SearchAutocomplete
              placeholder="Rechercher une école…"
              items={(() => {
                const q = schoolPickerQuery.trim().toLowerCase()
                const all = q
                  ? pickerSchools.filter(s => `${s.name} ${s.shortName || ''} ${s.city || ''}`.toLowerCase().includes(q))
                  : pickerSchools
                return all.map(s => ({ id: s.id, label: s.name, sublabel: [s.shortName, s.city].filter(Boolean).join(' · ') }))
              })()}
              selectedId={null}
              onSelect={(item) => { setActiveSchoolId(item.id); setSchoolPickerQuery('') }}
              onClear={() => setSchoolPickerQuery('')}
              searchQuery={schoolPickerQuery}
              onSearchChange={setSchoolPickerQuery}
              loading={pickerSchools.length === 0}
              emptyMessage="Aucune école ne correspond"
              itemTypeName="école"
            />
          </div>
        </div>
      ) : (
        <>
          {/* ── Période + envoi ─────────────────────────────────────────── */}
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 mr-2">
                <ClipboardCheck size={16} style={{ color: GOLD }} />
                <h3 className="font-semibold text-[15px]" style={{ color: TEXT_PRIMARY }}>Période du rapport</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {PERIODS.map(p => (
                  <button
                    key={p.days}
                    onClick={() => { setDays(p.days); setLoading(true) }}
                    className="px-3.5 py-2 rounded-xl text-[13px] font-semibold border transition"
                    style={days === p.days
                      ? { background: GOLD, color: 'white', borderColor: GOLD }
                      : { background: 'white', color: TEXT_MUTED_LUXE, borderColor: 'oklch(90% 0.01 175)' }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button onClick={downloadPdf} disabled={pdfLoading || loading} className="ml-auto px-4 py-2 rounded-xl text-[13px] font-semibold border inline-flex items-center gap-2 disabled:opacity-50 transition hover:bg-[oklch(72%_0.15_65_/_0.06)]" style={{ borderColor: 'rgba(245,166,35,0.5)', color: TEXT_PRIMARY }}>
                {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                Télécharger le PDF
              </button>
              <button onClick={handleSend} disabled={sending || loading} className="edu-gold-cta px-4 py-2 rounded-xl text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                {sending ? <div className="h-3.5 w-3.5 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Send size={13} />}
                Envoyer sur WhatsApp
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>
              <span className="px-2 py-1 rounded-full inline-flex items-center gap-1" style={{ background: IVORY }}>
                <UserCheck size={11} />
                Rapport scellé sur votre rôle : <strong style={{ color: TEXT_PRIMARY }}>{getRoleSealLabel((report?.role || userRole) as string)}</strong>
              </span>
              {report?.cycle && (
                <span className="px-2 py-1 rounded-full" style={{ background: GOLD_SOFT, color: GOLD }}>Cycle {report.cycle.toLowerCase()}</span>
              )}
              {report?.note && <span>{report.note}</span>}
              {report && <span>Période : {periodLabel}</span>}
              {lastWarning && (
                <span className="px-2 py-1 rounded-full inline-flex items-center gap-1" style={{ background: 'oklch(95% 0.04 65)', color: WARNING }}>
                  <AlertTriangle size={11} />
                  {lastWarning}
                </span>
              )}
            </div>
          </div>

          {/* ── Automatisation agentique des rapports (propriétaire / super admin) ── */}
          {canAutomate && (
            <div className="bg-white border rounded-2xl p-5 shadow-sm mb-6" style={{ borderColor: 'rgba(245,166,35,0.45)' }}>
              <div className="flex flex-wrap items-center gap-2.5 mb-1">
                <div className="w-9 h-9 rounded-xl grid place-items-center text-white shrink-0" style={{ background: `linear-gradient(135deg, ${GOLD}, #c47d0e)`, boxShadow: '0 4px 10px rgba(245,166,35,0.35)' }}>
                  <Bot size={17} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[15px]" style={{ color: TEXT_PRIMARY }}>Automatisation des rapports</h3>
                  <p className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>
                    L&apos;agent EduGest envoie le rapport tout seul : texte WhatsApp + PDF détaillé au design de l&apos;app, à l&apos;heure exacte choisie (heure locale).
                  </p>
                </div>
              </div>

              {/* Formulaire */}
              <div className="mt-4 rounded-xl p-4 border border-[oklch(90%_0.01_175)]" style={{ background: IVORY }}>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Clock3 size={14} style={{ color: GOLD }} />
                  <span className="text-[12px] font-semibold" style={{ color: TEXT_PRIMARY }}>Fréquence d&apos;envoi</span>
                  <div className="flex flex-wrap gap-1.5 ml-auto">
                    {FREQ_OPTIONS.map(f => (
                      <button
                        key={f.days}
                        onClick={() => setAutoFreq(f.days)}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition"
                        style={autoFreq === f.days
                          ? { background: GOLD, color: 'white', borderColor: GOLD }
                          : { background: 'white', color: TEXT_MUTED_LUXE, borderColor: 'oklch(90% 0.01 175)' }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[130px_1fr_auto] gap-2.5 items-end">
                  <div>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: TEXT_MUTED_LUXE }}>Heure d&apos;envoi</label>
                    <input
                      type="time"
                      value={autoTime}
                      onChange={e => setAutoTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[oklch(90%_0.01_175)] text-[13px] bg-white outline-none focus:border-[#f5a623]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: TEXT_MUTED_LUXE }}>
                      Destinataires WhatsApp (numéros séparés par virgule ou espace)
                    </label>
                    <input
                      type="text"
                      value={effectiveRecipients}
                      onChange={e => { setAutoRecipients(e.target.value); setRecipientsTouched(true) }}
                      placeholder="+243 81 234 56 78, +243 99 888 77 66"
                      className="w-full px-3 py-2 rounded-lg border border-[oklch(90%_0.01_175)] text-[13px] bg-white outline-none focus:border-[#f5a623]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[12px] cursor-pointer select-none" style={{ color: TEXT_PRIMARY }}>
                      <input type="checkbox" checked={autoPdf} onChange={e => setAutoPdf(e.target.checked)} className="accent-[#f5a623] w-4 h-4" />
                      Joindre le PDF
                    </label>
                    <button onClick={saveSchedule} disabled={savingSchedule} className="edu-gold-cta px-4 py-2 rounded-xl text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap">
                      {savingSchedule ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      {editingId ? 'Mettre à jour' : 'Activer'}
                    </button>
                    {editingId && (
                      <button onClick={() => setEditingId(null)} className="px-3 py-2 rounded-xl text-[12px] font-semibold border" style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_MUTED_LUXE }}>
                        Annuler
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Liste des programmes */}
              <div className="mt-3 space-y-2">
                {loadingSchedules ? (
                  <div className="text-center py-3 text-[12px]" style={{ color: TEXT_MUTED_LUXE }}>
                    <Loader2 size={14} className="inline animate-spin mr-1" /> Chargement des automatisations…
                  </div>
                ) : schedules.length === 0 ? (
                  <p className="text-center text-[12px] py-2" style={{ color: TEXT_MUTED_LUXE }}>
                    Aucune automatisation pour l&apos;instant — configurez la première ci-dessus.
                  </p>
                ) : (
                  schedules.map(s => {
                    const meta = s.lastStatus ? STATUS_META[s.lastStatus] : null
                    return (
                      <div key={s.id} className="rounded-xl border border-[oklch(90%_0.01_175)] px-4 py-3 flex flex-wrap items-center gap-3">
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: s.isActive ? SUCCESS_SOFT : IVORY, color: s.isActive ? SUCCESS : TEXT_MUTED_LUXE }}>
                          {s.isActive ? '● Actif' : '○ En pause'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold truncate" style={{ color: TEXT_PRIMARY }}>
                            {s.freqLabel} à {s.timeLabel}{s.sendPdf ? ' · PDF joint' : ''}
                          </p>
                          <p className="text-[11px] truncate" style={{ color: TEXT_MUTED_LUXE }}>
                            Vers : {s.recipients.join(', ')}
                            {s.nextRunAt && s.isActive ? ` · Prochain envoi : ${new Date(s.nextRunAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                            {s.runCount > 0 ? ` · ${s.runCount} envoi${s.runCount > 1 ? 's' : ''}` : ''}
                          </p>
                          {meta && (
                            <p className="text-[10.5px] mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }} title={s.lastDetail || ''}>
                              <AlertTriangle size={9} /> {meta.label}{s.lastDetail ? ` — ${s.lastDetail}` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 ml-auto shrink-0">
                          <button onClick={() => runNow(s)} disabled={runningId === s.id} title="Exécuter maintenant (test)" className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border inline-flex items-center gap-1 disabled:opacity-50" style={{ borderColor: 'rgba(245,166,35,0.5)', color: TEXT_PRIMARY }}>
                            {runningId === s.id ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                            Exécuter
                          </button>
                          <button onClick={() => toggleSchedule(s)} title={s.isActive ? 'Mettre en pause' : 'Activer'} className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border" style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_MUTED_LUXE }}>
                            <Power size={12} />
                          </button>
                          <button onClick={() => editSchedule(s)} title="Modifier" className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border" style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_MUTED_LUXE }}>
                            <ClipboardCheck size={12} />
                          </button>
                          <button onClick={() => deleteSchedule(s)} title="Supprimer" className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border" style={{ borderColor: 'oklch(95% 0.04 25)', color: DANGER }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-10 shadow-sm text-center text-sm" style={{ color: TEXT_MUTED_LUXE }}>
              <Loader2 size={20} className="mx-auto mb-2 animate-spin" style={{ color: GOLD }} />
              Génération du rapport…
            </div>
          ) : !report ? (
            <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-10 shadow-sm text-center text-sm" style={{ color: TEXT_MUTED_LUXE }}>
              Aucune donnée disponible pour cette période.
            </div>
          ) : (
            <div className="space-y-6">
              {/* ── Vue professeur ───────────────────────────────────────── */}
              {report.teacher && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard icon={GraduationCap} label="Mes classes" value={String(report.teacher.classNames.length)} bg={GOLD_SOFT} color={GOLD} />
                    <StatCard icon={CheckCircle2} label="Taux de présence (mes classes)" value={teacherAttendance?.rate !== null && teacherAttendance?.rate !== undefined ? `${teacherAttendance.rate}%` : '—'} bg={SUCCESS_SOFT} color={SUCCESS} />
                    <StatCard icon={FileText} label="Devoirs publiés (moi)" value={fmtNum(report.teacher.homework.mine)} bg={IVORY} color={TEXT_PRIMARY} />
                    <StatCard icon={ClipboardCheck} label="Devoirs (toutes mes classes)" value={fmtNum(report.teacher.homework.forClasses)} bg={IVORY} color={TEXT_PRIMARY} />
                  </div>
                  {report.teacher.classNames.length > 0 && (
                    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <GraduationCap size={15} style={{ color: GOLD }} />
                        <h3 className="font-semibold text-[14px]" style={{ color: TEXT_PRIMARY }}>Mes classes occupées</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {report.teacher.classNames.map(n => (
                          <span key={n} className="px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: GOLD_SOFT, color: GOLD }}>{n}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── Effectifs ────────────────────────────────────────────── */}
              {report.students && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  <StatCard icon={Users} label="Élèves actifs" value={fmtNum(report.students.total)} bg={GOLD_SOFT} color={GOLD} />
                  <StatCard icon={GraduationCap} label="Classes" value={fmtNum(report.students.classesCount)} bg={IVORY} color={TEXT_PRIMARY} />
                  <StatCard icon={UserCheck} label="Professeurs" value={fmtNum(report.personnel?.teachers || 0)} bg={SUCCESS_SOFT} color={SUCCESS} />
                </div>
              )}

              {/* ── Paiements ────────────────────────────────────────────── */}
              {report.payments && (
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 flex items-center gap-2 border-b border-[oklch(90%_0.01_175)]" style={{ background: IVORY }}>
                    <Wallet size={15} style={{ color: GOLD }} />
                    <h3 className="font-semibold text-[14px]" style={{ color: TEXT_PRIMARY }}>Paiements de la période</h3>
                  </div>
                  <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard icon={Wallet} label="Transactions enregistrées" value={fmtNum(report.payments.transactions)} bg={GOLD_SOFT} color={GOLD} />
                    <StatCard icon={CheckCircle2} label="Total encaissé" value={formatAmount(report.payments.collected)} bg={SUCCESS_SOFT} color={SUCCESS} />
                    <StatCard icon={FileText} label="Total attendu" value={formatAmount(report.payments.expected)} bg={IVORY} color={TEXT_PRIMARY} />
                    <StatCard icon={AlertTriangle} label="Impayés actuels" value={fmtNum(report.payments.unpaid)} bg="oklch(95% 0.04 25)" color={DANGER} />
                  </div>
                </div>
              )}

              {/* ── Discipline ───────────────────────────────────────────── */}
              {report.discipline && (
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 flex items-center gap-2 border-b border-[oklch(90%_0.01_175)]" style={{ background: IVORY }}>
                    <ShieldAlert size={15} style={{ color: GOLD }} />
                    <h3 className="font-semibold text-[14px]" style={{ color: TEXT_PRIMARY }}>Discipline de la période</h3>
                  </div>
                  <div className="p-5 grid grid-cols-3 gap-3">
                    <StatCard icon={AlertTriangle} label="Incidents / sanctions" value={fmtNum(report.discipline.incidents)} bg="oklch(95% 0.04 25)" color={DANGER} />
                    <StatCard icon={CheckCircle2} label="Points positifs" value={fmtNum(report.discipline.positives)} bg={SUCCESS_SOFT} color={SUCCESS} />
                    <StatCard icon={Megaphone} label="Convocations" value={fmtNum(report.discipline.convocations)} bg={GOLD_SOFT} color={GOLD} />
                  </div>
                </div>
              )}

              {/* ── Présences ────────────────────────────────────────────── */}
              {attendance && (
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 flex items-center gap-2 border-b border-[oklch(90%_0.01_175)]" style={{ background: IVORY }}>
                    <ClipboardCheck size={15} style={{ color: GOLD }} />
                    <h3 className="font-semibold text-[14px]" style={{ color: TEXT_PRIMARY }}>Présences de la période</h3>
                  </div>
                  <div className="p-5">
                    <div className="flex items-end justify-between mb-2">
                      <span className="text-3xl font-extrabold" style={{ color: attendance.rate !== null ? SUCCESS : TEXT_MUTED_LUXE }}>
                        {attendance.rate !== null ? `${attendance.rate}%` : '—'}
                      </span>
                      <span className="text-[11px] pb-1" style={{ color: TEXT_MUTED_LUXE }}>
                        {fmtNum(attendance.total)} marque{attendance.total > 1 ? 's' : ''} d&apos;appel
                      </span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden" style={{ background: IVORY }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${attendance.rate !== null ? Math.min(100, attendance.rate) : 0}%`, background: `linear-gradient(90deg, ${ACCENT}, ${SUCCESS})` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3 text-[11px] font-semibold">
                      <span className="px-2 py-1 rounded-full" style={{ background: SUCCESS_SOFT, color: SUCCESS }}>Présents : {fmtNum(attendance.present)}</span>
                      <span className="px-2 py-1 rounded-full" style={{ background: 'oklch(95% 0.04 25)', color: DANGER }}>Absents : {fmtNum(attendance.absent)}</span>
                      <span className="px-2 py-1 rounded-full" style={{ background: GOLD_SOFT, color: GOLD }}>Retards : {fmtNum(attendance.late)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Top classes ──────────────────────────────────────────── */}
              {report.topClasses && report.topClasses.length > 0 && (
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 flex items-center gap-2 border-b border-[oklch(90%_0.01_175)]" style={{ background: IVORY }}>
                    <Trophy size={15} style={{ color: GOLD }} />
                    <h3 className="font-semibold text-[14px]" style={{ color: TEXT_PRIMARY }}>Top classes par taux de présence</h3>
                  </div>
                  <div className="p-5 space-y-2.5">
                    {report.topClasses.map((c, i) => (
                      <div key={c.className} className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0" style={{ background: i === 0 ? GOLD : ACCENT }}>{i + 1}</span>
                        <span className="text-[13px] font-medium w-24 truncate" style={{ color: TEXT_PRIMARY }}>{c.className}</span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: IVORY }}>
                          <div className="h-full rounded-full" style={{ width: `${c.rate}%`, background: i === 0 ? GOLD : ACCENT }} />
                        </div>
                        <span className="text-[12px] font-bold w-10 text-right" style={{ color: SUCCESS }}>{c.rate}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Communications + événements ──────────────────────────── */}
              {(report.communications || (report.events && report.events.length > 0)) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {report.communications && (
                    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: GOLD_SOFT }}>
                        <Megaphone size={18} style={{ color: GOLD }} />
                      </div>
                      <div>
                        <div className="text-xl font-extrabold leading-tight" style={{ color: TEXT_PRIMARY }}>{fmtNum(report.communications.sent)}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>Communications envoyées sur la période</div>
                      </div>
                    </div>
                  )}
                  {report.events && report.events.length > 0 && (
                    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <CalendarDays size={15} style={{ color: GOLD }} />
                        <h3 className="font-semibold text-[14px]" style={{ color: TEXT_PRIMARY }}>Événements de la période</h3>
                      </div>
                      <div className="space-y-1.5">
                        {report.events.map((ev, i) => (
                          <div key={`${ev.title}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-[oklch(90%_0.01_175)]">
                            <span className="text-[13px] font-medium truncate" style={{ color: TEXT_PRIMARY }}>{ev.title}</span>
                            <span className="text-[11px] shrink-0 capitalize" style={{ color: TEXT_MUTED_LUXE }}>{fmtEventDate(ev.startAt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Répartition par classe ───────────────────────────────── */}
              {report.students && report.students.byClass.length > 0 && (
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 flex items-center gap-2 border-b border-[oklch(90%_0.01_175)]" style={{ background: IVORY }}>
                    <Users size={15} style={{ color: GOLD }} />
                    <h3 className="font-semibold text-[14px]" style={{ color: TEXT_PRIMARY }}>Effectifs par classe</h3>
                  </div>
                  <div className="p-5 flex flex-wrap gap-2">
                    {report.students.byClass.map(c => (
                      <span key={c.className} className="px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: IVORY, color: TEXT_PRIMARY }}>
                        {c.className} · {c.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {report && (
            <p className="text-[11px] mt-4 text-center" style={{ color: TEXT_MUTED_LUXE }}>
              Rapport « {report.school.name} » — généré le {new Date(report.generatedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </>
      )}

      {/* ── Modale « Partager » (secours WhatsApp) ──────────────────────── */}
      {shareText && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShareText(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[oklch(90%_0.01_175)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center text-white" style={{ background: `linear-gradient(135deg, ${SUCCESS}, ${GOLD})` }}>
                  <Share2 size={18} />
                </div>
                <h2 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>Partager le rapport</h2>
              </div>
              <button onClick={() => setShareText(null)}><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto custom-scrollbar">
              <pre className="whitespace-pre-wrap text-[12px] leading-relaxed font-sans px-3 py-3 rounded-xl border border-[oklch(90%_0.01_175)]" style={{ color: TEXT_PRIMARY, background: IVORY }}>
                {shareText}
              </pre>
            </div>
            <div className="p-5 pt-0 flex flex-wrap justify-end gap-2 shrink-0">
              <button onClick={copyShareText} className="px-4 py-2 rounded-xl text-[13px] font-semibold border border-[oklch(90%_0.01_175)] inline-flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
                <Copy size={13} />
                Copier le texte
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="edu-gold-cta px-4 py-2 rounded-xl text-[13px] font-semibold inline-flex items-center gap-2"
              >
                <Send size={13} />
                Ouvrir WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
