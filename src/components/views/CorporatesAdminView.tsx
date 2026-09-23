'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { authFetch } from '@/lib/store'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, SUCCESS, DANGER } from '@/lib/constants'
import AppSelect from '@/components/ui/AppSelect'
import { toast } from 'sonner'
import {
  Building2, Plus, Search, RefreshCw, ChevronDown, Users, Ticket as TicketIcon,
  Link2, Unlink, ShieldCheck, ShieldOff, Trash2, KeyRound, MapPin,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN PLATEFORME — menu « Entreprises » : gestion des clients corporate
// multi-écoles (création, rattachement/détachement d'écoles, comptes
// utilisateurs, suspension, suppression).
// ═══════════════════════════════════════════════════════════════════════════

interface CorpSchoolLite { id: string; name: string; shortName?: string | null; city?: string | null }
interface CorpUser { id: string; name: string; email: string; role?: string | null }
interface CorporateItem {
  id: string
  name: string
  city?: string | null
  status: string
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  notes?: string | null
  schools?: CorpSchoolLite[]
  users?: CorpUser[]
  openTickets?: number
  _count?: { schools?: number; users?: number }
}
interface SchoolLite { id: string; name: string; shortName?: string | null; city?: string | null }

const EMPTY_FORM = { name: '', city: '', contactName: '', contactEmail: '', contactPhone: '', notes: '' }
const EMPTY_ACCOUNT = { name: '', email: '', phone: '', password: '' }

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const arr = new Uint32Array(12)
  crypto.getRandomValues(arr)
  let out = ''
  for (let i = 0; i < 12; i++) out += chars[arr[i] % chars.length]
  return out
}

function statusPill(status: string) {
  return status === 'ACTIVE'
    ? { background: 'oklch(95% 0.04 145)', color: SUCCESS, label: 'ACTIVE' }
    : { background: 'oklch(95% 0.02 25)', color: DANGER, label: 'SUSPENDED' }
}

function MiniPill({ children, tone }: { children: React.ReactNode; tone?: 'gold' }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap inline-flex items-center gap-1"
      style={tone === 'gold' ? { background: 'oklch(95% 0.05 65)', color: 'oklch(55% 0.14 65)' } : { background: 'oklch(95% 0.01 175)', color: TEXT_MUTED_LUXE }}
    >
      {children}
    </span>
  )
}

