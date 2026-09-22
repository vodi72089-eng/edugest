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
import { GOLD, GOLD_SOFT, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY, SUCCESS, SUCCESS_SOFT, DANGER, WARNING } from '@/lib/constants'
import { formatAmount } from '@/lib/currency-display'
import {
  FileText, Send, Copy, Users, Wallet, ShieldAlert, GraduationCap,
  Megaphone, CalendarDays, Trophy, Loader2, X, Share2, CheckCircle2,
  UserCheck, AlertTriangle, ClipboardCheck,
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
  const { userRole } = useEduGestStore()
  const isSAG = userRole === 'SUPER_ADMIN_GLOBAL'
  const isParent = userRole === 'PARENT'

  const [days, setDays] = useState(7)
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [shareText, setShareText] = useState<string | null>(null)
  const [lastWarning, setLastWarning] = useState<string | null>(null)

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
          <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Choisissez une école dans le sélecteur en haut de page pour générer son rapport.</p>
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
              <button onClick={handleSend} disabled={sending || loading} className="edu-gold-cta ml-auto px-4 py-2 rounded-xl text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                {sending ? <div className="h-3.5 w-3.5 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Send size={13} />}
                Envoyer sur WhatsApp
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>
              <span className="px-2 py-1 rounded-full inline-flex items-center gap-1" style={{ background: IVORY }}>
                <UserCheck size={11} />
                Rapport scellé sur votre rôle : <strong style={{ color: TEXT_PRIMARY }}>{report?.role || userRole}</strong>
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
