'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { authFetch } from '@/lib/store'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, SUCCESS, DANGER } from '@/lib/constants'
import { formatDate } from '@/lib/helpers'
import AppSelect from '@/components/ui/AppSelect'
import { toast } from 'sonner'
import {
  ScrollText, Lock, Building2, ListChecks, Mail, Ticket as TicketIcon, Bot,
  RefreshCw, Search, CheckCircle2, XCircle, Pencil, Save, Webhook, User as UserIcon,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN PLATEFORME — menu « Journal d'activité » : AuditLog complet
// + configuration de l'agent Hermes (webhook signé HMAC-SHA256, production).
// ═══════════════════════════════════════════════════════════════════════════

interface LogEntry {
  id: string
  action: string
  userName?: string | null
  userRole?: string | null
  details?: string | null
  meta?: unknown
  createdAt: string
}
interface HermesInfo { enabled: boolean; webhookUrl: string }

function actionIcon(action: string) {
  if (action.startsWith('AUTH')) return <Lock size={15} style={{ color: GOLD }} />
  if (action.startsWith('CORP')) return <Building2 size={15} style={{ color: GOLD }} />
  if (action.startsWith('GRANT')) return <ListChecks size={15} style={{ color: GOLD }} />
  if (action.startsWith('EMAIL')) return <Mail size={15} style={{ color: GOLD }} />
  if (action.startsWith('TICKET')) return <TicketIcon size={15} style={{ color: GOLD }} />
  if (action.startsWith('AGENT')) return <Bot size={15} style={{ color: GOLD }} />
  return <ScrollText size={15} style={{ color: GOLD }} />
}

function truncateUrl(url: string, max = 52): string {
  if (url.length <= max) return url
  return url.slice(0, max - 12) + '…' + url.slice(-8)
}

export default function LogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [hermes, setHermes] = useState<HermesInfo | null>(null)
  const [loading, setLoading] = useState(true)

  // Filtres
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')

  // Formulaire Hermes
  const [showHermesForm, setShowHermesForm] = useState(false)
  const [hermesForm, setHermesForm] = useState({ webhookUrl: '', secret: '', enabled: true })
  const [savingHermes, setSavingHermes] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/logs')
      const j = await res.json()
      if (res.ok) {
        setLogs(j.data || [])
        setHermes(j.hermes ?? null)
      } else toast.error(j.error || 'Chargement impossible')
    } catch { toast.error('Erreur réseau') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const actionTypes = useMemo(() => {
    const set = new Set<string>()
    for (const l of logs) if (l.action) set.add(l.action)
    return Array.from(set).sort()
  }, [logs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return logs.filter(l =>
      (!actionFilter || l.action === actionFilter) &&
      (!q ||
        (l.userName || '').toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q))
    )
  }, [logs, actionFilter, search])

  function openHermesForm() {
    setHermesForm({
      webhookUrl: hermes?.webhookUrl || '',
      secret: '',
      enabled: hermes?.enabled ?? true,
    })
    setShowHermesForm(true)
  }

  async function saveHermes() {
    if (!hermesForm.webhookUrl.trim()) { toast.error('Saisissez l’URL du webhook Hermes'); return }
    if (!hermes && !hermesForm.secret.trim()) { toast.error('Définissez un secret HMAC-SHA256 (première configuration)'); return }
    setSavingHermes(true)
    try {
      const res = await authFetch('/api/logs', {
        method: 'PUT',
        body: JSON.stringify({
          webhookUrl: hermesForm.webhookUrl.trim(),
          secret: hermesForm.secret.trim(),
          enabled: hermesForm.enabled,
        }),
      })
      const j = await res.json()
      if (res.ok) { toast.success('Configuration Hermes enregistrée'); setShowHermesForm(false); await load() }
      else toast.error(j.error || 'Enregistrement impossible')
    } catch { toast.error('Erreur réseau') } finally { setSavingHermes(false) }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl text-sm outline-none border focus:border-[oklch(72%_0.15_65)] transition'
  const inputStyle = { borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY } as const

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Journal d’activité</h1>
          <p className="text-sm mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>Traçabilité des actions sensibles + agent Hermes d’audit en production</p>
        </div>
        <button onClick={load} className="px-3 py-2.5 rounded-xl grid place-items-center transition hover:opacity-80 self-start sm:self-auto" style={{ background: 'oklch(95% 0.01 175)' }} aria-label="Rafraîchir le journal">
          <RefreshCw size={15} style={{ color: TEXT_MUTED_LUXE }} />
        </button>
      </div>

      {/* Carte Agent Hermes */}
      <div className="rounded-2xl border p-5" style={{ borderColor: 'oklch(92% 0.01 175)', background: 'white' }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl shrink-0" style={{ background: 'oklch(95% 0.05 65)' }}>
            <Bot size={19} style={{ color: GOLD }} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm" style={{ color: TEXT_PRIMARY }}>Agent Hermes</p>
              {hermes && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1"
                  style={hermes.enabled ? { background: 'oklch(95% 0.04 145)', color: SUCCESS } : { background: 'oklch(94% 0.005 175)', color: TEXT_MUTED_LUXE }}>
                  {hermes.enabled ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                  {hermes.enabled ? 'ACTIF' : 'INACTIF'}
                </span>
              )}
            </div>
            {hermes ? (
              <p className="text-xs mt-0.5 font-mono truncate" style={{ color: TEXT_MUTED_LUXE }} title={hermes.webhookUrl}>
                <Webhook size={11} className="inline mr-1 -mt-0.5" />{truncateUrl(hermes.webhookUrl)}
              </p>
            ) : (
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>
                Non configuré — en développement, les logs restent en local. À la mise en production, branchez l’agent Hermes ici : chaque entrée sera relayée vers son webhook avec une signature HMAC-SHA256.
              </p>
            )}
          </div>
          <button
            onClick={openHermesForm}
            className="px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap"
            style={hermes ? { background: 'oklch(95% 0.05 65)', color: 'oklch(55% 0.14 65)' } : { background: GOLD, color: '#0a0f0d' }}
          >
            {hermes ? <Pencil size={12} className="inline mr-1 -mt-0.5" /> : <Webhook size={12} className="inline mr-1 -mt-0.5" />}
            {hermes ? 'Modifier' : 'Configurer'}
          </button>
        </div>

        {/* Formulaire Hermes */}
        {showHermesForm && (
          <div className="mt-4 pt-4 border-t space-y-3" style={{ borderColor: 'oklch(93% 0.01 175)' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>URL du webhook</label>
                <input value={hermesForm.webhookUrl} onChange={e => setHermesForm(f => ({ ...f, webhookUrl: e.target.value }))} placeholder="https://hermes.exemple.cd/webhooks/audit" className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>Secret HMAC-SHA256</label>
                <input
                  value={hermesForm.secret}
                  onChange={e => setHermesForm(f => ({ ...f, secret: e.target.value }))}
                  placeholder={hermes ? 'laissez vide pour conserver' : 'Secret partagé avec l’agent Hermes'}
                  className={`${inputCls} font-mono`}
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox" checked={hermesForm.enabled}
                  onChange={e => setHermesForm(f => ({ ...f, enabled: e.target.checked }))}
                  className="w-4 h-4 rounded accent-[oklch(72%_0.15_65)]"
                />
                <span className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>Agent activé</span>
              </label>
              <div className="flex gap-2">
                <button onClick={() => setShowHermesForm(false)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'oklch(95% 0.01 175)', color: TEXT_MUTED_LUXE }}>Annuler</button>
                <button onClick={saveHermes} disabled={savingHermes} className="px-5 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50" style={{ background: GOLD, color: '#0a0f0d' }}>
                  <Save size={14} className="inline mr-1.5 -mt-0.5" />{savingHermes ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <AppSelect
          value={actionFilter}
          onChange={setActionFilter}
          options={[{ value: '', label: 'Tous les types d’action' }, ...actionTypes.map(a => ({ value: a, label: a }))]}
          className="w-full sm:w-64"
        />
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED_LUXE }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par utilisateur ou détails…" className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border focus:border-[oklch(72%_0.15_65)] transition" style={inputStyle} />
        </div>
      </div>

      {/* Liste des entrées */}
      {loading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'oklch(95% 0.01 175)' }} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border p-10 text-center" style={{ borderColor: 'oklch(90% 0.01 175)' }}>
          <ScrollText size={32} className="mx-auto mb-3" style={{ color: GOLD }} />
          <p className="font-semibold" style={{ color: TEXT_PRIMARY }}>Aucune entrée dans le journal</p>
          <p className="text-sm mt-1" style={{ color: TEXT_MUTED_LUXE }}>Les actions sensibles (connexions, comptes, emails, forfaits…) apparaîtront ici.</p>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'oklch(92% 0.01 175)', background: 'white' }}>
          <div className="max-h-[60vh] overflow-y-auto divide-y custom-scrollbar" style={{ borderColor: 'oklch(94% 0.005 175)' }}>
            {filtered.map(l => (
              <div key={l.id} className="px-4 py-3.5 flex gap-3 hover:bg-[oklch(98%_0.005_175)] transition">
                <span className="shrink-0 grid place-items-center w-9 h-9 rounded-xl mt-0.5" style={{ background: 'oklch(95% 0.05 65)' }}>
                  {actionIcon(l.action)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono" style={{ background: 'oklch(95% 0.05 65)', color: 'oklch(55% 0.14 65)' }}>{l.action}</span>
                    <span className="text-xs font-bold inline-flex items-center gap-1" style={{ color: TEXT_PRIMARY }}>
                      <UserIcon size={11} style={{ color: TEXT_MUTED_LUXE }} />{l.userName || 'Système'}
                    </span>
                    {l.userRole && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: 'oklch(95% 0.01 175)', color: TEXT_MUTED_LUXE }}>{l.userRole}</span>}
                  </div>
                  {l.details && <p className="text-[13px] mt-1 leading-relaxed" style={{ color: TEXT_PRIMARY }}>{l.details}</p>}
                  <p className="text-[11px] mt-1" style={{ color: TEXT_MUTED_LUXE }}>
                    {formatDate(l.createdAt)} · {new Date(l.createdAt).toLocaleTimeString('fr-FR')}
                  </p>
                  {l.meta != null && (
                    <details className="mt-1.5">
                      <summary className="text-[11px] font-semibold cursor-pointer select-none" style={{ color: TEXT_MUTED_LUXE }}>Détails techniques</summary>
                      <pre className="mt-1.5 text-xs rounded-xl p-3 overflow-x-auto custom-scrollbar" style={{ background: 'oklch(96% 0.008 175)', color: TEXT_PRIMARY }}>
                        {JSON.stringify(l.meta, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
