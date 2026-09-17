'use client'

import AppSelect from '@/components/ui/AppSelect'
import PlatformApiConfigSection from '@/components/views/PlatformApiConfigSection'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ListChecks,
  FileText,
  Globe2,
  CalendarClock,
  Eye,
  Trash2,
  Power,
  Loader2,
  Plus,
  MessageSquareText,
  RefreshCw,
  Building2,
  Megaphone,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '@/lib/store'
import { GOLD, ACCENT, SUCCESS, DANGER, TEXT_PRIMARY, TEXT_MUTED_LUXE, BORDER, IVORY } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Types (API: /api/platform-events, /api/schools)
// ---------------------------------------------------------------------------

type PlatformEventKey = 'CLASS_PASSING' | 'BULLETIN_PUBLICATION'

interface PlatformEvent {
  id: string
  key: PlatformEventKey | string
  schoolId: string | null
  school: { name: string; shortName: string } | null
  schoolYearLabel?: string | null
  officialDate: string
  visibleDaysBefore: number
  enabled: boolean
  message: string
  createdByName: string
  createdAt: string
}

interface SchoolOption {
  id: string
  name: string
  shortName: string
}

// ---------------------------------------------------------------------------
// Feature card definitions
// ---------------------------------------------------------------------------

const FEATURE_CARDS: {
  key: PlatformEventKey
  title: string
  description: string
  icon: typeof ListChecks
  defaultDays: number
}[] = [
  {
    key: 'CLASS_PASSING',
    title: 'Passage de classe',
    description: "Délibérations de fin d'année : élèves à risque (notes + discipline), décisions et repêchage.",
    icon: ListChecks,
    defaultDays: 14,
  },
  {
    key: 'BULLETIN_PUBLICATION',
    title: 'Publication des bulletins',
    description: 'Ouverture de la publication des bulletins pour toutes les écoles, tous systèmes confondus.',
    icon: FileText,
    defaultDays: 21,
  },
]

