'use client'

import { useState, useEffect, useMemo } from 'react'
import { useEduGestStore, authFetch, getActiveSchoolId } from '@/lib/store'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, SUCCESS, DANGER, GOLD_SOFT } from '@/lib/constants'
import { formatDate } from '@/lib/helpers'
import StudentAvatar from '@/components/ui/StudentAvatar'
import { BarChart3, Search, TrendingUp, Wallet, CheckCircle, AlertTriangle, History, Users, Calendar, Clock, Banknote } from 'lucide-react'
import { useCurrency } from '@/hooks/useCurrency'
import { convertFromDisplay, getDisplaySymbol } from '@/lib/currency-display'

interface FinanceStudent {
  id: string
  firstName: string
  lastName: string
  matricule: string
  photoUrl?: string | null
  class: { name: string; section: string } | null
  totalExpected: number
  totalPaid: number
  totalRemaining: number
  paymentCount: number
  lastPaymentAt: string | null
  reachRate: number
}

interface FinanceHistoryItem {
  id: string
  studentId: string
  studentName: string
  matricule: string
  className: string
  amount: number
  paidAmount: number
  trimester: string
  paymentMethod: string | null
  referenceNumber: string | null
  status: string
  date: string
}

interface FinanceTotals {
  expected: number
  collected: number
  outstanding: number
  studentCount: number
  paidFully: number
  partial: number
  notStarted: number
}

type Bucket = 'ALL' | 'FULL' | 'GE75' | 'GE50' | 'LT50' | 'NONE'

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'ALL', label: 'Tous' },
  { key: 'FULL', label: 'Soldés (100%)' },
  { key: 'GE75', label: '≥ 75%' },
  { key: 'GE50', label: '≥ 50%' },
  { key: 'LT50', label: '< 50%' },
  { key: 'NONE', label: 'Aucun paiement' },
]

