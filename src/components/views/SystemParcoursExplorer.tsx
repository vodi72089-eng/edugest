'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  GraduationCap,
  Layers,
  Clock,
  AlertCircle,
  Users,
  BookOpenCheck,
  CalendarDays,
  Coffee,
  Utensils,
  Sun,
  DoorOpen,
} from 'lucide-react'
import { GOLD, SUCCESS, WARNING, INFO, TEXT_PRIMARY, TEXT_MUTED_LUXE, BORDER } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Types (API: GET /api/educational-systems → { data: EducationalSystem[] })
// ---------------------------------------------------------------------------

type ParcoursSection = 'MATERNELLE' | 'PRIMAIRE' | 'SECONDAIRE'

interface ParcoursClass {
  name: string
  level: string
  capacity?: number
}

interface ParcoursOption {
  id: string
  name: string
  shortName: string
  description: string
  applicableLevels: string[]
}

interface HorairePeriod {
  label: string
  start: string
  end: string
  type: 'COURS' | 'PAUSE' | 'DEJEUNER' | 'ACCUEIL'
}

interface ParcoursHoraire {
  start: string
  end: string
  days: string
  periods: HorairePeriod[]
}

interface Parcours {
  section: ParcoursSection
  label: string
  description?: string
  classes: ParcoursClass[]
  options: ParcoursOption[]
  horaire: ParcoursHoraire | null
}

interface EducationalSystem {
  id: string
  name: string
  shortLabel: string
  flag: string
  countryCode: string
  country: string
  description: string
  sampleClasses: string
  parcours: Parcours[]
}

interface SystemParcoursExplorerProps {
  systemId: string
  compact?: boolean
  className?: string
}

const SECTION_TAB_LABEL: Record<ParcoursSection, string> = {
  MATERNELLE: 'Maternelle',
  PRIMAIRE: 'Primaire',
  SECONDAIRE: 'Secondaire',
}

const PERIOD_STYLES: Record<HorairePeriod['type'], { bg: string; fg: string; label: string }> = {
  COURS: { bg: 'oklch(60% 0.15 145 / 0.12)', fg: SUCCESS, label: 'Cours' },
  PAUSE: { bg: 'oklch(72% 0.15 65 / 0.16)', fg: 'oklch(55% 0.13 65)', label: 'Pause' },
  DEJEUNER: { bg: 'oklch(62% 0.17 45 / 0.13)', fg: 'oklch(58% 0.16 45)', label: 'Déjeuner' },
  ACCUEIL: { bg: 'oklch(60% 0.13 250 / 0.12)', fg: INFO, label: 'Accueil' },
}