const KEY_LABELS: Record<string, string> = {
  CLASS_PASSING: 'Passage de classe',
  BULLETIN_PUBLICATION: 'Publication des bulletins',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFrDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function openDateOf(event: Pick<PlatformEvent, 'officialDate' | 'visibleDaysBefore'>): Date {
  return new Date(new Date(event.officialDate).getTime() - event.visibleDaysBefore * 24 * 60 * 60 * 1000)
}

// ---------------------------------------------------------------------------
// Per-feature scheduling card
// ---------------------------------------------------------------------------

interface FeatureCardState {
  datetimeLocal: string
  daysBefore: number
  schoolId: string // '' = toutes les écoles
  message: string
}

function FeatureCard({
  featureKey,
  title,
  description,
  Icon,
  defaultDays,
  schools,
  onCreated,
}: {
  featureKey: PlatformEventKey
  title: string
  description: string
  Icon: typeof ListChecks
  defaultDays: number
  schools: SchoolOption[]
  onCreated: () => void
}) {
  const [form, setForm] = useState<FeatureCardState>({
    datetimeLocal: '',
    daysBefore: defaultDays,
    schoolId: '',
    message: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.datetimeLocal) {
      toast.error('Veuillez choisir la date officielle.')
      return
    }
    if (form.daysBefore < 0) {
      toast.error('Le nombre de jours avant apparition doit être positif.')
      return
    }
    setSaving(true)
    try {
      const res = await authFetch('/api/platform-events', {
        method: 'POST',
        body: JSON.stringify({
          key: featureKey,
          schoolId: form.schoolId || null,
          officialDate: new Date(form.datetimeLocal).toISOString(),
          visibleDaysBefore: form.daysBefore,
          enabled: true,
          message: form.message,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success(`« ${title} » programmé avec succès`)
      setForm({ datetimeLocal: '', daysBefore: defaultDays, schoolId: '', message: '' })
      onCreated()
    } catch {
      toast.error('Échec de la programmation. Veuillez réessayer.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-xl border border-[oklch(90%_0.01_175)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[oklch(55%_0.15_175/0.25)] transition'
  const labelClass = 'text-[11px] font-bold uppercase tracking-wide mb-1.5 block'

  return (
    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'oklch(95% 0.04 175)', color: ACCENT }}
        >
          <Icon className="w-5 h-5" />
        </span>
        <div>
          <h3 className="text-base font-extrabold tracking-tight" style={{ color: TEXT_PRIMARY }}>
            {title}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>
            {description}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
              Date officielle
            </label>
            <input
              type="datetime-local"
              value={form.datetimeLocal}
              onChange={(e) => setForm((f) => ({ ...f, datetimeLocal: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
              Apparition X jours avant
            </label>
            <input
              type="number"
              min={0}
              value={form.daysBefore}
              onChange={(e) => setForm((f) => ({ ...f, daysBefore: parseInt(e.target.value, 10) || 0 }))}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
            École concernée
          </label>
          <AppSelect
            value={form.schoolId}
            onChange={(val) => setForm((f) => ({ ...f, schoolId: val }))}
            placeholder="Toutes les écoles"
            options={[
              { value: '', label: 'Toutes les écoles' },
              ...schools.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>

        <div>
          <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
            Message (optionnel)
          </label>
          <textarea
            rows={2}
            placeholder="Message affiché aux écoles lors de l'événement…"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            className={`${inputClass} resize-none`}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ background: 'oklch(15% 0.02 250)' }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {saving ? 'Programmation…' : 'Programmer'}
        </button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Event list item
// ---------------------------------------------------------------------------

function EventItem({
  event,
  onChanged,
  onDeleted,
}: {
  event: PlatformEvent
  onChanged: () => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState<'toggle' | 'delete' | null>(null)
  const open = openDateOf(event)

  async function handleToggle() {
    setBusy('toggle')
    try {
      const res = await authFetch(`/api/platform-events/${event.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !event.enabled }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success(event.enabled ? 'Événement désactivé' : 'Événement activé')
      onChanged()
    } catch {
      toast.error('Impossible de modifier cet événement.')
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Supprimer définitivement cet événement programmé ?')) return
    setBusy('delete')
    try {
      const res = await authFetch(`/api/platform-events/${event.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success('Événement supprimé')
      onDeleted()
    } catch {
      toast.error('Impossible de supprimer cet événement.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className={`rounded-xl border p-3 sm:p-4 transition-colors ${
        event.enabled ? 'border-[oklch(88%_0.02_175)] bg-white' : 'border-[oklch(92%_0.01_175)] bg-[oklch(98%_0.004_250)]'
      }`}
    >
      <div className="flex flex-wrap items-start gap-2.5 justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
              style={{ background: 'oklch(95% 0.04 175)', color: ACCENT }}
            >
              <Building2 className="w-3 h-3" />
              {event.school ? event.school.name : 'Toutes les écoles'}
            </span>
            {event.schoolYearLabel && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: 'oklch(95% 0.05 65)', color: 'oklch(50% 0.14 65)' }}
              >
                {event.schoolYearLabel}
              </span>
            )}
            {!event.enabled && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                style={{ background: 'oklch(58% 0.20 25 / 0.10)', color: DANGER }}
              >
                Désactivé
              </span>
            )}
          </div>

          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5" style={{ color: TEXT_PRIMARY }}>
              <CalendarClock className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
              <span>
                Date officielle : <strong>{formatFrDate(event.officialDate)}</strong>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5" style={{ color: TEXT_PRIMARY }}>
              <Eye className="w-3.5 h-3.5 shrink-0" style={{ color: ACCENT }} />
              <span>
                Visible dès le <strong>{formatFrDate(open)}</strong>
              </span>
            </span>
          </div>

          {event.message && (
            <p className="mt-2 flex items-start gap-1.5 text-xs italic rounded-lg bg-[oklch(97%_0.008_175)] px-2.5 py-1.5" style={{ color: TEXT_MUTED_LUXE }}>
              <MessageSquareText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {event.message}
            </p>
          )}

          <p className="mt-2 text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>
            Créé par {event.createdByName || '—'} · {formatFrDate(event.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleToggle}
            disabled={busy !== null}
            title={event.enabled ? 'Désactiver' : 'Activer'}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition hover:opacity-85 disabled:opacity-50"
            style={event.enabled ? { background: SUCCESS, color: IVORY } : { background: 'oklch(90% 0.01 175)', color: TEXT_MUTED_LUXE }}
          >
            {busy === 'toggle' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Power className="w-3.5 h-3.5" />
            )}
            {event.enabled ? 'Activé' : 'Désactivé'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy !== null}
            title="Supprimer"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition hover:opacity-85 disabled:opacity-50"
            style={{ background: 'oklch(58% 0.20 25 / 0.10)', color: DANGER }}
          >
            {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Annonces plateforme (nouveautés…) → notifications des admins d'écoles
// ---------------------------------------------------------------------------

function AnnouncementCard({ schools }: { schools: SchoolOption[] }) {
  const [schoolId, setSchoolId] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const inputClass =
    'w-full rounded-xl border border-[oklch(90%_0.01_175)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[oklch(55%_0.15_175/0.25)] transition'
  const labelClass = 'text-[11px] font-bold uppercase tracking-wide mb-1.5 block'

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !message.trim()) {
      toast.error('Titre et message requis.')
      return
    }
    setSending(true)
    try {
      const res = await authFetch('/api/platform-announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId: schoolId || null, title: title.trim(), message: message.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      toast.success(`Annonce envoyée à ${json?.data?.sent ?? 0} administrateur(s)`)
      setSchoolId('')
      setTitle('')
      setMessage('')
    } catch (e: any) {
      toast.error(e?.message || "Échec de l'envoi de l'annonce.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'oklch(95% 0.05 65)', color: 'oklch(55% 0.15 65)' }}
        >
          <Megaphone className="w-5 h-5" />
        </span>
        <div>
          <h3 className="text-base font-extrabold tracking-tight" style={{ color: TEXT_PRIMARY }}>
            Annonces plateforme
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>
            Nouveautés, maintenance, infos — notification in-app (+ push) aux administrateurs des écoles.
          </p>
        </div>
      </div>

      <form onSubmit={handleSend} className="mt-4 space-y-3">
        <div>
          <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
            Écoles destinataires
          </label>
          <AppSelect
            value={schoolId}
            onChange={setSchoolId}
            placeholder="Toutes les écoles"
            options={[
              { value: '', label: 'Toutes les écoles' },
              ...schools.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
        <div>
          <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
            Titre
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex. Nouveauté : bulletins PDF vérifiables"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
            Message
          </label>
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Décrivez la nouveauté ou l'information à diffuser…"
            className={`${inputClass} resize-none`}
          />
        </div>
        <button
          type="submit"
          disabled={sending}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ background: GOLD }}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? 'Envoi…' : 'Envoyer l’annonce'}
        </button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function PlatformControlView() {
  const [events, setEvents] = useState<PlatformEvent[]>([])
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchEvents = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await authFetch('/api/platform-events')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setEvents(Array.isArray(json?.data) ? (json.data as PlatformEvent[]) : [])
    } catch {
      toast.error('Impossible de charger les événements de la plateforme.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const fetchSchools = useCallback(async () => {
    try {
      const res = await authFetch('/api/schools?limit=100')
      if (!res.ok) return
      const json = await res.json()
      setSchools(Array.isArray(json?.data) ? (json.data as SchoolOption[]) : [])
    } catch {
      /* silencieux : le sélecteur affichera uniquement « Toutes les écoles » */
    }
  }, [])

  useEffect(() => {
    fetchEvents()
    fetchSchools()
  }, [fetchEvents, fetchSchools])

  // Groupe les événements par clé, dans l'ordre des cartes
  const grouped = useMemo(() => {
    const groups: { key: string; label: string; events: PlatformEvent[] }[] = FEATURE_CARDS.map((f) => ({
      key: f.key,
      label: KEY_LABELS[f.key] ?? f.key,
      events: [],
    }))
    for (const ev of events) {
      let g = groups.find((x) => x.key === ev.key)
      if (!g) {
        g = { key: ev.key, label: KEY_LABELS[ev.key] ?? ev.key, events: [] }
        groups.push(g)
      }
      g.events.push(ev)
    }
    return groups.filter((g) => g.events.length > 0)
  }, [events])

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-6 rounded-full" style={{ background: GOLD }} />
          <div>
            <h2 className="text-lg font-extrabold tracking-tight" style={{ color: TEXT_PRIMARY }}>
              Contrôle de la plateforme
            </h2>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>
              Définissez quand les interfaces apparaissent côté écoles — à une date officielle, en amont.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => fetchEvents(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[oklch(90%_0.01_175)] bg-white px-3 py-2 text-xs font-bold transition hover:bg-[oklch(97%_0.005_175)] disabled:opacity-60"
          style={{ color: TEXT_PRIMARY }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Cartes de programmation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FEATURE_CARDS.map((f) => (
          <FeatureCard
            key={f.key}
            featureKey={f.key}
            title={f.title}
            description={f.description}
            Icon={f.icon}
            defaultDays={f.defaultDays}
            schools={schools}
            onCreated={() => fetchEvents(true)}
          />
        ))}
        <AnnouncementCard schools={schools} />
      </div>

      {/* Communication & notifications (Resend, SMS) + Base de données */}
      <PlatformApiConfigSection />

      {/* Liste des événements existants */}
      <section>
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-1 h-6 rounded-full" style={{ background: GOLD }} />
          <h3 className="text-lg font-extrabold tracking-tight" style={{ color: TEXT_PRIMARY }}>
            Événements programmés
          </h3>
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-bold"
            style={{ background: 'oklch(95% 0.04 175)', color: ACCENT }}
          >
            {events.length}
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-4">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 w-1/3 rounded bg-[oklch(93%_0.01_175)]" />
                  <div className="h-3 w-2/3 rounded bg-[oklch(93%_0.01_175)]" />
                </div>
              </div>
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-8 text-center">
            <Globe2 className="w-8 h-8 mx-auto mb-2" style={{ color: TEXT_MUTED_LUXE }} />
            <p className="text-sm font-bold" style={{ color: TEXT_PRIMARY }}>Aucun événement programmé</p>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED_LUXE }}>
              Utilisez les cartes ci-dessus pour planifier le passage de classe ou la publication des bulletins.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map((g) => (
              <div key={g.key}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wide"
                    style={{ background: 'oklch(15% 0.02 250)', color: IVORY }}
                  >
                    {g.label}
                  </span>
                  <div className="h-px flex-1" style={{ background: BORDER }} />
                </div>
                <div className="space-y-2.5">
                  {g.events.map((ev) => (
                    <EventItem
                      key={ev.id}
                      event={ev}
                      onChanged={() => fetchEvents(true)}
                      onDeleted={() => fetchEvents(true)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
