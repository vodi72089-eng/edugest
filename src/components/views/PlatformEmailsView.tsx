'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '@/lib/store'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, SUCCESS, DANGER, WARNING } from '@/lib/constants'
import { formatDate } from '@/lib/helpers'
import { toast } from 'sonner'
import { Mail, Inbox, Send, Save, RefreshCw, ShieldCheck, AlertTriangle, Inbox as InboxIcon } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN PLATEFORME — menu « Emails plateforme » : nos adresses officielles
// (noreply / support / contact) + boîte d'envoi (tous les envois sortants).
// ═══════════════════════════════════════════════════════════════════════════

interface AddressRow { key: string; address: string; label: string; description: string }
interface ResendInfo { configured: boolean; enabled: boolean; fromEmail?: string | null }
interface OutboxRow {
  id: string; toEmail: string; subject: string; template: string; fromKey: string
  status: string; error?: string | null; sentAt?: string | null; createdAt: string
}

function OutboxPill({ row }: { row: OutboxRow }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    SENT: { bg: 'oklch(95% 0.04 145)', fg: SUCCESS, label: 'SENT' },
    SIMULATED: { bg: 'oklch(95% 0.05 65)', fg: WARNING, label: 'SIMULATED' },
    FAILED: { bg: 'oklch(95% 0.02 25)', fg: DANGER, label: 'FAILED' },
  }
  const c = map[row.status] || { bg: 'oklch(94% 0.005 175)', fg: TEXT_MUTED_LUXE, label: row.status }
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap inline-block"
      style={{ background: c.bg, color: c.fg }}
      title={row.status === 'FAILED' && row.error ? row.error : undefined}
    >
      {c.label}
    </span>
  )
}