const PERIOD_ICONS: Record<HorairePeriod['type'], typeof Sun> = {
  COURS: BookOpenCheck,
  PAUSE: Coffee,
  DEJEUNER: Utensils,
  ACCUEIL: DoorOpen,
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionTitle({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-1 h-6 rounded-full shrink-0" style={{ background: GOLD }} />
      <h4 className={`font-extrabold tracking-tight ${compact ? 'text-sm' : 'text-lg'}`} style={{ color: TEXT_PRIMARY }}>
        {children}
      </h4>
    </div>
  )
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[oklch(93%_0.01_175)] ${className}`} />
}

function LoadingSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div className={compact ? 'p-3 space-y-3' : 'p-4 sm:p-6 space-y-5'}>
      <div className="flex items-center gap-3">
        <SkeletonBlock className="w-12 h-12 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="h-3 w-3/4" />
        </div>
      </div>
      <div className="flex gap-2">
        <SkeletonBlock className="h-8 w-24 rounded-full" />
        <SkeletonBlock className="h-8 w-24 rounded-full" />
        <SkeletonBlock className="h-8 w-28 rounded-full" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-14" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SystemParcoursExplorer({ systemId, compact = false, className = '' }: SystemParcoursExplorerProps) {
  const [systems, setSystems] = useState<EducationalSystem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<ParcoursSection | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/educational-systems')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((json) => {
        if (cancelled) return
        setSystems(Array.isArray(json?.data) ? (json.data as EducationalSystem[]) : [])
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de charger les systèmes éducatifs.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const system = useMemo(() => systems.find((s) => s.id === systemId) ?? null, [systems, systemId])

  // Resolve the active section: 'PRIMAIRE' if present, otherwise the first parcours.
  const parcours = system?.parcours ?? []
  const effectiveSection = useMemo<ParcoursSection | null>(() => {
    if (parcours.length === 0) return null
    if (activeSection && parcours.some((p) => p.section === activeSection)) return activeSection
    return parcours.some((p) => p.section === 'PRIMAIRE') ? 'PRIMAIRE' : parcours[0].section
  }, [parcours, activeSection])

  const activeParcours = useMemo(
    () => parcours.find((p) => p.section === effectiveSection) ?? null,
    [parcours, effectiveSection]
  )

  // -------------------------------------------------------------------------
  // States : loading / error / system not found
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className={`bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm ${className}`}>
        <LoadingSkeleton compact={compact} />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm ${className}`}>
        <div className={`${compact ? 'p-4' : 'p-6'} flex flex-col items-center justify-center text-center gap-2 py-10`}>
          <AlertCircle className="w-8 h-8" style={{ color: WARNING }} />
          <p className="font-bold" style={{ color: TEXT_PRIMARY }}>{error}</p>
          <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Veuillez réessayer dans un instant.</p>
        </div>
      </div>
    )
  }

  if (!system) {
    return (
      <div className={`bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm ${className}`}>
        <div className={`${compact ? 'p-4' : 'p-6'} flex flex-col items-center justify-center text-center gap-2 py-10`}>
          <GraduationCap className="w-8 h-8" style={{ color: TEXT_MUTED_LUXE }} />
          <p className="font-bold" style={{ color: TEXT_PRIMARY }}>Système éducatif introuvable</p>
          <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Aucun parcours détaillé n&apos;est disponible pour ce système.</p>
        </div>
      </div>
    )
  }

  const pad = compact ? 'p-3' : 'p-4 sm:p-6'

  return (
    <div className={`bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm ${className}`}>
      {/* Header : flag + nom + description */}
      <div className={`${pad} border-b border-[oklch(92%_0.01_175)]`}>
        <div className="flex items-start gap-3">
          <span className={compact ? 'text-2xl leading-none' : 'text-4xl leading-none'} role="img" aria-label={system.country}>
            {system.flag}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`font-extrabold tracking-tight ${compact ? 'text-sm' : 'text-lg sm:text-xl'}`} style={{ color: TEXT_PRIMARY }}>
                {system.name}
              </h3>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                style={{ background: 'oklch(95% 0.04 175)', color: 'oklch(45% 0.13 175)' }}
              >
                {system.shortLabel}
              </span>
            </div>
            <p className={`mt-1 ${compact ? 'text-xs' : 'text-sm'} leading-relaxed`} style={{ color: TEXT_MUTED_LUXE }}>
              {system.description}
            </p>
          </div>
        </div>
      </div>

      {/* Onglets de sections (pills horizontales) */}
      {parcours.length > 0 && (
        <div className={`${pad} pb-0`}>
          <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-3 -mx-1 px-1">
            {parcours.map((p) => {
              const active = p.section === effectiveSection
              return (
                <button
                  key={p.section}
                  type="button"
                  onClick={() => setActiveSection(p.section)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-150 border ${
                    active
                      ? 'border-transparent shadow-sm'
                      : 'bg-white hover:bg-[oklch(97%_0.005_175)]'
                  }`}
                  style={
                    active
                      ? { background: 'oklch(15% 0.02 250)', color: 'oklch(97% 0.005 175)' }
                      : { borderColor: BORDER, color: TEXT_MUTED_LUXE }
                  }
                >
                  {SECTION_TAB_LABEL[p.section] ?? p.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Panneau de la section active */}
      {activeParcours && (
        <div className={`${pad} pt-0`}>
          <div className={`${compact ? 'space-y-3' : 'space-y-5 max-h-[420px] overflow-y-auto custom-scrollbar'}`}>
            {/* Libellé + description du parcours */}
            {(activeParcours.label || activeParcours.description) && (
              <div className="flex items-start gap-2 pt-1">
                <Layers className="w-4 h-4 mt-0.5 shrink-0" style={{ color: GOLD }} />
                <div>
                  {activeParcours.label && (
                    <p className={`font-bold ${compact ? 'text-xs' : 'text-sm'}`} style={{ color: TEXT_PRIMARY }}>
                      {activeParcours.label}
                    </p>
                  )}
                  {activeParcours.description && (
                    <p className={`mt-0.5 ${compact ? 'text-[11px]' : 'text-xs'}`} style={{ color: TEXT_MUTED_LUXE }}>
                      {activeParcours.description}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 1. Classes officielles */}
            <section>
              <SectionTitle compact={compact}>Classes officielles</SectionTitle>
              {activeParcours.classes.length > 0 ? (
                <div
                  className={`mt-2.5 grid gap-2 ${
                    compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
                  }`}
                >
                  {activeParcours.classes.map((c) => (
                    <div
                      key={`${c.name}-${c.level}`}
                      className="rounded-xl border border-[oklch(92%_0.01_175)] bg-[oklch(98%_0.005_175)] px-2.5 py-2 hover:border-[oklch(85%_0.02_175)] transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold"
                          style={{ background: 'oklch(95% 0.04 175)', color: 'oklch(45% 0.13 175)' }}
                        >
                          {c.level}
                        </span>
                        <p className={`font-bold truncate ${compact ? 'text-[11px]' : 'text-xs'}`} style={{ color: TEXT_PRIMARY }} title={c.name}>
                          {c.name}
                        </p>
                      </div>
                      {typeof c.capacity === 'number' && (
                        <div className="mt-1 flex items-center gap-1">
                          <Users className="w-3 h-3" style={{ color: TEXT_MUTED_LUXE }} />
                          <span className="text-[10px] font-medium" style={{ color: TEXT_MUTED_LUXE }}>
                            cap. {c.capacity}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs" style={{ color: TEXT_MUTED_LUXE }}>Aucune classe définie pour cette section.</p>
              )}
            </section>

            {/* 2. Options / Filières populaires */}
            {activeParcours.options.length > 0 && (
              <section>
                <SectionTitle compact={compact}>Options / Filières populaires</SectionTitle>
                <div className={`mt-2.5 grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                  {activeParcours.options.map((o) => (
                    <div
                      key={o.id}
                      className="rounded-xl border border-[oklch(92%_0.01_175)] p-3 hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className="shrink-0 px-2 py-1 rounded-lg text-[11px] font-extrabold"
                          style={{ background: 'oklch(95% 0.05 65)', color: 'oklch(50% 0.14 65)' }}
                        >
                          {o.shortName}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`font-bold ${compact ? 'text-xs' : 'text-sm'}`} style={{ color: TEXT_PRIMARY }}>
                            {o.name}
                          </p>
                          {o.description && (
                            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>
                              {o.description}
                            </p>
                          )}
                          {o.applicableLevels?.length > 0 && (
                            <p className="mt-1.5 text-[11px] font-semibold" style={{ color: 'oklch(45% 0.13 175)' }}>
                              Niveaux : {o.applicableLevels.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 3. Horaire type */}
            {activeParcours.horaire && activeParcours.horaire.periods?.length > 0 && (
              <section>
                <SectionTitle compact={compact}>Horaire type</SectionTitle>
                <div className="mt-2.5 rounded-xl border border-[oklch(92%_0.01_175)] overflow-hidden">
                  {/* En-tête : jours · plage horaire */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-[oklch(97%_0.008_175)] border-b border-[oklch(92%_0.01_175)]">
                    <CalendarDays className="w-3.5 h-3.5" style={{ color: GOLD }} />
                    <span className={`font-bold ${compact ? 'text-[11px]' : 'text-xs'}`} style={{ color: TEXT_PRIMARY }}>
                      {Array.isArray(activeParcours.horaire.days)
                        ? (activeParcours.horaire.days as unknown as string[]).join(' - ')
                        : activeParcours.horaire.days || 'Lundi - Vendredi'}
                      {' · '}
                      {activeParcours.horaire.start} - {activeParcours.horaire.end}
                    </span>
                  </div>

                  {/* Tableau desktop */}
                  <table className="hidden md:table w-full text-left">
                    <thead>
                      <tr className="border-b border-[oklch(92%_0.01_175)]">
                        <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXT_MUTED_LUXE }}>Période</th>
                        <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXT_MUTED_LUXE }}>Heures</th>
                        <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXT_MUTED_LUXE }}>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeParcours.horaire.periods.map((p, idx) => {
                        const st = PERIOD_STYLES[p.type] ?? PERIOD_STYLES.COURS
                        return (
                          <tr key={`${p.label}-${idx}`} className={idx % 2 === 1 ? 'bg-[oklch(98.5%_0.004_175)]' : ''}>
                            <td className={`px-3 py-2 font-semibold ${compact ? 'text-[11px]' : 'text-xs'}`} style={{ color: TEXT_PRIMARY }}>
                              {p.label}
                            </td>
                            <td className={`px-3 py-2 font-mono ${compact ? 'text-[11px]' : 'text-xs'}`} style={{ color: TEXT_MUTED_LUXE }}>
                              {p.start} - {p.end}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{ background: st.bg, color: st.fg }}
                              >
                                {st.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* Cartes empilées mobile */}
                  <div className="md:hidden divide-y divide-[oklch(94%_0.008_175)]">
                    {activeParcours.horaire.periods.map((p, idx) => {
                      const st = PERIOD_STYLES[p.type] ?? PERIOD_STYLES.COURS
                      const Icon = PERIOD_ICONS[p.type] ?? BookOpenCheck
                      return (
                        <div key={`${p.label}-m-${idx}`} className="flex items-center gap-3 px-3 py-2.5">
                          <span
                            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: st.bg, color: st.fg }}
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold truncate" style={{ color: TEXT_PRIMARY }}>{p.label}</p>
                            <p className="text-[11px] font-mono" style={{ color: TEXT_MUTED_LUXE }}>
                              {p.start} - {p.end}
                            </p>
                          </div>
                          <span
                            className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: st.bg, color: st.fg }}
                          >
                            {st.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* Exemple de classes (bonus léger, si présent) */}
            {!compact && system.sampleClasses && (
              <p className="text-[11px] italic pt-1" style={{ color: TEXT_MUTED_LUXE }}>
                Ex. : {system.sampleClasses}
              </p>
            )}
          </div>
        </div>
      )}

      {!activeParcours && parcours.length === 0 && (
        <div className={`${pad} py-8 text-center`}>
          <Clock className="w-6 h-6 mx-auto mb-2" style={{ color: TEXT_MUTED_LUXE }} />
          <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>Aucun parcours disponible</p>
          <p className="text-xs mt-1" style={{ color: TEXT_MUTED_LUXE }}>Le détail des sections sera affiché ici dès qu&apos;il sera publié.</p>
        </div>
      )}
    </div>
  )
}

export default SystemParcoursExplorer
