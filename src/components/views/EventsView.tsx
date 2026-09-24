'use client'

// ─── Événements scolaires — vue autonome ────────────────────────────────────
//  - GET  /api/events?schoolId=…&scope=upcoming|past  → sections « À venir »
//    et « Passés » (super admin : TOUJOURS schoolId=getActiveSchoolId() ;
//    rôles école : param omis, le serveur scelle sur user.schoolId)
//  - POST /api/events { schoolId, title, description?, category, startAt,
//    endAt?, location?, audience? } → création (SAG, SCHOOL_ADMIN, DIRECTION_*,
//    SECRETARY)
//  - PUT/DELETE /api/events/[id] → édition (mêmes rôles) et suppression
//    (SAG + SCHOOL_ADMIN uniquement)
// Design EduGest : or/oklch, cartes arrondies, badges ambre/or/vert — pas de bleu.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useEduGestStore, authFetch, getActiveSchoolId } from '@/lib/store'
import type { UserRole } from '@/lib/types'
import { GOLD, GOLD_SOFT, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY, SUCCESS, SUCCESS_SOFT, DANGER, WARNING } from '@/lib/constants'
import AppSelect from '@/components/ui/AppSelect'
import {
  CalendarDays, CalendarClock, MapPin, Users, Plus, Pencil, Trash2,
  ShieldAlert, Clock, X, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

interface SchoolEventRow {
  id: string
  title: string
  description: string | null
  category: string
  startAt: string
  endAt: string | null
  location: string | null
  audience: string
  creatorName?: string | null
}

const CATEGORIES = ['REUNION', 'EXAMEN', 'FETE', 'REUNION_PARENTS', 'SORTIE', 'AUTRE']
const AUDIENCES = ['ALL', 'PERSONNEL', 'PARENTS']

// Badges catégorie : ton ambre / or / vert — jamais de bleu.
const CATEGORY_META: Record<string, { label: string; bg: string; color: string }> = {
  REUNION: { label: 'Réunion', bg: GOLD_SOFT, color: GOLD },
  EXAMEN: { label: 'Examen', bg: 'oklch(95% 0.04 145)', color: SUCCESS },
  FETE: { label: 'Fête', bg: 'oklch(95% 0.06 85)', color: 'oklch(58% 0.14 75)' },
  REUNION_PARENTS: { label: 'Réunion parents', bg: 'oklch(96% 0.04 100)', color: WARNING },
  SORTIE: { label: 'Sortie scolaire', bg: 'oklch(95% 0.04 175)', color: ACCENT },
  AUTRE: { label: 'Autre', bg: 'oklch(95% 0.01 175)', color: TEXT_MUTED_LUXE },
}

const AUDIENCE_LABEL: Record<string, string> = {
  ALL: 'Tout le monde',
  PERSONNEL: 'Personnel',
  PARENTS: 'Parents',
}

const WRITE_ROLES: UserRole[] = [
  'SUPER_ADMIN_GLOBAL',
  'SCHOOL_ADMIN',
  'DIRECTION_MATERNELLE',
  'DIRECTION_PRIMAIRE',
  'DIRECTION_SECONDAIRE',
  'SECRETARY',
]
const DELETE_ROLES: UserRole[] = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN']

interface EventForm {
  title: string
  category: string
  startAt: string
  endAt: string
  location: string
  audience: string
  description: string
}

const EMPTY_FORM: EventForm = { title: '', category: 'REUNION', startAt: '', endAt: '', location: '', audience: 'ALL', description: '' }

function fmtRange(startAt: string, endAt: string | null): string {
  try {
    const s = new Date(startAt)
    const dateLabel = s.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    const startTime = s.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    if (!endAt) return `${dateLabel} · ${startTime}`
    const e = new Date(endAt)
    const endTime = e.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    if (s.toDateString() === e.toDateString()) return `${dateLabel} · ${startTime} → ${endTime}`
    const eLabel = e.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    return `${dateLabel} ${startTime} → ${eLabel} ${endTime}`
  } catch {
    return startAt
  }
}

/** datetime-local attend « yyyy-MM-ddTHH:mm » en heure locale. */
function toLocalInput(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

export default function EventsView() {
  const { userRole } = useEduGestStore()
  const isSAG = userRole === 'SUPER_ADMIN_GLOBAL'
  const canWrite = WRITE_ROLES.includes(userRole as UserRole)
  const canDelete = DELETE_ROLES.includes(userRole as UserRole)

  const [upcoming, setUpcoming] = useState<SchoolEventRow[]>([])
  const [past, setPast] = useState<SchoolEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SchoolEventRow | null>(null)
  const [form, setForm] = useState<EventForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const schoolId = getActiveSchoolId()
  // Recharge quand l'école de contexte change (super admin).
  const activeSchoolId = useMemo(() => schoolId, [schoolId])

  // Aucun setState synchrone dans le corps de l'effet : tout passe par les
  // callbacks .then/.finally (règle react-hooks/set-state-in-effect).
  const load = useCallback(() => {
    const params = new URLSearchParams()
    if (activeSchoolId) params.set('schoolId', activeSchoolId)
    return Promise.all([
      authFetch(`/api/events?scope=upcoming&${params}`),
      authFetch(`/api/events?scope=past&${params}`),
    ])
      .then(async ([upRes, pastRes]) => {
        const upJson = await upRes.json().catch(() => ({}))
        const pastJson = await pastRes.json().catch(() => ({}))
        if (upRes.ok) setUpcoming(upJson.data || [])
        else toast.error(upJson.error || 'Erreur lors du chargement des événements')
        if (pastRes.ok) setPast(pastJson.data || [])
      })
      .catch(() => toast.error('Erreur de connexion'))
      .finally(() => setLoading(false))
  }, [isSAG, activeSchoolId])

  useEffect(() => {
    if (isSAG && !activeSchoolId) return
    load()
  }, [load, isSAG, activeSchoolId])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(ev: SchoolEventRow) {
    setEditing(ev)
    setForm({
      title: ev.title,
      category: CATEGORIES.includes(ev.category) ? ev.category : 'AUTRE',
      startAt: toLocalInput(ev.startAt),
      endAt: ev.endAt ? toLocalInput(ev.endAt) : '',
      location: ev.location || '',
      audience: AUDIENCES.includes(ev.audience) ? ev.audience : 'ALL',
      description: ev.description || '',
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Le titre est obligatoire'); return }
    if (!form.startAt) { toast.error('La date de début est obligatoire'); return }
    if (form.endAt && form.endAt < form.startAt) { toast.error('La fin doit être après le début'); return }
    setSaving(true)
    try {
      const payload = {
        ...(activeSchoolId ? { schoolId: activeSchoolId } : {}),
        title: form.title.trim(),
        category: form.category,
        startAt: new Date(form.startAt).toISOString(),
        endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
        location: form.location.trim() || null,
        audience: form.audience,
        description: form.description.trim() || null,
      }
      const res = await authFetch(editing ? `/api/events/${editing.id}` : '/api/events', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(editing ? 'Événement mis à jour' : 'Événement créé')
        setModalOpen(false)
        load()
      } else {
        toast.error(j.error || 'Erreur lors de l\'enregistrement')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setSaving(false)
  }

  async function handleDelete(ev: SchoolEventRow) {
    if (!window.confirm(`Supprimer l'événement « ${ev.title} » ?`)) return
    setDeletingId(ev.id)
    try {
      const res = await authFetch(`/api/events/${ev.id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Événement supprimé')
        load()
      } else {
        toast.error(j.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setDeletingId(null)
  }

  // Garde d'accès : le personnel scolaire consulte, les parents n'ont pas accès.
  const blocked = userRole === 'PARENT'

  const renderCard = (ev: SchoolEventRow, past: boolean) => {
    const meta = CATEGORY_META[ev.category] || CATEGORY_META.AUTRE
    return (
      <div key={ev.id} className={`bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm flex flex-col gap-2 ${past ? 'opacity-80' : ''}`}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: meta.bg }}>
            <CalendarDays size={18} style={{ color: meta.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-[14px] truncate" style={{ color: TEXT_PRIMARY }}>{ev.title}</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0" style={{ background: meta.bg, color: meta.color }}>
                {meta.label}
              </span>
              {past && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0" style={{ background: IVORY, color: TEXT_MUTED_LUXE }}>
                  Passé
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[12px]" style={{ color: TEXT_MUTED_LUXE }}>
              <span className="inline-flex items-center gap-1"><Clock size={11} />{fmtRange(ev.startAt, ev.endAt)}</span>
              {ev.location && <span className="inline-flex items-center gap-1"><MapPin size={11} />{ev.location}</span>}
              <span className="inline-flex items-center gap-1"><Users size={11} />{AUDIENCE_LABEL[ev.audience] || ev.audience}</span>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            {canWrite && (
              <button onClick={() => openEdit(ev)} title="Modifier" className="w-7 h-7 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.05_65)] transition" style={{ color: GOLD }}>
                <Pencil size={13} />
              </button>
            )}
            {canDelete && (
              <button onClick={() => handleDelete(ev)} title="Supprimer" disabled={deletingId === ev.id} className="w-7 h-7 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_25)] transition disabled:opacity-40" style={{ color: DANGER }}>
                {deletingId === ev.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            )}
          </div>
        </div>
        {ev.description && (
          <p className="text-[12px] leading-relaxed line-clamp-2 pl-13" style={{ color: TEXT_MUTED_LUXE }}>{ev.description}</p>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Événements scolaires</h1>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ background: GOLD_SOFT, color: GOLD }}>Réunions · Examens · Fêtes</span>
        <span className="text-xs hidden sm:block" style={{ color: TEXT_MUTED_LUXE }}>Scellé par école</span>
        {canWrite && (
          <button onClick={openCreate} className="edu-gold-cta ml-auto px-4 py-2 rounded-xl text-[13px] font-semibold inline-flex items-center gap-2">
            <Plus size={14} />
            Nouvel événement
          </button>
        )}
      </div>

      {blocked ? (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-10 shadow-sm text-center">
          <div className="w-12 h-12 rounded-2xl grid place-items-center mx-auto mb-4" style={{ background: 'oklch(95% 0.04 25)' }}>
            <ShieldAlert size={22} style={{ color: DANGER }} />
          </div>
          <p className="font-semibold mb-1" style={{ color: TEXT_PRIMARY }}>Accès non autorisé</p>
          <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Les événements scolaires sont réservés au personnel de l&apos;école.</p>
        </div>
      ) : isSAG && !activeSchoolId ? (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-10 shadow-sm text-center">
          <CalendarDays size={28} className="mx-auto mb-2 opacity-30" style={{ color: TEXT_MUTED_LUXE }} />
          <p className="font-semibold mb-1" style={{ color: TEXT_PRIMARY }}>Aucune école sélectionnée</p>
          <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Choisissez une école dans la barre latérale (« École active ») ou via la vue Rapports pour consulter ses événements.</p>
        </div>
      ) : loading ? (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-10 shadow-sm text-center text-sm" style={{ color: TEXT_MUTED_LUXE }}>
          <Loader2 size={20} className="mx-auto mb-2 animate-spin" style={{ color: GOLD }} />
          Chargement des événements…
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── À venir ─────────────────────────────────────────────────── */}
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 flex items-center gap-2 border-b border-[oklch(90%_0.01_175)]" style={{ background: IVORY }}>
              <CalendarClock size={15} style={{ color: GOLD }} />
              <h3 className="font-semibold text-[14px]" style={{ color: TEXT_PRIMARY }}>À venir</h3>
              <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: GOLD_SOFT, color: GOLD }}>
                {upcoming.length} événement{upcoming.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="p-5">
              {upcoming.length === 0 ? (
                <div className="text-center py-6 text-sm" style={{ color: TEXT_MUTED_LUXE }}>
                  Aucun événement à venir{canWrite ? ' — cliquez sur « Nouvel événement » pour en programmer un' : ''}.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {upcoming.map(ev => renderCard(ev, false))}
                </div>
              )}
            </div>
          </div>

          {/* ── Passés ──────────────────────────────────────────────────── */}
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 flex items-center gap-2 border-b border-[oklch(90%_0.01_175)]" style={{ background: IVORY }}>
              <Clock size={15} style={{ color: TEXT_MUTED_LUXE }} />
              <h3 className="font-semibold text-[14px]" style={{ color: TEXT_PRIMARY }}>Passés</h3>
              <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'oklch(95% 0.01 175)', color: TEXT_MUTED_LUXE }}>
                {past.length} événement{past.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="p-5">
              {past.length === 0 ? (
                <div className="text-center py-6 text-sm" style={{ color: TEXT_MUTED_LUXE }}>Aucun événement passé.</div>
              ) : (
                <div className="space-y-2.5">
                  {past.map(ev => renderCard(ev, true))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modale création / édition ───────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-[oklch(90%_0.01_175)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                  <CalendarDays size={18} />
                </div>
                <h2 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>
                  {editing ? 'Modifier l\'événement' : 'Nouvel événement'}
                </h2>
              </div>
              <button onClick={() => setModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Titre *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Réunion de rentrée, Examen de mathématiques…"
                  className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Catégorie</label>
                  <AppSelect
                    value={form.category}
                    onChange={v => setForm(f => ({ ...f, category: v }))}
                    options={CATEGORIES.map(c => ({ value: c, label: CATEGORY_META[c]?.label || c }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Audience</label>
                  <AppSelect
                    value={form.audience}
                    onChange={v => setForm(f => ({ ...f, audience: v }))}
                    options={AUDIENCES.map(a => ({ value: a, label: AUDIENCE_LABEL[a] || a }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Début *</label>
                  <input
                    type="datetime-local"
                    value={form.startAt}
                    onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))}
                    className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Fin (optionnel)</label>
                  <input
                    type="datetime-local"
                    value={form.endAt}
                    min={form.startAt || undefined}
                    onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))}
                    className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Lieu</label>
                <input
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Salle polyvalente, cour principale…"
                  className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Détails, consignes, matériel à apporter…"
                  className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-xl text-[13px] font-semibold border border-[oklch(90%_0.01_175)]" style={{ color: TEXT_MUTED_LUXE }}>
                  Annuler
                </button>
                <button onClick={handleSave} disabled={saving} className="edu-gold-cta px-4 py-2 rounded-xl text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                  {saving ? <div className="h-3.5 w-3.5 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <CalendarDays size={13} />}
                  {editing ? 'Enregistrer' : 'Créer l\'événement'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