export default function CorporatesAdminView() {
  const [corporates, setCorporates] = useState<CorporateItem[]>([])
  const [schools, setSchools] = useState<SchoolLite[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Formulaire de création
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [account, setAccount] = useState(EMPTY_ACCOUNT)
  const [selectedSchools, setSelectedSchools] = useState<string[]>([])
  const [schoolSearch, setSchoolSearch] = useState('')
  const [creating, setCreating] = useState(false)

  // Liste / actions
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [attachPick, setAttachPick] = useState<Record<string, string>>({})
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/corporates')
      const j = await res.json()
      if (res.ok) setCorporates(j.data || [])
      else toast.error(j.error || 'Chargement impossible')
    } catch { toast.error('Erreur réseau') } finally { setLoading(false) }
  }, [])

  const loadSchools = useCallback(async () => {
    try {
      const res = await authFetch('/api/schools?limit=200')
      const j = await res.json()
      if (res.ok) setSchools(j.data || [])
    } catch { /* silencieux : le formulaire reste utilisable sans liste */ }
  }, [])

  useEffect(() => { load(); loadSchools() }, [load, loadSchools])

  // Confirmation de suppression : reset après 3 s
  useEffect(() => {
    if (!confirmDeleteId) return
    const t = setTimeout(() => setConfirmDeleteId(null), 3000)
    return () => clearTimeout(t)
  }, [confirmDeleteId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return corporates
    return corporates.filter(c =>
      c.name.toLowerCase().includes(q) || (c.city || '').toLowerCase().includes(q)
    )
  }, [corporates, search])

  const schoolCount = (c: CorporateItem) => Array.isArray(c.schools) ? c.schools.length : (c._count?.schools ?? 0)
  const userCount = (c: CorporateItem) => Array.isArray(c.users) ? c.users.length : (c._count?.users ?? 0)

  function toggleSchool(id: string) {
    setSelectedSchools(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function createCorporate() {
    if (!form.name.trim() || !account.name.trim() || !account.email.trim() || !account.phone.trim() || !account.password.trim()) {
      toast.error('Complétez les champs obligatoires : nom du corporate + compte (nom, email, téléphone, mot de passe)')
      return
    }
    setCreating(true)
    try {
      const res = await authFetch('/api/corporates', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          contactName: form.contactName.trim(),
          contactEmail: form.contactEmail.trim(),
          contactPhone: form.contactPhone.trim(),
          city: form.city.trim(),
          notes: form.notes.trim(),
          schools: selectedSchools,
          user: {
            name: account.name.trim(),
            email: account.email.trim(),
            phone: account.phone.trim(),
            password: account.password,
          },
        }),
      })
      const j = await res.json()
      if (res.ok) {
        toast.success('Corporate créé — compte utilisateur et écoles rattachées')
        setShowForm(false)
        setForm(EMPTY_FORM)
        setAccount(EMPTY_ACCOUNT)
        setSelectedSchools([])
        setSchoolSearch('')
        await load()
      } else toast.error(j.error || 'Création impossible')
    } catch { toast.error('Erreur réseau') } finally { setCreating(false) }
  }

  async function attachSchool(c: CorporateItem) {
    const schoolId = attachPick[c.id]
    if (!schoolId) { toast.error('Choisissez une école à rattacher'); return }
    setBusy(`attach-${c.id}`)
    try {
      const res = await authFetch(`/api/corporates/${c.id}/schools`, { method: 'POST', body: JSON.stringify({ schoolId }) })
      const j = await res.json()
      if (res.ok) { toast.success('École rattachée'); setAttachPick(p => ({ ...p, [c.id]: '' })); await load() }
      else toast.error(j.error || 'Rattachement impossible')
    } catch { toast.error('Erreur réseau') } finally { setBusy(null) }
  }

  async function detachSchool(c: CorporateItem, schoolId: string) {
    setBusy(`detach-${c.id}-${schoolId}`)
    try {
      const res = await authFetch(`/api/corporates/${c.id}/schools?schoolId=${schoolId}`, { method: 'DELETE' })
      const j = await res.json()
      if (res.ok) { toast.success('École détachée'); await load() }
      else toast.error(j.error || 'Détachement impossible')
    } catch { toast.error('Erreur réseau') } finally { setBusy(null) }
  }

  async function toggleStatus(c: CorporateItem) {
    const next = c.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    setBusy(`status-${c.id}`)
    try {
      const res = await authFetch(`/api/corporates/${c.id}`, { method: 'PUT', body: JSON.stringify({ status: next }) })
      const j = await res.json()
      if (res.ok) { toast.success(next === 'ACTIVE' ? 'Corporate réactivé' : 'Corporate suspendu'); await load() }
      else toast.error(j.error || 'Mise à jour impossible')
    } catch { toast.error('Erreur réseau') } finally { setBusy(null) }
  }

  async function deleteCorporate(c: CorporateItem) {
    if (confirmDeleteId !== c.id) { setConfirmDeleteId(c.id); return }
    setConfirmDeleteId(null)
    setBusy(`del-${c.id}`)
    try {
      const res = await authFetch(`/api/corporates/${c.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (res.ok) { toast.success('Corporate supprimé'); if (expandedId === c.id) setExpandedId(null); await load() }
      else toast.error(j.error || 'Suppression impossible')
    } catch { toast.error('Erreur réseau') } finally { setBusy(null) }
  }

  const formInputCls = 'w-full px-4 py-2.5 rounded-xl text-sm outline-none border focus:border-[oklch(72%_0.15_65)] transition'
  const formInputStyle = { borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY } as const

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Entreprises</h1>
          <p className="text-sm mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>Clients corporate multi-écoles — une entreprise, plusieurs écoles, totaux agrégés</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition" style={{ background: GOLD, color: '#0a0f0d' }}>
          <Plus size={15} className="inline mr-1 -mt-0.5" />{showForm ? 'Fermer' : 'Nouveau corporate'}
        </button>
      </div>

      {/* Formulaire de création */}
      {showForm && (
        <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: 'oklch(90% 0.01 175)', background: 'white' }}>
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
            <Building2 size={15} className="text-[oklch(72%_0.15_65)]" />Nouveau corporate
          </h3>

          {/* Entreprise */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>Nom *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex. Groupe Scolaire La Lumière" className={formInputCls} style={formInputStyle} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>Ville</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Ex. Kinshasa" className={formInputCls} style={formInputStyle} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>Nom du contact</label>
              <input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Ex. Jean Mukendi" className={formInputCls} style={formInputStyle} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>Email contact</label>
              <input type="email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="contact@entreprise.cd" className={formInputCls} style={formInputStyle} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>Téléphone contact</label>
              <input value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="+243…" className={formInputCls} style={formInputStyle} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes internes…" className={formInputCls} style={formInputStyle} />
            </div>
          </div>

          {/* Multi-select d'écoles (checkboxes + recherche locale) */}
          <div className="rounded-xl border p-3.5" style={{ borderColor: 'oklch(90% 0.01 175)' }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: TEXT_PRIMARY }}>
                <Link2 size={13} className="text-[oklch(72%_0.15_65)]" />Écoles à rattacher ({selectedSchools.length} sélectionnée{selectedSchools.length > 1 ? 's' : ''})
              </p>
              {selectedSchools.length > 0 && (
                <button onClick={() => setSelectedSchools([])} className="text-[11px] font-semibold underline underline-offset-2" style={{ color: TEXT_MUTED_LUXE }}>Tout désélectionner</button>
              )}
            </div>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED_LUXE }} />
              <input value={schoolSearch} onChange={e => setSchoolSearch(e.target.value)} placeholder="Filtrer les écoles…" className="w-full pl-9 pr-3 py-2 rounded-lg text-xs outline-none border focus:border-[oklch(72%_0.15_65)] transition" style={formInputStyle} />
            </div>
            <div className="max-h-44 overflow-y-auto space-y-1 custom-scrollbar">
              {schools.filter(s => {
                const q = schoolSearch.trim().toLowerCase()
                return !q || s.name.toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q)
              }).map(s => (
                <label key={s.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-[oklch(97%_0.005_175)] transition">
                  <input type="checkbox" checked={selectedSchools.includes(s.id)} onChange={() => toggleSchool(s.id)} className="w-4 h-4 rounded accent-[oklch(72%_0.15_65)] shrink-0" />
                  <span className="text-xs font-semibold truncate" style={{ color: TEXT_PRIMARY }}>{s.name}</span>
                  <span className="text-[11px] truncate ml-auto flex items-center gap-1" style={{ color: TEXT_MUTED_LUXE }}>
                    {s.city ? <><MapPin size={10} />{s.city}</> : (s.shortName || '')}
                  </span>
                </label>
              ))}
              {schools.length === 0 && <p className="text-xs py-2" style={{ color: TEXT_MUTED_LUXE }}>Aucune école disponible — créez d’abord des écoles.</p>}
            </div>
          </div>

          {/* Compte utilisateur */}
          <div className="rounded-xl border p-3.5 space-y-3" style={{ borderColor: 'oklch(90% 0.01 175)' }}>
            <p className="text-xs font-bold" style={{ color: TEXT_PRIMARY }}>Compte utilisateur principal</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>Nom *</label>
                <input value={account.name} onChange={e => setAccount(a => ({ ...a, name: e.target.value }))} placeholder="Nom du titulaire" className={formInputCls} style={formInputStyle} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>Email *</label>
                <input type="email" value={account.email} onChange={e => setAccount(a => ({ ...a, email: e.target.value }))} placeholder="login@entreprise.cd" className={formInputCls} style={formInputStyle} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>Téléphone *</label>
                <input value={account.phone} onChange={e => setAccount(a => ({ ...a, phone: e.target.value }))} placeholder="+243…" className={formInputCls} style={formInputStyle} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>Mot de passe *</label>
                <div className="flex gap-2">
                  <input value={account.password} onChange={e => setAccount(a => ({ ...a, password: e.target.value }))} placeholder="12 caractères" className={`${formInputCls} font-mono`} style={formInputStyle} />
                  <button
                    type="button" onClick={() => setAccount(a => ({ ...a, password: generatePassword() }))}
                    className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition hover:opacity-80 shrink-0"
                    style={{ background: 'oklch(95% 0.05 65)', color: 'oklch(55% 0.14 65)' }}
                    title="Générer un mot de passe de 12 caractères"
                  >
                    <KeyRound size={13} className="inline mr-1 -mt-0.5" />Générer
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'oklch(95% 0.01 175)', color: TEXT_MUTED_LUXE }}>Annuler</button>
            <button onClick={createCorporate} disabled={creating} className="px-5 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50" style={{ background: GOLD, color: '#0a0f0d' }}>
              {creating ? 'Création…' : 'Créer le corporate'}
            </button>
          </div>
        </div>
      )}

      {/* Recherche */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED_LUXE }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom ou ville…" className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border focus:border-[oklch(72%_0.15_65)] transition" style={formInputStyle} />
        </div>
        <button onClick={load} className="px-3 py-2.5 rounded-xl grid place-items-center transition hover:opacity-80" style={{ background: 'oklch(95% 0.01 175)' }} aria-label="Rafraîchir">
          <RefreshCw size={15} style={{ color: TEXT_MUTED_LUXE }} />
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'oklch(95% 0.01 175)' }} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border p-10 text-center" style={{ borderColor: 'oklch(90% 0.01 175)' }}>
          <Building2 size={32} className="mx-auto mb-3" style={{ color: GOLD }} />
          <p className="font-semibold" style={{ color: TEXT_PRIMARY }}>Aucun corporate — créez votre premier client multi-écoles</p>
          <p className="text-sm mt-1" style={{ color: TEXT_MUTED_LUXE }}>Le bouton « Nouveau corporate » crée l’entreprise, son compte utilisateur et rattache ses écoles.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const expanded = expandedId === c.id
            const st = statusPill(c.status)
            const attached = Array.isArray(c.schools) ? c.schools : []
            const users = Array.isArray(c.users) ? c.users : []
            const attachedIds = new Set(attached.map(s => s.id))
            const available = schools.filter(s => !attachedIds.has(s.id))
            return (
              <div key={c.id} className="rounded-2xl border overflow-hidden" style={{ borderColor: 'oklch(92% 0.01 175)', background: 'white' }}>
                {/* Ligne principale */}
                <button
                  onClick={() => setExpandedId(expanded ? null : c.id)}
                  className="w-full text-left p-5 flex flex-wrap sm:flex-nowrap items-center gap-3 hover:bg-[oklch(98%_0.005_175)] transition"
                  aria-expanded={expanded}
                >
                  <span className="shrink-0 grid place-items-center w-10 h-10 rounded-xl" style={{ background: 'oklch(95% 0.05 65)' }}>
                    <Building2 size={17} style={{ color: GOLD }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate" style={{ color: TEXT_PRIMARY }}>{c.name}</p>
                    <p className="text-xs truncate" style={{ color: TEXT_MUTED_LUXE }}>
                      {c.city || '—'}{c.contactName ? ` · ${c.contactName}` : ''}{c.contactEmail ? ` · ${c.contactEmail}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: st.background, color: st.color }}>{st.label}</span>
                    <MiniPill>{schoolCount(c)} école{schoolCount(c) > 1 ? 's' : ''}</MiniPill>
                    <MiniPill><Users size={10} />{userCount(c)} compte{userCount(c) > 1 ? 's' : ''}</MiniPill>
                    {(c.openTickets ?? 0) > 0 && <MiniPill tone="gold"><TicketIcon size={10} />{c.openTickets} ticket{(c.openTickets ?? 0) > 1 ? 's' : ''}</MiniPill>}
                    <ChevronDown size={16} className={`transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} style={{ color: TEXT_MUTED_LUXE }} />
                  </div>
                </button>

                {/* Détail inline */}
                {expanded && (
                  <div className="px-5 pb-5 pt-4 border-t space-y-5" style={{ borderColor: 'oklch(93% 0.01 175)' }}>
                    {/* Écoles rattachées */}
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: TEXT_MUTED_LUXE }}>Écoles rattachées ({attached.length})</p>
                      {attached.length === 0 ? (
                        <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Aucune école rattachée pour le moment.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {attached.map(s => (
                            <div key={s.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: 'oklch(97% 0.005 175)' }}>
                              <span className="grid place-items-center w-7 h-7 rounded-lg shrink-0 text-[10px] font-extrabold" style={{ background: 'oklch(95% 0.05 65)', color: 'oklch(55% 0.14 65)' }}>
                                {(s.shortName || s.name).slice(0, 2).toUpperCase()}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold truncate" style={{ color: TEXT_PRIMARY }}>{s.name}</p>
                                {s.city && <p className="text-[11px] truncate" style={{ color: TEXT_MUTED_LUXE }}>{s.city}</p>}
                              </div>
                              <button
                                onClick={() => detachSchool(c, s.id)} disabled={busy === `detach-${c.id}-${s.id}`}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition disabled:opacity-40 hover:opacity-80 shrink-0"
                                style={{ background: 'oklch(95% 0.02 25)', color: DANGER }}
                              >
                                <Unlink size={11} className="inline mr-1 -mt-0.5" />{busy === `detach-${c.id}-${s.id}` ? '…' : 'Détacher'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Rattacher une école */}
                      {available.length > 0 && (
                        <div className="flex flex-col sm:flex-row gap-2 mt-2.5">
                          <AppSelect
                            value={attachPick[c.id] || ''}
                            onChange={v => setAttachPick(p => ({ ...p, [c.id]: v }))}
                            options={[{ value: '', label: 'Rattacher une école…' }, ...available.map(s => ({ value: s.id, label: s.name }))]}
                            className="w-full sm:flex-1"
                            triggerClassName="text-xs"
                          />
                          <button
                            onClick={() => attachSchool(c)} disabled={!attachPick[c.id] || busy === `attach-${c.id}`}
                            className="px-4 py-2 rounded-xl text-xs font-bold transition disabled:opacity-40 whitespace-nowrap"
                            style={{ background: GOLD, color: '#0a0f0d' }}
                          >
                            <Link2 size={12} className="inline mr-1 -mt-0.5" />Rattacher
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Comptes utilisateurs */}
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: TEXT_MUTED_LUXE }}>Comptes utilisateurs ({users.length})</p>
                      {users.length === 0 ? (
                        <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Aucun compte utilisateur sur ce corporate.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {users.map(u => (
                            <div key={u.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: 'oklch(97% 0.005 175)' }}>
                              <span className="grid place-items-center w-7 h-7 rounded-lg shrink-0" style={{ background: 'oklch(93% 0.01 175)' }}>
                                <Users size={13} style={{ color: TEXT_MUTED_LUXE }} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold truncate" style={{ color: TEXT_PRIMARY }}>{u.name}</p>
                                <p className="text-[11px] truncate" style={{ color: TEXT_MUTED_LUXE }}>{u.email}</p>
                              </div>
                              {u.role && <MiniPill>{u.role}</MiniPill>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => toggleStatus(c)} disabled={busy === `status-${c.id}`}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold transition disabled:opacity-40 hover:opacity-80"
                        style={c.status === 'ACTIVE' ? { background: 'oklch(95% 0.05 65)', color: 'oklch(55% 0.14 65)' } : { background: 'oklch(95% 0.04 145)', color: SUCCESS }}
                      >
                        {c.status === 'ACTIVE' ? <ShieldOff size={12} className="inline mr-1 -mt-0.5" /> : <ShieldCheck size={12} className="inline mr-1 -mt-0.5" />}
                        {c.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
                      </button>
                      <button
                        onClick={() => deleteCorporate(c)} disabled={busy === `del-${c.id}`}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold transition disabled:opacity-40 hover:opacity-80"
                        style={confirmDeleteId === c.id ? { background: DANGER, color: 'white' } : { background: 'oklch(95% 0.02 25)', color: DANGER }}
                      >
                        <Trash2 size={12} className="inline mr-1 -mt-0.5" />
                        {confirmDeleteId === c.id ? 'Confirmer ?' : 'Supprimer'}
                      </button>
                      {c.notes && <p className="text-[11px] w-full" style={{ color: TEXT_MUTED_LUXE }}>Notes : {c.notes}</p>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
