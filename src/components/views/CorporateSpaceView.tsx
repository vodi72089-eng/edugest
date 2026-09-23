'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '@/lib/store'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, SUCCESS, DANGER } from '@/lib/constants'
import { Building2, GraduationCap, Users, UsersRound, CreditCard, Shield, Ticket, Globe, CheckCircle2, XCircle } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════════
// ESPACE CORPORATE — le compte corporate est DIFFÉRENT d'un compte école :
// il peut avoir PLUSIEURS écoles et voit ici toutes ses écoles + les totaux
// agrégés (élèves, classes, personnel, encaissements, discipline, tickets).
// ═══════════════════════════════════════════════════════════════════════════

interface CorporateSchoolStats {
  id: string
  name: string
  shortName: string
  city: string | null
  province: string | null
  logo: string | null
  subscriptionTier: string
  subscriptionStatus: string
  isActive: boolean
  stats: {
    students: number
    classes: number
    staff: number
    paidAmount: number
    disciplineIncidents: number
    openTickets: number
  }
}

interface CorporateMeData {
  corporate: {
    id: string
    name: string
    contactName: string | null
    contactEmail: string | null
    contactPhone: string | null
    city: string | null
    status: string
    memberRole: string
  }
  schools: CorporateSchoolStats[]
  totals: {
    schools: number
    students: number
    classes: number
    staff: number
    paidAmount: number
    disciplineIncidents: number
    openTickets: number
  }
}

const formatCDF = (n: number) => new Intl.NumberFormat('fr-FR').format(n) + ' FC'

function StatMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: 'oklch(97% 0.005 175)' }}>
      <span className="text-[oklch(72%_0.15_65)]">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium leading-tight truncate" style={{ color: TEXT_MUTED_LUXE }}>{label}</p>
        <p className="text-sm font-bold leading-tight" style={{ color: TEXT_PRIMARY }}>{value}</p>
      </div>
    </div>
  )
}

export default function CorporateSpaceView() {
  const [data, setData] = useState<CorporateMeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await authFetch('/api/corporate/me')
      const j = await res.json()
      if (res.ok && j.data) setData(j.data)
      else setError(j.error || 'Espace corporate indisponible')
    } catch {
      setError('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-72 rounded-xl animate-pulse" style={{ background: 'oklch(95% 0.01 175)' }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'oklch(95% 0.01 175)' }} />)}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border p-8 text-center" style={{ borderColor: 'oklch(90% 0.01 175)' }}>
        <Globe className="w-10 h-10 mx-auto mb-3 text-[oklch(72%_0.15_65)]" />
        <h2 className="text-lg font-bold mb-1" style={{ color: TEXT_PRIMARY }}>Aucun espace corporate</h2>
        <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>{error || 'Votre compte n\u2019est rattaché à aucune entreprise.'}</p>
      </div>
    )
  }

  const { corporate, schools, totals } = data

  return (
    <div className="space-y-6">
      {/* En-tête entreprise */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Espace Corporate</h1>
          <p className="text-sm mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>
            {corporate.name}
            {corporate.city ? ` · ${corporate.city}` : ''}
            {` · ${totals.schools} école${totals.schools > 1 ? 's' : ''}`}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold w-fit"
          style={corporate.status === 'ACTIVE'
            ? { background: 'oklch(95% 0.04 145)', color: SUCCESS }
            : { background: 'oklch(95% 0.02 25)', color: DANGER }}
        >
          {corporate.status === 'ACTIVE' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {corporate.status === 'ACTIVE' ? 'Entreprise active' : 'Entreprise suspendue'}
        </span>
      </div>

      {/* Totaux agrégés multi-écoles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { icon: <Building2 size={18} />, label: 'Écoles', value: totals.schools },
          { icon: <GraduationCap size={18} />, label: 'Élèves', value: totals.students },
          { icon: <Users size={18} />, label: 'Classes', value: totals.classes },
          { icon: <UsersRound size={18} />, label: 'Personnel', value: totals.staff },
          { icon: <CreditCard size={18} />, label: 'Encaissements', value: formatCDF(totals.paidAmount) },
          { icon: <Ticket size={18} />, label: 'Tickets ouverts', value: totals.openTickets },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl border p-4" style={{ borderColor: 'oklch(92% 0.01 175)', background: 'white' }}>
            <span className="inline-grid place-items-center w-9 h-9 rounded-xl mb-2" style={{ background: 'oklch(95% 0.05 65)' }}>
              <span className="text-[oklch(60%_0.14_65)]">{s.icon}</span>
            </span>
            <p className="text-lg font-extrabold leading-tight" style={{ color: TEXT_PRIMARY }}>{s.value}</p>
            <p className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Écoles rattachées */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: TEXT_MUTED_LUXE }}>
          <Building2 size={15} className="text-[oklch(72%_0.15_65)]" /> Nos écoles ({schools.length})
        </h2>
        {schools.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center" style={{ borderColor: 'oklch(90% 0.01 175)' }}>
            <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Aucune école rattachée pour le moment — l’administrateur de la plateforme vous en assignera.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {schools.map(s => (
              <div key={s.id} className="rounded-2xl border p-5" style={{ borderColor: 'oklch(92% 0.01 175)', background: 'white' }}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0 font-extrabold text-sm" style={{ background: 'oklch(95% 0.05 65)', color: 'oklch(55% 0.14 65)' }}>
                      {s.shortName?.slice(0, 2).toUpperCase() || s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold truncate" style={{ color: TEXT_PRIMARY }}>{s.name}</p>
                      <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                        {[s.city, s.province].filter(Boolean).join(', ') || '—'} · Forfait {s.subscriptionTier}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 px-2 py-1 rounded-full text-[10px] font-bold" style={s.isActive ? { background: 'oklch(95% 0.04 145)', color: SUCCESS } : { background: 'oklch(95% 0.02 25)', color: DANGER }}>
                    {s.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <StatMini icon={<GraduationCap size={15} />} label="Élèves" value={s.stats.students} />
                  <StatMini icon={<Users size={15} />} label="Classes" value={s.stats.classes} />
                  <StatMini icon={<UsersRound size={15} />} label="Personnel" value={s.stats.staff} />
                  <StatMini icon={<CreditCard size={15} />} label="Encaissé" value={formatCDF(s.stats.paidAmount)} />
                  <StatMini icon={<Shield size={15} />} label="Incidents" value={s.stats.disciplineIncidents} />
                  <StatMini icon={<Ticket size={15} />} label="Tickets" value={s.stats.openTickets} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