/** Heure courte d'un paiement (ex: 14:07) pour l'historique. */
function formatTimeShort(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * SITUATION FINANCIÈRE — vue dédiée du volet caisse (distincte d'« Enregistrer
 * un paiement ») : historique complet des paiements, recherche d'élève et
 * classement des élèves selon le montant atteint (avec effectifs).
 */
export default function FinanceSituationView() {
  const { userData } = useEduGestStore()
  const { format: fmt } = useCurrency()
  const [students, setStudents] = useState<FinanceStudent[]>([])
  const [history, setHistory] = useState<FinanceHistoryItem[]>([])
  const [totals, setTotals] = useState<FinanceTotals | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [threshold, setThreshold] = useState('')
  const [bucket, setBucket] = useState<Bucket>('ALL')
  const [historySearch, setHistorySearch] = useState('')
  const [histMinAmount, setHistMinAmount] = useState('')
  const [histDate, setHistDate] = useState('')
  const [histTime, setHistTime] = useState('')

  // École active (SAG : l'école choisie dans la sidebar ; rôles école : la leur)
  const activeSchoolId = getActiveSchoolId() || userData?.schoolId || ''

  useEffect(() => {
    if (!activeSchoolId) return
    let cancelled = false
    authFetch(`/api/finance-overview?schoolId=${activeSchoolId}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        setStudents(j.data?.students || [])
        setHistory(j.data?.history || [])
        setTotals(j.data?.totals || null)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeSchoolId])

  // Seuil « montant atteint ≥ » : le montant est SAISI en monnaie d'affichage
  // (ex: 10 $) ; les totaux élèves sont stockés en monnaie de base — on
  // convertit le seuil vers la base AVANT comparaison (inverse exact, sans
  // arrondi). AVANT : le seuil n'était appliqué ni à la liste ni au compteur
  // de façon cohérente (le tableau montrait toujours les soldés en tête).
  const thresholdNum = parseFloat(threshold.replace(',', '.'))
  const thresholdBase = Number.isFinite(thresholdNum) ? convertFromDisplay(thresholdNum) : null

  // Recherche élève (nom, matricule, classe) + filtre seuil — filtrage RÉEL
  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = students
    if (q) {
      list = list.filter(s =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
        (s.matricule || '').toLowerCase().includes(q) ||
        (s.class?.name || '').toLowerCase().includes(q)
      )
    }
    switch (bucket) {
      case 'FULL': list = list.filter(s => s.totalExpected > 0 && s.totalPaid >= s.totalExpected); break
      case 'GE75': list = list.filter(s => s.reachRate >= 75); break
      case 'GE50': list = list.filter(s => s.reachRate >= 50); break
      case 'LT50': list = list.filter(s => s.totalPaid > 0 && s.reachRate < 50); break
      case 'NONE': list = list.filter(s => s.totalPaid <= 0); break
      default: break
    }
    if (thresholdBase !== null) list = list.filter(s => s.totalPaid >= thresholdBase)
    return list
  }, [students, search, bucket, thresholdBase])

  // Compteur du bandeau : cohérent avec la recherche affichée (sans le bucket)
  const thresholdCount = thresholdBase !== null
    ? students.filter(s => {
        const q = search.trim().toLowerCase()
        if (q && !(`${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
          (s.matricule || '').toLowerCase().includes(q) ||
          (s.class?.name || '').toLowerCase().includes(q))) return false
        return s.totalPaid >= thresholdBase
      }).length
    : null

  // Effectif par catégorie (affiché sur les puces de filtrage)
  const bucketCounts = useMemo(() => {
    const c: Record<Bucket, number | undefined> = {
      ALL: students.length,
      FULL: students.filter(s => s.totalExpected > 0 && s.totalPaid >= s.totalExpected).length,
      GE75: students.filter(s => s.reachRate >= 75).length,
      GE50: students.filter(s => s.reachRate >= 50).length,
      LT50: students.filter(s => s.totalPaid > 0 && s.reachRate < 50).length,
      NONE: students.filter(s => s.totalPaid <= 0).length,
    }
    return c
  }, [students])

  // Historique : recherche élève/tranche/classe + filtres montant, jour, heure
  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    const minNum = parseFloat(histMinAmount.replace(',', '.'))
    const minBase = Number.isFinite(minNum) ? convertFromDisplay(minNum) : null
    return history.filter(h => {
      if (q && !(
        h.studentName.toLowerCase().includes(q) ||
        (h.matricule || '').toLowerCase().includes(q) ||
        (h.className || '').toLowerCase().includes(q) ||
        (h.trimester || '').toLowerCase().includes(q)
      )) return false
      if (minBase !== null && !(h.paidAmount >= minBase)) return false
      if (histDate && !h.date.startsWith(histDate)) return false
      if (histTime) {
        const d = new Date(h.date)
        if (!isNaN(d.getTime())) {
          const [hh, mm] = histTime.split(':')
          if (hh && d.getHours() !== parseInt(hh, 10)) return false
          if (mm && d.getMinutes() !== parseInt(mm, 10)) return false
        }
      }
      return true
    })
  }, [history, historySearch, histMinAmount, histDate, histTime])

  const statusPill = (s: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      PAID: { bg: 'oklch(95% 0.04 145)', color: SUCCESS, label: 'Payé' },
      PARTIAL: { bg: 'oklch(95% 0.08 80)', color: 'oklch(55% 0.15 80)', label: 'Partiel' },
      PENDING: { bg: 'oklch(95% 0.04 85)', color: GOLD, label: 'En attente' },
      OVERDUE: { bg: 'oklch(95% 0.04 25)', color: DANGER, label: 'Impayé' },
    }
    const v = map[s] || { bg: 'oklch(95% 0.04 175)', color: TEXT_MUTED_LUXE, label: s }
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: v.bg, color: v.color }}>{v.label}</span>
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Situation financière</h1>
      </div>
      <p className="text-[13px] ml-7 mb-6" style={{ color: TEXT_MUTED_LUXE }}>
        Historique des paiements, recherche d&apos;élève et classement par montant atteint — {userData?.schoolName || ''}
      </p>

      {/* Totaux école */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED_LUXE }}>
            <Wallet size={13} style={{ color: ACCENT }} /> Encaissé
          </div>
          <div className="text-xl font-bold" style={{ color: TEXT_PRIMARY }}>{totals ? fmt(totals.collected) : '…'}</div>
        </div>
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED_LUXE }}>
            <TrendingUp size={13} style={{ color: ACCENT }} /> Attendu
          </div>
          <div className="text-xl font-bold" style={{ color: TEXT_PRIMARY }}>{totals ? fmt(totals.expected) : '…'}</div>
        </div>
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED_LUXE }}>
            <AlertTriangle size={13} style={{ color: DANGER }} /> Reste à payer
          </div>
          <div className="text-xl font-bold" style={{ color: DANGER }}>{totals ? fmt(totals.outstanding) : '…'}</div>
        </div>
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED_LUXE }}>
            <CheckCircle size={13} style={{ color: SUCCESS }} /> Élèves soldés
          </div>
          <div className="text-xl font-bold" style={{ color: SUCCESS }}>
            {totals ? `${totals.paidFully} / ${totals.studentCount}` : '…'}
          </div>
        </div>
      </div>

      {/* Classement par montant atteint */}
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} style={{ color: GOLD }} />
            <h3 className="font-semibold text-[15px]" style={{ color: TEXT_PRIMARY }}>Classement par montant atteint</h3>
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="flex items-center gap-1.5 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2">
              <Search size={13} style={{ color: TEXT_MUTED_LUXE }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un élève (nom, matricule, classe)..."
                className="border-0 bg-transparent outline-none text-sm w-64"
              />
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2">
              <Users size={13} style={{ color: TEXT_MUTED_LUXE }} />
              <input
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                placeholder="Montant atteint ≥"
                inputMode="decimal"
                className="border-0 bg-transparent outline-none text-sm w-32"
              />
            </div>
          </div>
        </div>

        {thresholdCount !== null && (
          <div className="mb-3 px-3 py-2 rounded-xl text-[13px] font-medium" style={{ background: GOLD_SOFT, color: GOLD }}>
            {thresholdCount} élève{thresholdCount > 1 ? 's' : ''} sur {students.length} ont payé au moins {threshold} {getDisplaySymbol()}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mb-4">
          {BUCKETS.map(b => (
            <button
              key={b.key}
              onClick={() => setBucket(b.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                bucket === b.key ? 'border-[oklch(72%_0.15_65)] shadow-sm' : 'border-[oklch(90%_0.01_175)] hover:border-[oklch(72%_0.15_65_/_0.4)]'
              }`}
              style={{ background: bucket === b.key ? GOLD_SOFT : 'white', color: bucket === b.key ? GOLD : TEXT_MUTED_LUXE }}
            >
              {b.label}{bucketCounts[b.key] !== undefined ? ` (${bucketCounts[b.key]})` : ''}
            </button>
          ))}
        </div>

        <div className="border border-[oklch(90%_0.01_175)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: 'oklch(97% 0.005 175)' }}>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>#</th>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>Élève</th>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>Classe</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>Payé</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>Attendu</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>Reste</th>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>Atteint</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
                ) : filteredStudents.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucun élève</td></tr>
                ) : filteredStudents.map((s, i) => (
                  <tr key={s.id} className="border-t border-[oklch(94%_0.005_175)] hover:bg-[oklch(97%_0.005_175)] transition">
                    <td className="px-4 py-2.5 text-[13px] font-semibold" style={{ color: TEXT_MUTED_LUXE }}>{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <StudentAvatar firstName={s.firstName} lastName={s.lastName} photoUrl={s.photoUrl || undefined} size={28} className="text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
                        <div>
                          <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{s.firstName} {s.lastName}</div>
                          <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{s.matricule}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{s.class?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-[13px] text-right font-semibold" style={{ color: SUCCESS }}>{fmt(s.totalPaid)}</td>
                    <td className="px-4 py-2.5 text-[13px] text-right" style={{ color: TEXT_MUTED_LUXE }}>{fmt(s.totalExpected)}</td>
                    <td className="px-4 py-2.5 text-[13px] text-right" style={{ color: s.totalRemaining > 0 ? DANGER : TEXT_MUTED_LUXE }}>{fmt(s.totalRemaining)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-[110px]">
                        <div className="h-1.5 flex-1 bg-[oklch(92%_0.005_175)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${s.reachRate}%`, background: s.reachRate >= 100 ? SUCCESS : s.reachRate >= 50 ? GOLD : DANGER }} />
                        </div>
                        <span className="text-[11px] font-bold" style={{ color: TEXT_PRIMARY }}>{s.reachRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Historique des paiements */}
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2">
            <History size={16} style={{ color: GOLD }} />
            <h3 className="font-semibold text-[15px]" style={{ color: TEXT_PRIMARY }}>Historique des paiements</h3>
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2 ml-auto">
            <Search size={13} style={{ color: TEXT_MUTED_LUXE }} />
            <input
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="Rechercher (élève, tranche, classe)..."
              className="border-0 bg-transparent outline-none text-sm w-44"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2">
            <Banknote size={13} style={{ color: TEXT_MUTED_LUXE }} />
            <input
              value={histMinAmount}
              onChange={e => setHistMinAmount(e.target.value)}
              placeholder="Montant ≥"
              inputMode="decimal"
              className="border-0 bg-transparent outline-none text-sm w-24"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2">
            <Calendar size={13} style={{ color: TEXT_MUTED_LUXE }} />
            <input
              type="date"
              value={histDate}
              onChange={e => setHistDate(e.target.value)}
              className="border-0 bg-transparent outline-none text-sm w-36"
              aria-label="Filtrer par jour"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2">
            <Clock size={13} style={{ color: TEXT_MUTED_LUXE }} />
            <input
              type="time"
              value={histTime}
              onChange={e => setHistTime(e.target.value)}
              className="border-0 bg-transparent outline-none text-sm w-24"
              aria-label="Filtrer par heure"
            />
          </div>
        </div>
        <div className="border border-[oklch(90%_0.01_175)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: 'oklch(97% 0.005 175)' }}>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>Date · Heure</th>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>Élève</th>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>Classe</th>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>Tranche</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>Payé</th>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: GOLD }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
                ) : filteredHistory.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucun paiement enregistré</td></tr>
                ) : filteredHistory.map(h => (
                  <tr key={h.id} className="border-t border-[oklch(94%_0.005_175)] hover:bg-[oklch(97%_0.005_175)] transition">
                    <td className="px-4 py-2.5 text-[13px] whitespace-nowrap" style={{ color: TEXT_MUTED_LUXE }}>
                      <div>{formatDate(h.date)}</div>
                      <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{formatTimeShort(h.date)}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{h.studentName}</td>
                    <td className="px-4 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{h.className || '—'}</td>
                    <td className="px-4 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{h.trimester}</td>
                    <td className="px-4 py-2.5 text-[13px] text-right font-semibold" style={{ color: SUCCESS }}>{fmt(h.paidAmount)}</td>
                    <td className="px-4 py-2.5">{statusPill(h.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
