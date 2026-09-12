'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import type { UserData } from '@/lib/store'
import {
  ACCENT,
  GOLD,
  GOLD_SOFT,
  DARK,
  IVORY,
  IVORY_WARM,
  TEXT_PRIMARY,
  TEXT_MUTED_LUXE,
  SUCCESS,
  DANGER,
  WARNING,
  BORDER,
} from '@/lib/constants'
import {
  Palette,
  Lock,
  Crown,
  Loader2,
  Save,
  RotateCcw,
  Sparkles,
  Check,
  Info,
  Building2,
  LayoutDashboard,
  Users,
  BookOpen,
  Settings as SettingsIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// ─── Constantes locales ─────────────────────────────────────────────────────

// Couleurs par défaut d'EduGest (équivalents hex des constantes oklch)
const DEFAULTS = { primary: '#13151d', accent: '#0b8c7f', gold: '#d9a441' }

// Format hexadécimal strict attendu côté API
const HEX_RE = /^#[0-9A-Fa-f]{6}$/

// Filtre de saisie du champ hexadécimal : « # » + 0 à 6 caractères hex
const HEX_INPUT_RE = /^[#0-9A-Fa-f]{0,6}$/

// Forfaits autorisant la personnalisation (aligné sur l'API — gating strict)
const DESIGN_TIERS = ['STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE']

// Presets de palettes cliquables (inspiration Gianelli, adaptée EduGest)
const PRESETS = [
  { name: 'EduGest', primary: '#13151d', accent: '#0b8c7f', gold: '#d9a441' },
  { name: 'Forêt', primary: '#0f2417', accent: '#1a7a4a', gold: '#d9a441' },
  { name: 'Océan', primary: '#0d1b2a', accent: '#0e7490', gold: '#e0b341' },
  { name: 'Bordeaux', primary: '#2a0d14', accent: '#9f1239', gold: '#d9a441' },
  { name: 'Violet', primary: '#1d1030', accent: '#7c3aed', gold: '#eab308' },
]

// Items factices de la mini sidebar d'aperçu (l'item 0 est « actif », doré)
const MOCK_MENU = [
  { icon: LayoutDashboard, label: 'Tableau de bord' },
  { icon: Users, label: 'Élèves' },
  { icon: BookOpen, label: 'Cours' },
  { icon: SettingsIcon, label: 'Réglages' },
]

interface DesignColors {
  primary: string
  accent: string
  gold: string
}

interface SchoolOption {
  id: string
  name: string
}

type ColorKey = 'primary' | 'accent' | 'gold'

// ─── Utilitaires couleurs ───────────────────────────────────────────────────

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, value))
}