export default function PlatformEmailsView() {
  const [tab, setTab] = useState<'addresses' | 'outbox'>('addresses')

  // Adresses
  const [addresses, setAddresses] = useState<AddressRow[]>([])
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [testTo, setTestTo] = useState<Record<string, string>>({})
  const [resend, setResend] = useState<ResendInfo | null>(null)
  const [loadingAddr, setLoadingAddr] = useState(true)
  const [testingKey, setTestingKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Boîte d'envoi
  const [outbox, setOutbox] = useState<OutboxRow[]>([])
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [loadingOutbox, setLoadingOutbox] = useState(false)

  const loadAddresses = useCallback(async () => {
    setLoadingAddr(true)
    try {
      const res = await authFetch('/api/platform-emails?tab=addresses')
      const j = await res.json()
      if (res.ok && j.data) {
        const list: AddressRow[] = j.data.addresses || []
        setAddresses(list)
        setResend(j.data.resend ?? null)
        setEdited(prev => {
          const next = { ...prev }
          for (const a of list) if (!(a.key in next)) next[a.key] = a.address
          return next
        })
      } else toast.error(j.error || 'Chargement impossible')
    } catch { toast.error('Erreur réseau') } finally { setLoadingAddr(false) }
  }, [])

  const loadOutbox = useCallback(async () => {
    setLoadingOutbox(true)
    try {
      const res = await authFetch('/api/platform-emails')
      const j = await res.json()
      if (res.ok && j.data) {
        setOutbox(j.data.outbox || [])
        setCounts(j.data.counts || {})
      } else toast.error(j.error || 'Chargement impossible')
    } catch { toast.error('Erreur réseau') } finally { setLoadingOutbox(false) }
  }, [])

  useEffect(() => { if (tab === 'addresses') loadAddresses(); else loadOutbox() }, [tab, loadAddresses, loadOutbox])

  async function testAddress(key: string) {
    const to = (testTo[key] || '').trim()
    if (!to || !to.includes('@')) { toast.error('Saisissez un email destinataire valide'); return }
    setTestingKey(key)
    try {
      const res = await authFetch('/api/platform-emails', { method: 'POST', body: JSON.stringify({ fromKey: key, to }) })
      const j = await res.json()
      if (res.ok && j.data?.status === 'SENT') toast.success('Envoyé — vérifiez la boîte du destinataire')
      else if (res.ok) toast.warning('SIMULÉ (Resend non configuré) — l’envoi est journalisé dans la boîte d’envoi')
      else toast.error(j.error || 'Test impossible')
    } catch { toast.error('Erreur réseau') } finally { setTestingKey(null) }
  }

  async function saveAddresses() {
    setSaving(true)
    try {
      const payload = addresses.map(a => ({ key: a.key, address: (edited[a.key] ?? a.address).trim() }))
      const res = await authFetch('/api/platform-emails', { method: 'PUT', body: JSON.stringify({ addresses: payload }) })
      const j = await res.json()
      if (res.ok) { toast.success('Adresses enregistrées'); await loadAddresses() }
      else toast.error(j.error || 'Enregistrement impossible')
    } catch { toast.error('Erreur réseau') } finally { setSaving(false) }
  }

  const resendOk = resend?.configured && resend?.enabled

  return (
    <div className="space-y-5">
      {/* En-tête + onglets */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Emails plateforme</h1>
          <p className="text-sm mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>Nos adresses officielles et la boîte d’envoi de tous les emails EduGest</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('addresses')} className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === 'addresses' ? 'shadow-sm' : 'hover:opacity-80'}`}
            style={tab === 'addresses' ? { background: GOLD, color: '#0a0f0d' } : { background: 'oklch(95% 0.01 175)', color: TEXT_MUTED_LUXE }}>
            <Mail size={15} className="inline mr-1.5 -mt-0.5" />Adresses
          </button>
          <button onClick={() => setTab('outbox')} className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === 'outbox' ? 'shadow-sm' : 'hover:opacity-80'}`}
            style={tab === 'outbox' ? { background: GOLD, color: '#0a0f0d' } : { background: 'oklch(95% 0.01 175)', color: TEXT_MUTED_LUXE }}>
            <Inbox size={15} className="inline mr-1.5 -mt-0.5" />Boîte d’envoi
          </button>
        </div>
      </div>

      {tab === 'addresses' ? (
        <>
          {/* Bandeau statut Resend */}
          {resendOk ? (
            <div className="rounded-2xl border px-4 py-3 flex items-center gap-2.5 text-[13px]" style={{ background: 'oklch(97% 0.02 145)', borderColor: 'oklch(90% 0.05 145)', color: SUCCESS }}>
              <ShieldCheck size={16} className="shrink-0" />
              <span>Resend configuré et activé{resend.fromEmail ? ` — envois réels depuis ${resend.fromEmail}` : ' — les envois partent réellement'}.</span>
            </div>
          ) : (
            <div className="rounded-2xl border px-4 py-3 flex items-center gap-2.5 text-[13px]" style={{ background: 'oklch(97% 0.03 65)', borderColor: 'oklch(90% 0.07 65)', color: WARNING }}>
              <AlertTriangle size={16} className="shrink-0" />
              <span>Resend non configuré — les envois sont SIMULÉS (journalisés).</span>
            </div>
          )}

          {/* Cartes adresses */}
          {loadingAddr ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-52 rounded-2xl animate-pulse" style={{ background: 'oklch(95% 0.01 175)' }} />)}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {addresses.map(a => (
                <div key={a.key} className="rounded-2xl border p-5 flex flex-col gap-3" style={{ borderColor: 'oklch(92% 0.01 175)', background: 'white' }}>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="grid place-items-center w-8 h-8 rounded-xl shrink-0" style={{ background: 'oklch(95% 0.05 65)' }}>
                        <Mail size={14} style={{ color: GOLD }} />
                      </span>
                      <p className="font-bold text-sm" style={{ color: TEXT_PRIMARY }}>{a.label}</p>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>{a.description}</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED_LUXE }}>Adresse d’envoi</label>
                    <input
                      value={edited[a.key] ?? a.address}
                      onChange={e => setEdited(p => ({ ...p, [a.key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl text-sm font-mono outline-none border focus:border-[oklch(72%_0.15_65)] transition"
                      style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY }}
                    />
                  </div>
                  <div className="mt-auto">
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED_LUXE }}>Tester vers</label>
                    <div className="flex gap-2">
                      <input
                        type="email" value={testTo[a.key] || ''} onChange={e => setTestTo(p => ({ ...p, [a.key]: e.target.value }))}
                        placeholder="destinataire@exemple.cd"
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none border focus:border-[oklch(72%_0.15_65)] transition"
                        style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY }}
                      />
                      <button
                        onClick={() => testAddress(a.key)} disabled={testingKey === a.key}
                        className="px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-40 whitespace-nowrap shrink-0"
                        style={{ background: 'oklch(95% 0.05 65)', color: 'oklch(55% 0.14 65)' }}
                      >
                        <Send size={12} className="inline mr-1 -mt-0.5" />{testingKey === a.key ? '…' : 'Tester'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Enregistrer (global) */}
          <div className="flex justify-end">
            <button onClick={saveAddresses} disabled={saving || loadingAddr} className="px-5 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50" style={{ background: GOLD, color: '#0a0f0d' }}>
              <Save size={15} className="inline mr-1.5 -mt-0.5" />{saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Compteurs en chips */}
          {counts && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(counts).map(([k, v]) => {
                const c = k === 'SENT'
                  ? { bg: 'oklch(95% 0.04 145)', fg: SUCCESS }
                  : k === 'SIMULATED'
                    ? { bg: 'oklch(95% 0.05 65)', fg: WARNING }
                    : k === 'FAILED'
                      ? { bg: 'oklch(95% 0.02 25)', fg: DANGER }
                      : { bg: 'oklch(95% 0.01 175)', fg: TEXT_MUTED_LUXE }
                return (
                  <span key={k} className="px-3 py-1.5 rounded-full text-[11px] font-bold" style={{ background: c.bg, color: c.fg }}>
                    {k} : {v}
                  </span>
                )
              })}
            </div>
          )}

          {/* Tableau boîte d'envoi */}
          {loadingOutbox ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'oklch(95% 0.01 175)' }} />)}</div>
          ) : outbox.length === 0 ? (
            <div className="rounded-2xl border p-10 text-center" style={{ borderColor: 'oklch(90% 0.01 175)' }}>
              <InboxIcon size={32} className="mx-auto mb-3" style={{ color: GOLD }} />
              <p className="font-semibold" style={{ color: TEXT_PRIMARY }}>Boîte d’envoi vide</p>
              <p className="text-sm mt-1" style={{ color: TEXT_MUTED_LUXE }}>Chaque email envoyé par la plateforme (réel ou simulé) apparaîtra ici.</p>
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'oklch(92% 0.01 175)', background: 'white' }}>
              {/* En-têtes (desktop) */}
              <div className="hidden md:grid md:grid-cols-[130px_minmax(0,1.2fr)_minmax(0,1.6fr)_130px_110px_96px] gap-2 px-4 py-2.5 border-b text-[10px] font-bold uppercase tracking-wider" style={{ borderColor: 'oklch(93% 0.01 175)', color: TEXT_MUTED_LUXE, background: 'oklch(98% 0.005 175)' }}>
                <span>Date</span><span>À</span><span>Sujet</span><span>Template</span><span>From</span><span>Statut</span>
              </div>
              <div className="max-h-[60vh] overflow-y-auto divide-y custom-scrollbar" style={{ borderColor: 'oklch(94% 0.005 175)' }}>
                {outbox.map(r => (
                  <div key={r.id} className="px-4 py-3 grid grid-cols-1 md:grid-cols-[130px_minmax(0,1.2fr)_minmax(0,1.6fr)_130px_110px_96px] gap-1.5 md:gap-2 md:items-center hover:bg-[oklch(98%_0.005_175)] transition">
                    <span className="text-[11px] leading-tight" style={{ color: TEXT_MUTED_LUXE }}>
                      {formatDate(r.createdAt)}
                      <br className="hidden md:block" />
                      <span className="md:ml-1">{new Date(r.createdAt).toLocaleTimeString('fr-FR')}</span>
                    </span>
                    <span className="text-xs font-mono truncate" style={{ color: TEXT_PRIMARY }} title={r.toEmail}>{r.toEmail}</span>
                    <span className="text-xs font-semibold truncate" style={{ color: TEXT_PRIMARY }} title={r.subject}>{r.subject}</span>
                    <span className="text-[11px] font-mono truncate" style={{ color: TEXT_MUTED_LUXE }} title={r.template}>{r.template}</span>
                    <span className="text-[11px] truncate" style={{ color: TEXT_MUTED_LUXE }}>{r.fromKey}</span>
                    <span className="w-fit"><OutboxPill row={r} /></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={loadOutbox} className="px-3 py-2.5 rounded-xl grid place-items-center transition hover:opacity-80" style={{ background: 'oklch(95% 0.01 175)' }} aria-label="Rafraîchir la boîte d’envoi">
              <RefreshCw size={15} style={{ color: TEXT_MUTED_LUXE }} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
