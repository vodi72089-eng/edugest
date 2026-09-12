'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Users,
  UserCheck,
  ShieldCheck,
  GraduationCap,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Phone,
  Mail,
  AlertTriangle,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import StudentAvatar from '@/components/ui/StudentAvatar'
import { authFetch, useEduGestStore } from '@/lib/store'
import {
  ACCENT,
  GOLD,
  DARK,
  IVORY,
  IVORY_WARM,
  TEXT_PRIMARY,
  TEXT_MUTED_LUXE,
  SUCCESS,
  DANGER,
  BORDER,
} from '@/lib/constants'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types (API : GET /api/parents)
// ---------------------------------------------------------------------------

interface ParentChild {
  id: string
  matricule: string
  firstName: string
  lastName: string
  classId: string
  photoUrl: string | null
  class: { id: string; name: string } | null
  paidTotal: number
  paymentsCount: number
  expectedTotal: number
  debtTotal: number
}

interface ParentItem {
  id: string
  name: string
  email: string | null
  phone: string | null
  profileImageUrl: string | null
  isActive: boolean
  createdAt: string
  childrenCount: number
  children: ParentChild[]
}

interface ParentsStats {
  totalParents: number
  parentsWithChildren: number
  activeParents: number
  totalChildren: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 12
const SEARCH_DEBOUNCE_MS = 400

function formatCdf(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} CDF`
}

/** Sépare « Papa Kazadi » en { firstName: 'Papa', lastName: 'Kazadi' } pour l'avatar. */
function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] || '?'
  return { firstName: first, lastName: parts.slice(1).join(' ') || first }
}

function SoftBadge({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="rounded-full text-[10px] font-bold px-2 py-0.5 gap-1 shrink-0"
      style={{ background: bg, color: fg, borderColor: 'transparent' }}
    >
      {children}
    </Badge>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm p-3 sm:p-4" style={{ borderColor: BORDER }}>
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
        >
          <Icon className="w-4 h-4" />
        </span>
        <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wide truncate" style={{ color: TEXT_MUTED_LUXE }}>
          {label}
        </p>
      </div>
      <p className="text-xl sm:text-2xl font-extrabold mt-2" style={{ color: TEXT_PRIMARY }}>
        {value.toLocaleString('fr-FR')}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vue « Gestion des Parents »
// ---------------------------------------------------------------------------

export default function ParentsView() {
  const userData = useEduGestStore((s) => s.userData)
  const schoolId = userData?.schoolId ?? ''
  const isSuperAdmin = userData?.role === 'SUPER_ADMIN_GLOBAL'

  const [parents, setParents] = useState<ParentItem[]>([])
  const [stats, setStats] = useState<ParentsStats>({ totalParents: 0, parentsWithChildren: 0, activeParents: 0, totalChildren: 0 })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [schoolName, setSchoolName] = useState('')
  const [activeYearLabel, setActiveYearLabel] = useState('')

  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // ── Recherche avec debounce 400 ms (retour à la page 1) ───────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput])

  // ── Chargement des parents ────────────────────────────────────────────────
  const fetchParents = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (appliedSearch) params.set('search', appliedSearch)
      // Le schoolId est déduit du token côté API ; seul le SUPER_ADMIN_GLOBAL
      // peut préciser une école explicitement.
      if (isSuperAdmin && schoolId) params.set('schoolId', schoolId)

      const res = await authFetch(`/api/parents?${params.toString()}`)
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      const d = json?.data
      setParents(Array.isArray(d?.parents) ? (d.parents as ParentItem[]) : [])
      setTotal(typeof d?.total === 'number' ? d.total : 0)
      setTotalPages(Math.max(1, typeof d?.totalPages === 'number' ? d.totalPages : 1))
      if (d?.schoolName) setSchoolName(d.schoolName)
      if (d?.activeYearLabel) setActiveYearLabel(d.activeYearLabel)
      if (d?.stats) {
        setStats({
          totalParents: d.stats.totalParents ?? 0,
          parentsWithChildren: d.stats.parentsWithChildren ?? 0,
          activeParents: d.stats.activeParents ?? 0,
          totalChildren: d.stats.totalChildren ?? 0,
        })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Impossible de charger la liste des parents.')
    } finally {
      setLoading(false)
    }
  }, [page, appliedSearch, isSuperAdmin, schoolId])

  useEffect(() => {
    fetchParents()
  }, [fetchParents])

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full min-h-full space-y-4 sm:space-y-5 p-4 sm:p-6" style={{ backgroundColor: IVORY_WARM }}>
      {/* En-tête */}
      <div className="bg-white rounded-2xl border shadow-sm p-4 sm:p-5" style={{ borderColor: BORDER }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <span
            className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: DARK, color: GOLD }}
          >
            <Users className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight" style={{ color: TEXT_PRIMARY }}>
              Gestion des Parents
            </h2>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>
              Comptes parents, enfants liés et situation de paiement
              {schoolName ? ` — ${schoolName}` : ''}
            </p>
          </div>
          {activeYearLabel && (
            <SoftBadge bg={`color-mix(in oklab, ${GOLD} 16%, transparent)`} fg="oklch(55% 0.13 65)">
              <CalendarDays className="w-3 h-3" />
              Année scolaire {activeYearLabel}
            </SoftBadge>
          )}
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard icon={Users} label="Total parents" value={stats.totalParents} color={ACCENT} />
        <StatCard icon={UserCheck} label="Parents avec enfants" value={stats.parentsWithChildren} color={GOLD} />
        <StatCard icon={ShieldCheck} label="Comptes actifs" value={stats.activeParents} color={SUCCESS} />
        <StatCard icon={GraduationCap} label="Total enfants" value={stats.totalChildren} color={DANGER} />
      </div>

      {/* Barre de recherche */}
      <div className="bg-white rounded-2xl border shadow-sm p-3 sm:p-4" style={{ borderColor: BORDER }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: TEXT_MUTED_LUXE }} />
          <Input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Rechercher un parent (nom, email, téléphone)…"
            className="pl-9 rounded-xl h-10"
            style={{ borderColor: BORDER, color: TEXT_PRIMARY }}
            aria-label="Rechercher un parent"
          />
        </div>
      </div>

      {/* Liste des parents (hauteur max + scroll) */}
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement des parents">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border p-4 flex items-center gap-3" style={{ borderColor: BORDER }}>
              <Skeleton className="rounded-full shrink-0" style={{ width: 46, height: 46 }} />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : parents.length === 0 ? (
        <div
          className="bg-white rounded-2xl border p-10 flex flex-col items-center justify-center text-center"
          style={{ borderColor: BORDER }}
        >
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: IVORY }}>
            <Inbox className="w-6 h-6" style={{ color: TEXT_MUTED_LUXE }} />
          </span>
          <p className="text-sm font-bold" style={{ color: TEXT_PRIMARY }}>
            Aucun parent trouvé
          </p>
          <p className="text-xs mt-1" style={{ color: TEXT_MUTED_LUXE }}>
            {appliedSearch
              ? `Aucun résultat pour « ${appliedSearch} ».`
              : "Aucun compte parent n'est encore enregistré dans cette école."}
          </p>
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {parents.map((p) => {
              const isExpanded = expandedIds.has(p.id)
              const avatarName = splitName(p.name)
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md self-start"
                  style={{ borderColor: BORDER }}
                >
                  {/* Ligne parent (cliquable pour déplier) */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(p.id)}
                    aria-expanded={isExpanded}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-[oklch(98%_0.005_175)] transition-colors"
                  >
                    <StudentAvatar
                      firstName={avatarName.firstName}
                      lastName={avatarName.lastName}
                      photoUrl={p.profileImageUrl}
                      size={46}
                      style={{ background: IVORY, color: DARK, fontWeight: 700 }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-extrabold truncate" style={{ color: TEXT_PRIMARY }}>
                          {p.name}
                        </p>
                        {p.isActive ? (
                          <SoftBadge bg={`color-mix(in oklab, ${SUCCESS} 12%, transparent)`} fg={SUCCESS}>
                            Actif
                          </SoftBadge>
                        ) : (
                          <SoftBadge bg={`color-mix(in oklab, ${DANGER} 10%, transparent)`} fg={DANGER}>
                            Inactif
                          </SoftBadge>
                        )}
                      </div>
                      <p className="text-xs mt-0.5 flex items-center gap-1.5 truncate" style={{ color: TEXT_MUTED_LUXE }}>
                        {p.email && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate">{p.email}</span>
                          </span>
                        )}
                        {p.email && p.phone && <span className="shrink-0">·</span>}
                        {p.phone && (
                          <span className="inline-flex items-center gap-1 shrink-0">
                            <Phone className="w-3 h-3" />
                            {p.phone}
                          </span>
                        )}
                        {!p.email && !p.phone && <span>—</span>}
                      </p>
                    </div>
                    <SoftBadge bg={`color-mix(in oklab, ${ACCENT} 12%, transparent)`} fg={ACCENT}>
                      <GraduationCap className="w-3 h-3" />
                      {p.childrenCount} enfant{p.childrenCount > 1 ? 's' : ''}
                    </SoftBadge>
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      style={{ color: TEXT_MUTED_LUXE }}
                    />
                  </button>

                  {/* Enfants dépliés */}
                  {isExpanded && (
                    <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: BORDER, background: IVORY }}>
                      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXT_MUTED_LUXE }}>
                        Enfants ({p.childrenCount})
                      </p>
                      {p.children.length === 0 ? (
                        <p className="text-xs italic py-2" style={{ color: TEXT_MUTED_LUXE }}>
                          Aucun enfant lié à ce compte parent.
                        </p>
                      ) : (
                        p.children.map((child) => (
                          <div
                            key={child.id}
                            className="bg-white rounded-xl border p-2.5 flex flex-wrap items-center gap-2.5"
                            style={{ borderColor: BORDER }}
                          >
                            <StudentAvatar
                              firstName={child.firstName}
                              lastName={child.lastName}
                              photoUrl={child.photoUrl}
                              size={36}
                              style={{ background: IVORY, color: ACCENT, fontWeight: 700 }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold truncate" style={{ color: TEXT_PRIMARY }}>
                                {child.firstName} {child.lastName}
                              </p>
                              <p className="text-[11px] truncate" style={{ color: TEXT_MUTED_LUXE }}>
                                {child.matricule}
                                {child.class?.name ? ` · ${child.class.name}` : ''}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p
                                className="text-xs font-extrabold"
                                style={{ color: child.paidTotal > 0 ? SUCCESS : TEXT_MUTED_LUXE }}
                              >
                                {formatCdf(child.paidTotal)}
                              </p>
                              <p className="text-[10px]" style={{ color: TEXT_MUTED_LUXE }}>
                                {child.paymentsCount} paiement{child.paymentsCount > 1 ? 's' : ''}
                              </p>
                            </div>
                            {child.debtTotal > 0 && (
                              <SoftBadge bg={`color-mix(in oklab, ${DANGER} 10%, transparent)`} fg={DANGER}>
                                <AlertTriangle className="w-3 h-3" />
                                Dette : {formatCdf(child.debtTotal)}
                              </SoftBadge>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((v) => Math.max(1, v - 1))}
            className="rounded-xl bg-white"
            style={{ borderColor: BORDER, color: TEXT_PRIMARY }}
          >
            <ChevronLeft className="w-4 h-4" />
            Précédent
          </Button>
          <p className="text-xs font-bold" style={{ color: TEXT_MUTED_LUXE }}>
            Page {page} sur {totalPages} · {total.toLocaleString('fr-FR')} parent{total > 1 ? 's' : ''}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
            className="rounded-xl bg-white"
            style={{ borderColor: BORDER, color: TEXT_PRIMARY }}
          >
            Suivant
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