// Teinte dérivée : ajoute un offset (ex. 0xdd) à chaque canal RGB, plafonné à 255
function tint(hex: string, offset: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const channel = (v: number) => clamp255(v + offset).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

// Bande de 5 nuances : couleur, +dd, +99, +66, +33
function shadeBand(hex: string): string[] {
  return [hex, tint(hex, 0xdd), tint(hex, 0x99), tint(hex, 0x66), tint(hex, 0x33)]
}

// ─── Vue « Personnalisation » ───────────────────────────────────────────────

export default function PersonalizationView() {
  const { userData } = useEduGestStore()

  const isSuperAdmin = userData?.role === 'SUPER_ADMIN_GLOBAL'
  const isSchoolAdmin = userData?.role === 'SCHOOL_ADMIN'

  // ── Gating UI : rôles autorisés ───────────────────────────────────────────
  if (!isSuperAdmin && !isSchoolAdmin) {
    return (
      <div className="mx-auto mt-16 max-w-md px-4 text-center">
        <div
          className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full"
          style={{ backgroundColor: GOLD_SOFT }}
        >
          <Lock className="h-7 w-7" style={{ color: GOLD }} aria-hidden="true" />
        </div>
        <h2 className="mb-2 text-xl font-bold" style={{ color: TEXT_PRIMARY }}>
          Accès réservé
        </h2>
        <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>
          Interface disponible uniquement pour l&apos;admin de l&apos;école et la plateforme.
        </p>
      </div>
    )
  }

  // ── Gating UI : forfait (SCHOOL_ADMIN uniquement, STANDARD et plus) ───────
  if (isSchoolAdmin && !DESIGN_TIERS.includes(userData?.subscriptionTier ?? '')) {
    const tierLabel = userData?.subscriptionTier || 'FREEMIUM'
    return (
      <div className="mx-auto mt-16 max-w-md px-4 text-center">
        <div
          className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full"
          style={{ backgroundColor: GOLD_SOFT }}
        >
          <Crown className="h-7 w-7" style={{ color: GOLD }} aria-hidden="true" />
        </div>
        <h2 className="mb-2 text-xl font-bold" style={{ color: TEXT_PRIMARY }}>
          Fonction réservée aux écoles Standard et plus
        </h2>
        <p className="mb-2 text-sm" style={{ color: TEXT_MUTED_LUXE }}>
          La personnalisation des couleurs de l&apos;application est incluse à partir du forfait
          Standard. Votre école est actuellement sur le forfait{' '}
          <span className="font-semibold" style={{ color: TEXT_PRIMARY }}>
            {tierLabel}
          </span>
          .
        </p>
        <p className="mb-6 text-xs" style={{ color: TEXT_MUTED_LUXE }}>
          Passez à un forfait supérieur pour adapter l&apos;identité visuelle de votre
          établissement.
        </p>
        <button
          type="button"
          onClick={() =>
            toast.info(
              'La personnalisation est incluse à partir du forfait Standard. Consultez la section « Mon abonnement » pour passer à un forfait supérieur.'
            )
          }
          className="edu-gold-cta rounded-xl px-6 py-2.5 text-sm font-semibold"
        >
          Voir les forfaits
        </button>
      </div>
    )
  }

  return <PersonalizationViewInner userData={userData} isSuperAdmin={isSuperAdmin} />
}

// ─── Éditeur (rôles autorisés uniquement) ───────────────────────────────────

function PersonalizationViewInner({
  userData,
  isSuperAdmin,
}: {
  userData: UserData | null
  isSuperAdmin: boolean
}) {
  const { setUserData } = useEduGestStore()

  // `colors` : toujours des hex valides (aperçu + picker) — `drafts` : texte brut des champs hex
  const [colors, setColors] = useState<DesignColors>({ ...DEFAULTS })
  const [drafts, setDrafts] = useState<DesignColors>({ ...DEFAULTS })
  const [savedColors, setSavedColors] = useState<DesignColors>({ ...DEFAULTS })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)

  const isDirty =
    colors.primary !== savedColors.primary ||
    colors.accent !== savedColors.accent ||
    colors.gold !== savedColors.gold

  // Couleurs affichées dans l'aperçu : `colors` est toujours valide, même si un
  // champ hex est en cours de saisie (l'aperçu reste alors sur la dernière valeur valide)
  const currentSchoolName = isSuperAdmin
    ? schools.find((s) => s.id === selectedSchoolId)?.name || 'École'
    : userData?.schoolName || 'École'
  const brandInitial = (currentSchoolName.trim().charAt(0) || 'E').toUpperCase()

  // ── Chargement du design ──────────────────────────────────────────────────
  const loadDesign = useCallback(async (schoolIdParam?: string) => {
    setLoading(true)
    try {
      const url = schoolIdParam
        ? `/api/school/design?schoolId=${encodeURIComponent(schoolIdParam)}`
        : '/api/school/design'
      const res = await authFetch(url)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || 'Impossible de charger le design actuel')
        return
      }
      const data = json?.data
      if (Array.isArray(data?.schools)) {
        setSchools(
          (data.schools as Array<{ id: string; name: string }>).filter(
            (s) => typeof s?.id === 'string' && typeof s?.name === 'string'
          )
        )
      }
      if (typeof data?.schoolId === 'string') setSelectedSchoolId(data.schoolId)
      const design = data?.design
      const loaded: DesignColors = {
        primary: typeof design?.primary === 'string' ? design.primary : DEFAULTS.primary,
        accent: typeof design?.accent === 'string' ? design.accent : DEFAULTS.accent,
        gold: typeof design?.gold === 'string' ? design.gold : DEFAULTS.gold,
      }
      setColors(loaded)
      setDrafts(loaded)
      setSavedColors(loaded)
    } catch {
      toast.error('Erreur réseau lors du chargement du design')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Amorçage ──────────────────────────────────────────────────────────────
  // SCHOOL_ADMIN : design de sa propre école.
  // SUPER_ADMIN_GLOBAL : l'API exige ?schoolId → on amorce le sélecteur via la
  // liste publique /api/schools, puis on charge le design de la 1ère école
  // (les GET suivants rafraîchissent la liste via data.schools).
  useEffect(() => {
    let cancelled = false
    async function boot() {
      if (isSuperAdmin) {
        try {
          const res = await authFetch('/api/schools?limit=100')
          const json = await res.json().catch(() => ({}))
          if (cancelled) return
          if (res.ok && Array.isArray(json?.data)) {
            const list: SchoolOption[] = (json.data as Array<{ id: string; name: string }>)
              .filter((s) => typeof s?.id === 'string' && typeof s?.name === 'string')
              .map((s) => ({ id: s.id, name: s.name }))
            setSchools(list)
            if (list.length > 0) {
              setSelectedSchoolId(list[0].id)
              await loadDesign(list[0].id)
              return
            }
            toast.error('Aucune école disponible sur la plateforme')
          } else {
            toast.error(json?.error || 'Impossible de charger la liste des écoles')
          }
        } catch {
          if (!cancelled) toast.error('Erreur réseau lors du chargement des écoles')
        }
        if (!cancelled) setLoading(false)
      } else {
        await loadDesign()
      }
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [isSuperAdmin, loadDesign])

  // ── Synchronisation couleurs ↔ champs hex ─────────────────────────────────
  const applyColors = (next: DesignColors) => {
    setColors(next)
    setDrafts(next)
  }

  // Picker natif ou clic sur une nuance : valeur toujours valide
  const handleColorChange = (key: ColorKey, next: string) => {
    setColors((prev) => ({ ...prev, [key]: next }))
    setDrafts((prev) => ({ ...prev, [key]: next }))
  }

  // Saisie clavier : met à jour le brouillon, puis `colors` dès que le format est complet
  const handleDraftChange = (key: ColorKey, next: string) => {
    if (!HEX_INPUT_RE.test(next)) return
    setDrafts((prev) => ({ ...prev, [key]: next }))
    if (HEX_RE.test(next)) {
      setColors((prev) => ({ ...prev, [key]: next }))
    }
  }

  // ── Changement d'école (SUPER_ADMIN_GLOBAL) ───────────────────────────────
  const handleSchoolChange = (id: string) => {
    if (!id || id === selectedSchoolId) return
    setSelectedSchoolId(id)
    loadDesign(id)
  }

  // ── Enregistrement ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!HEX_RE.test(colors.primary) || !HEX_RE.test(colors.accent) || !HEX_RE.test(colors.gold)) {
      toast.error('Vérifiez le format des couleurs — chaque code doit être au format #RRGGBB.')
      return
    }
    if (isSuperAdmin && !selectedSchoolId) {
      toast.error('Sélectionnez d’abord une école à personnaliser.')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, string> = {
        primary: colors.primary,
        accent: colors.accent,
        gold: colors.gold,
      }
      if (isSuperAdmin) body.schoolId = selectedSchoolId as string

      const res = await authFetch('/api/school/design', {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || "Impossible d'enregistrer le design")
        return
      }
      const design = json?.data?.design
      const saved: DesignColors = {
        primary: typeof design?.primary === 'string' ? design.primary : colors.primary,
        accent: typeof design?.accent === 'string' ? design.accent : colors.accent,
        gold: typeof design?.gold === 'string' ? design.gold : colors.gold,
      }
      setColors(saved)
      setDrafts(saved)
      setSavedColors(saved)
      // L'app réagira via userData.schoolDesign (géré ailleurs) — on met à jour le store
      if (userData) {
        setUserData({ ...userData, schoolDesign: { ...saved } })
      }
      toast.success('Design enregistré — appliqué aux utilisateurs de votre école')
    } catch {
      toast.error("Erreur réseau lors de l'enregistrement du design")
    } finally {
      setSaving(false)
    }
  }

  // ── Réinitialisation (défauts EduGest) ────────────────────────────────────
  const handleReset = () => {
    applyColors({ primary: DEFAULTS.primary, accent: DEFAULTS.accent, gold: DEFAULTS.gold })
  }

  const activePreset = PRESETS.find(
    (p) => p.primary === colors.primary && p.accent === colors.accent && p.gold === colors.gold
  )

  if (loading) {
    return (
      <div className="grid h-48 w-full place-items-center" role="status">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: ACCENT }} aria-hidden="true" />
        <span className="sr-only">Chargement de la personnalisation…</span>
      </div>
    )
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8" style={{ backgroundColor: IVORY_WARM }}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* ── Sélecteur d'école (SUPER_ADMIN_GLOBAL) ── */}
        {isSuperAdmin && (
          <div
            className="rounded-2xl p-4 sm:p-5"
            style={{ backgroundColor: '#ffffff', border: `1px solid ${BORDER}` }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex shrink-0 items-center gap-2">
                <Building2 className="h-4 w-4" style={{ color: GOLD }} aria-hidden="true" />
                <label
                  htmlFor="school-design-select"
                  className="text-sm font-semibold"
                  style={{ color: TEXT_PRIMARY }}
                >
                  École à personnaliser
                </label>
              </div>
              <select
                id="school-design-select"
                value={selectedSchoolId ?? ''}
                onChange={(e) => handleSchoolChange(e.target.value)}
                disabled={loading || schools.length === 0}
                className="h-10 w-full rounded-xl px-3 text-sm outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ border: `1px solid ${BORDER}`, backgroundColor: IVORY, color: TEXT_PRIMARY }}
              >
                {schools.length === 0 && <option value="">Aucune école disponible</option>}
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ── Carte principale : aperçu en temps réel ── */}
        <Card className="overflow-hidden rounded-2xl py-0" style={{ borderColor: BORDER, backgroundColor: '#ffffff' }}>
          {/* En-tête dégradé */}
          <div
            className="flex items-center gap-3 px-5 py-5 sm:px-6"
            style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.accent} 100%)` }}
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15">
              <Palette className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-bold text-white sm:text-lg">
                Personnalisation de l&apos;App
              </h2>
              <p className="truncate text-xs text-white/75">
                Adaptez l&apos;identité visuelle de votre école —{' '}
                <span className="font-mono">
                  {colors.primary} · {colors.accent} · {colors.gold}
                </span>
              </p>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden="true" />
              TEMPS RÉEL
            </span>
          </div>

          <CardContent className="px-4 py-5 sm:px-6">
            {/* Mini maquette de l'app */}
            <div
              className="flex overflow-hidden rounded-xl"
              style={{ border: `1px solid ${BORDER}` }}
              aria-label="Aperçu de l'interface aux couleurs choisies"
            >
              {/* Mini sidebar — fond couleur principale */}
              <div className="flex w-24 shrink-0 flex-col gap-1 p-3 sm:w-36" style={{ backgroundColor: colors.primary }}>
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                    style={{ backgroundColor: colors.gold, color: colors.primary }}
                    aria-hidden="true"
                  >
                    {brandInitial}
                  </span>
                  <span className="truncate text-[10px] font-semibold text-white/90">
                    EduGest
                  </span>
                </div>
                {MOCK_MENU.map((item, index) => {
                  const Icon = item.icon
                  const active = index === 0
                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                      style={
                        active
                          ? { backgroundColor: 'rgba(255, 255, 255, 0.1)', color: colors.gold, boxShadow: `inset 2px 0 0 ${colors.gold}` }
                          : { color: 'rgba(255, 255, 255, 0.6)' }
                      }
                    >
                      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate text-[9px] font-medium sm:text-[10px]">
                        {item.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Zone contenu claire */}
              <div className="min-w-0 flex-1 p-4" style={{ backgroundColor: IVORY }}>
                <div className="text-sm font-bold" style={{ color: TEXT_PRIMARY }}>
                  Tableau de bord
                </div>
                <div className="truncate text-[10px]" style={{ color: TEXT_MUTED_LUXE }}>
                  Bienvenue sur votre espace — {currentSchoolName}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: colors.accent }}
                  >
                    Nouvel élève
                  </span>
                  <span
                    className="inline-flex items-center rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                    style={{ backgroundColor: colors.gold, color: DARK }}
                  >
                    Rapport
                  </span>
                </div>
                <div className="mt-3 grid max-w-[260px] grid-cols-2 gap-2">
                  <div
                    className="rounded-xl p-2.5"
                    style={{ backgroundColor: '#ffffff', border: `1px solid ${BORDER}` }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: colors.accent }}
                        aria-hidden="true"
                      />
                      <span className="text-[9px] font-medium uppercase tracking-wide" style={{ color: TEXT_MUTED_LUXE }}>
                        Élèves
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm font-bold" style={{ color: TEXT_PRIMARY }}>
                      1 248
                    </div>
                  </div>
                  <div
                    className="rounded-xl p-2.5"
                    style={{ backgroundColor: '#ffffff', border: `1px solid ${BORDER}` }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: colors.gold }}
                        aria-hidden="true"
                      />
                      <span className="text-[9px] font-medium uppercase tracking-wide" style={{ color: TEXT_MUTED_LUXE }}>
                        Présence
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm font-bold" style={{ color: TEXT_PRIMARY }}>
                      96 %
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs" style={{ color: TEXT_MUTED_LUXE }}>
              Aperçu en direct — la sidebar, les boutons et les éléments actifs adoptent
              instantanément vos couleurs.
            </p>
          </CardContent>
        </Card>

        {/* ── Grille 2 colonnes : couleurs + presets ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Couleurs de l'application */}
          <Card className="rounded-2xl" style={{ borderColor: BORDER, backgroundColor: '#ffffff' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base" style={{ color: TEXT_PRIMARY }}>
                <Palette className="h-4 w-4" style={{ color: ACCENT }} aria-hidden="true" />
                Couleurs de l&apos;application
              </CardTitle>
              <CardDescription style={{ color: TEXT_MUTED_LUXE }}>
                Définissez les trois couleurs qui habillent toute l&apos;interface, ou piochez
                dans une nuance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ColorField
                label="Couleur principale"
                description="Sidebars & fonds sombres"
                color={colors.primary}
                text={drafts.primary}
                onColorChange={(v) => handleColorChange('primary', v)}
                onTextChange={(v) => handleDraftChange('primary', v)}
              />
              <ColorField
                label="Couleur accent"
                description="Boutons & éléments actifs"
                color={colors.accent}
                text={drafts.accent}
                onColorChange={(v) => handleColorChange('accent', v)}
                onTextChange={(v) => handleDraftChange('accent', v)}
              />
              <ColorField
                label="Couleur dorée"
                description="Surbrillances & badges"
                color={colors.gold}
                text={drafts.gold}
                onColorChange={(v) => handleColorChange('gold', v)}
                onTextChange={(v) => handleDraftChange('gold', v)}
              />
            </CardContent>
          </Card>

          {/* Presets de palettes */}
          <Card className="rounded-2xl" style={{ borderColor: BORDER, backgroundColor: '#ffffff' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base" style={{ color: TEXT_PRIMARY }}>
                <Sparkles className="h-4 w-4" style={{ color: GOLD }} aria-hidden="true" />
                Palettes prédéfinies
              </CardTitle>
              <CardDescription style={{ color: TEXT_MUTED_LUXE }}>
                Un clic pour appliquer une palette complète à l&apos;aperçu.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {PRESETS.map((preset) => {
                const active =
                  activePreset?.name === preset.name
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      applyColors({
                        primary: preset.primary,
                        accent: preset.accent,
                        gold: preset.gold,
                      })
                    }
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2"
                    style={{
                      border: `1px solid ${active ? preset.accent : BORDER}`,
                      backgroundColor: active ? `${preset.accent}0d` : 'transparent',
                    }}
                    aria-pressed={active}
                  >
                    <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
                      <span
                        className="h-6 w-6 rounded-full ring-2 ring-white"
                        style={{ backgroundColor: preset.primary }}
                      />
                      <span
                        className="h-6 w-6 rounded-full ring-2 ring-white"
                        style={{ backgroundColor: preset.accent }}
                      />
                      <span
                        className="h-6 w-6 rounded-full ring-2 ring-white"
                        style={{ backgroundColor: preset.gold }}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                        {preset.name}
                      </span>
                      <span className="block truncate font-mono text-[10px]" style={{ color: TEXT_MUTED_LUXE }}>
                        {preset.primary} · {preset.accent} · {preset.gold}
                      </span>
                    </span>
                    {active && (
                      <Check
                        className="h-4 w-4 shrink-0"
                        style={{ color: preset.accent }}
                        aria-label={`${preset.name} appliquée`}
                      />
                    )}
                  </button>
                )
              })}
              <div
                className="mt-3 flex items-start gap-2 rounded-xl p-3"
                style={{ backgroundColor: IVORY, border: `1px solid ${BORDER}` }}
              >
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: SUCCESS }} aria-hidden="true" />
                <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>
                  L&apos;aperçu se met à jour instantanément. Cliquez sur{' '}
                  <span className="font-semibold" style={{ color: TEXT_PRIMARY }}>
                    Enregistrer
                  </span>{' '}
                  pour appliquer le design à tous les utilisateurs de votre école.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Actions ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span
            className="flex items-center gap-2 text-xs font-medium"
            style={{ color: TEXT_MUTED_LUXE }}
            role="status"
          >
            {isDirty ? (
              <>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: WARNING }}
                  aria-hidden="true"
                />
                Modifications non enregistrées
              </>
            ) : (
              <>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: SUCCESS }}
                  aria-hidden="true"
                />
                Design synchronisé
              </>
            )}
          </span>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={saving}
              className="h-11 rounded-xl px-5 font-semibold"
              style={{ borderColor: BORDER, color: TEXT_PRIMARY, backgroundColor: '#ffffff' }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Réinitialiser
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-11 rounded-xl px-6 font-semibold text-white"
              style={{ backgroundColor: colors.accent }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Bloc couleur : picker + champ hex + bande de nuances ───────────────────

function ColorField({
  label,
  description,
  color,
  text,
  onColorChange,
  onTextChange,
}: {
  label: string
  description: string
  color: string
  text: string
  onColorChange: (next: string) => void
  onTextChange: (next: string) => void
}) {
  const isValid = HEX_RE.test(text)
  const shades = useMemo(() => shadeBand(color), [color])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          aria-label={`${label} — sélecteur de couleur`}
          className="h-12 w-12 shrink-0 cursor-pointer rounded-xl border bg-transparent p-0 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0.5"
          style={{ borderColor: BORDER }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
            {label}
          </div>
          <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>
            {description}
          </div>
        </div>
        <Input
          type="text"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          maxLength={7}
          spellCheck={false}
          aria-label={`${label} — code hexadécimal`}
          className="h-10 w-24 font-mono text-sm"
          style={isValid ? { borderColor: BORDER, color: TEXT_PRIMARY } : { borderColor: DANGER, color: DANGER }}
        />
      </div>
      <div
        className="mt-3 flex h-8 overflow-hidden rounded-lg"
        style={{ border: `1px solid ${BORDER}` }}
        role="group"
        aria-label={`Nuances de la ${label.toLowerCase()}`}
      >
        {shades.map((shade) => (
          <button
            key={shade}
            type="button"
            onClick={() => onColorChange(shade)}
            title={shade.toUpperCase()}
            aria-label={`Appliquer la nuance ${shade.toUpperCase()}`}
            className="h-full flex-1 transition-transform hover:scale-y-110 focus-visible:z-10 focus-visible:outline-none"
            style={{ backgroundColor: shade }}
          />
        ))}
      </div>
    </div>
  )
}
