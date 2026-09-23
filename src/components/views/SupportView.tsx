'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, SUCCESS, WARNING, DANGER } from '@/lib/constants'
import { formatDate } from '@/lib/helpers'
import AppSelect from '@/components/ui/AppSelect'
import { toast } from 'sonner'
import {
  LifeBuoy, Plus, Send, Bot, User, Ticket as TicketIcon, RefreshCw, Search,
  ChevronLeft, MessageSquare, CircleDot, CheckCircle2, XCircle, Clock, Headset,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════════
// SUPPORT CLIENT — tickets (clients ⇄ support EduGest) + Agent IA
// • Tout utilisateur connecté peut ouvrir un ticket et discuter avec l'agent IA
// • SUPPORT_AGENT / SUPER_ADMIN_GLOBAL traitent la file complète (statuts,
//   priorités, réponses) et accomplissent les tâches avec les corporates
// ═══════════════════════════════════════════════════════════════════════════

interface TicketItem {
  id: string; ref: string; subject: string; category: string; priority: string; status: string
  createdBy: { id: string; name: string; role: string }
  assignee: { id: string; name: string } | null
  corporate: { id: string; name: string } | null
  school: { id: string; name: string; shortName: string } | null
  firstMessage: string
  createdAt: string; updatedAt: string
}
interface TicketMessage {
  id: string; body: string; authorRole: string; createdAt: string
  author: { id: string; name: string; role: string }
}
interface TicketDetail extends TicketItem { messages: TicketMessage[] }

const CATEGORIES = [
  { value: 'GENERAL', label: 'Général' },
  { value: 'TECHNIQUE', label: 'Technique' },
  { value: 'FACTURATION', label: 'Facturation' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'DONNEES', label: 'Données' },
]
const PRIORITIES = [
  { value: 'LOW', label: 'Basse' },
  { value: 'NORMAL', label: 'Normale' },
  { value: 'HIGH', label: 'Haute' },
  { value: 'URGENT', label: 'Urgente' },
]
const STATUSES = [
  { value: 'OPEN', label: 'Ouvert' },
  { value: 'IN_PROGRESS', label: 'En cours' },
  { value: 'RESOLVED', label: 'Résolu' },
  { value: 'CLOSED', label: 'Fermé' },
]

function statusLabel(s: string) { return STATUSES.find(x => x.value === s)?.label || s }
function priorityLabel(p: string) { return PRIORITIES.find(x => x.value === p)?.label || p }
function categoryLabel(c: string) { return CATEGORIES.find(x => x.value === c)?.label || c }

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    OPEN: { bg: 'oklch(95% 0.05 65)', fg: 'oklch(55% 0.14 65)' },
    IN_PROGRESS: { bg: 'oklch(95% 0.04 250)', fg: 'oklch(45% 0.1 250)' },
    RESOLVED: { bg: 'oklch(95% 0.04 145)', fg: SUCCESS },
    CLOSED: { bg: 'oklch(94% 0.005 175)', fg: 'oklch(50% 0.01 175)' },
  }
  const c = map[status] || map.OPEN
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap" style={{ background: c.bg, color: c.fg }}>{statusLabel(status)}</span>
}
function PriorityPill({ priority }: { priority: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    LOW: { bg: 'oklch(94% 0.005 175)', fg: 'oklch(50% 0.01 175)' },
    NORMAL: { bg: 'oklch(95% 0.04 250)', fg: 'oklch(45% 0.1 250)' },
    HIGH: { bg: 'oklch(95% 0.05 65)', fg: 'oklch(55% 0.14 65)' },
    URGENT: { bg: 'oklch(95% 0.02 25)', fg: DANGER },
  }
  const c = map[priority] || map.NORMAL
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap" style={{ background: c.bg, color: c.fg }}>{priorityLabel(priority)}</span>
}

// ─── Panneau Agent IA ───────────────────────────────────────────────────────
function AgentChatPanel() {
  interface Msg { role: 'user' | 'assistant'; content: string }
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Bonjour 👋 Je suis l’Agent EduGest. Posez-moi vos questions sur la plateforme : élèves, notes, paiements, passage de classe, espace corporate… Comment puis-je vous aider ?' },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    setMessages(prev => [...prev, { role: 'user', content: text }])
    try {
      const history = messages.slice(-10)
      const res = await authFetch('/api/support/agent', { method: 'POST', body: JSON.stringify({ message: text, history }) })
      const j = await res.json()
      if (res.ok && j.data?.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: j.data.reply }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: j.error || 'Une erreur est survenue — réessayez ou ouvrez un ticket.' }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erreur réseau — vérifiez votre connexion.' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border overflow-hidden flex flex-col" style={{ borderColor: 'oklch(92% 0.01 175)', background: 'white', height: 'calc(100vh - 220px)', minHeight: 420 }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'oklch(93% 0.01 175)' }}>
        <span className="grid place-items-center w-9 h-9 rounded-xl" style={{ background: 'oklch(95% 0.05 65)' }}>
          <Bot size={18} style={{ color: GOLD }} />
        </span>
        <div>
          <p className="text-sm font-bold leading-tight" style={{ color: TEXT_PRIMARY }}>Agent EduGest</p>
          <p className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>Réponses immédiates sur la plateforme · 24/7</p>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ maxHeight: 'calc(100% - 120px)' }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <span className="shrink-0 grid place-items-center w-7 h-7 rounded-lg mt-0.5" style={m.role === 'user' ? { background: 'oklch(93% 0.01 175)' } : { background: 'oklch(95% 0.05 65)' }}>
              {m.role === 'user' ? <User size={14} style={{ color: TEXT_MUTED_LUXE }} /> : <Bot size={14} style={{ color: GOLD }} />}
            </span>
            <div className={`max-w-[85%] sm:max-w-[75%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
              style={m.role === 'user' ? { background: 'oklch(95% 0.05 65)', color: 'oklch(25% 0.05 65)' } : { background: 'oklch(96% 0.008 175)', color: TEXT_PRIMARY }}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex gap-2.5">
            <span className="shrink-0 grid place-items-center w-7 h-7 rounded-lg mt-0.5" style={{ background: 'oklch(95% 0.05 65)' }}><Bot size={14} style={{ color: GOLD }} /></span>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm" style={{ background: 'oklch(96% 0.008 175)' }}>
              <span className="flex gap-1">
                <CircleDot size={10} className="animate-bounce" style={{ color: GOLD }} />
                <CircleDot size={10} className="animate-bounce [animation-delay:120ms]" style={{ color: GOLD }} />
                <CircleDot size={10} className="animate-bounce [animation-delay:240ms]" style={{ color: GOLD }} />
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t flex gap-2" style={{ borderColor: 'oklch(93% 0.01 175)' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Posez votre question à l'agent…"
          className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none border focus:border-[oklch(72%_0.15_65)] transition"
          style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY, background: 'oklch(98% 0.005 175)' }}
        />
        <button
          onClick={send} disabled={sending || !input.trim()}
          className="px-4 rounded-xl grid place-items-center transition disabled:opacity-40"
          style={{ background: GOLD }}
          aria-label="Envoyer au agent"
        >
          <Send size={16} color="#0a0f0d" />
        </button>
      </div>
    </div>
  )
}

// ─── Fil d'un ticket ────────────────────────────────────────────────────────
function TicketThread({ ticketId, canHandle, onBack }: { ticketId: string; canHandle: boolean; onBack: () => void }) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/support/tickets/${ticketId}`)
      const j = await res.json()
      if (res.ok && j.data) setTicket(j.data)
      else toast.error(j.error || 'Ticket introuvable')
    } catch { toast.error('Erreur réseau') } finally { setLoading(false) }
  }, [ticketId])

  useEffect(() => { load() }, [load])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [ticket?.messages.length])

  async function sendReply() {
    const text = reply.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const res = await authFetch(`/api/support/tickets/${ticketId}`, { method: 'POST', body: JSON.stringify({ body: text }) })
      const j = await res.json()
      if (res.ok) { setReply(''); toast.success('Réponse envoyée'); await load() }
      else toast.error(j.error || 'Envoi impossible')
    } catch { toast.error('Erreur réseau') } finally { setSending(false) }
  }

  async function patch(data: Record<string, string>) {
    try {
      const res = await authFetch(`/api/support/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify(data) })
      const j = await res.json()
      if (res.ok) { toast.success('Ticket mis à jour'); await load() }
      else toast.error(j.error || 'Mise à jour impossible')
    } catch { toast.error('Erreur réseau') }
  }

  if (loading && !ticket) return <div className="h-64 rounded-2xl animate-pulse" style={{ background: 'oklch(95% 0.01 175)' }} />
  if (!ticket) return null

  return (
    <div className="rounded-2xl border overflow-hidden flex flex-col" style={{ borderColor: 'oklch(92% 0.01 175)', background: 'white', height: 'calc(100vh - 220px)', minHeight: 420 }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: 'oklch(93% 0.01 175)' }}>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="grid place-items-center w-8 h-8 rounded-lg hover:bg-[oklch(95%_0.01_175)] transition" aria-label="Retour">
            <ChevronLeft size={17} style={{ color: TEXT_MUTED_LUXE }} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-mono font-bold" style={{ color: GOLD }}>{ticket.ref}</p>
            <p className="text-sm font-bold truncate" style={{ color: TEXT_PRIMARY }}>{ticket.subject}</p>
          </div>
          <StatusPill status={ticket.status} />
          <PriorityPill priority={ticket.priority} />
        </div>
        {(ticket.corporate || ticket.school) && (
          <p className="text-[11px] mt-1.5 ml-10" style={{ color: TEXT_MUTED_LUXE }}>
            {ticket.corporate ? `Entreprise : ${ticket.corporate.name}` : ''}
            {ticket.corporate && ticket.school ? ' · ' : ''}
            {ticket.school ? `École : ${ticket.school.name}` : ''}
            {' · '}par {ticket.createdBy.name}
          </p>
        )}
        {canHandle && (
          <div className="flex flex-wrap gap-2 mt-3 ml-10">
            <AppSelect value={ticket.status} onChange={v => patch({ status: v })} options={STATUSES} className="w-36" triggerClassName="text-xs" />
            <AppSelect value={ticket.priority} onChange={v => patch({ priority: v })} options={PRIORITIES} className="w-32" triggerClassName="text-xs" />
          </div>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ maxHeight: 'calc(100% - 140px)' }}>
        {ticket.messages.map(m => {
          const mine = m.author.id === ticket.createdBy.id
          const isSupport = m.authorRole === 'SUPPORT'
          const isAgent = m.authorRole === 'AGENT'
          return (
            <div key={m.id} className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
              <span className="shrink-0 grid place-items-center w-7 h-7 rounded-lg mt-0.5" style={isSupport ? { background: 'oklch(95% 0.04 145)' } : isAgent ? { background: 'oklch(95% 0.05 65)' } : { background: 'oklch(93% 0.01 175)' }}>
                {isAgent ? <Bot size={14} style={{ color: GOLD }} /> : isSupport ? <Headset size={14} style={{ color: SUCCESS }} /> : <User size={14} style={{ color: TEXT_MUTED_LUXE }} />}
              </span>
              <div className={`max-w-[85%] sm:max-w-[75%] ${mine ? 'text-right' : ''}`}>
                <p className="text-[10px] font-semibold mb-1" style={{ color: TEXT_MUTED_LUXE }}>
                  {m.author.name} · {m.authorRole === 'SUPPORT' ? 'Support EduGest' : m.authorRole === 'AGENT' ? 'Agent IA' : 'Client'} · {formatDate(m.createdAt)}
                </p>
                <div className={`inline-block text-left px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${mine ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
                  style={isSupport ? { background: 'oklch(95% 0.04 145)', color: TEXT_PRIMARY } : { background: 'oklch(96% 0.008 175)', color: TEXT_PRIMARY }}>
                  {m.body}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="p-3 border-t flex gap-2" style={{ borderColor: 'oklch(93% 0.01 175)' }}>
        <input
          value={reply} onChange={e => setReply(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
          placeholder={canHandle ? 'Répondre en tant que support…' : 'Écrire au support…'}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none border focus:border-[oklch(72%_0.15_65)] transition"
          style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY, background: 'oklch(98% 0.005 175)' }}
        />
        <button onClick={sendReply} disabled={sending || !reply.trim()} className="px-4 rounded-xl grid place-items-center transition disabled:opacity-40" style={{ background: GOLD }} aria-label="Envoyer la réponse">
          <Send size={16} color="#0a0f0d" />
        </button>
      </div>
    </div>
  )
}

// ─── Vue principale ─────────────────────────────────────────────────────────
export default function SupportView() {
  const { userRole, userData } = useEduGestStore()
  const canHandle = userRole === 'SUPPORT_AGENT' || userRole === 'SUPER_ADMIN_GLOBAL'
  const [tab, setTab] = useState<'tickets' | 'agent'>('tickets')
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [search, setSearch] = useState('')
  const [openTicketId, setOpenTicketId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ subject: '', category: 'GENERAL', priority: 'NORMAL', body: '' })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/support/tickets')
      const j = await res.json()
      if (res.ok) setTickets(j.data || [])
      else toast.error(j.error || 'Chargement impossible')
    } catch { toast.error('Erreur réseau') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => tickets.filter(t =>
    (!statusFilter || t.status === statusFilter) &&
    (!priorityFilter || t.priority === priorityFilter) &&
    (!search.trim() || t.subject.toLowerCase().includes(search.toLowerCase()) || t.ref.toLowerCase().includes(search.toLowerCase()))
  ), [tickets, statusFilter, priorityFilter, search])

  const openCount = tickets.filter(t => t.status === 'OPEN').length

  async function createTicket() {
    if (form.subject.trim().length < 4 || form.body.trim().length < 5) {
      toast.error('Complétez le sujet (4+ caractères) et la description (5+ caractères)')
      return
    }
    setCreating(true)
    try {
      const res = await authFetch('/api/support/tickets', { method: 'POST', body: JSON.stringify(form) })
      const j = await res.json()
      if (res.ok) {
        toast.success(`Ticket ${j.data.ref} créé — accusé de réception envoyé`)
        setShowForm(false)
        setForm({ subject: '', category: 'GENERAL', priority: 'NORMAL', body: '' })
        await load()
      } else toast.error(j.error || 'Création impossible')
    } catch { toast.error('Erreur réseau') } finally { setCreating(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Support client</h1>
          <p className="text-sm mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>
            {canHandle ? `File complète — ${openCount} ticket(s) à traiter` : 'Tickets avec notre équipe + Agent IA disponible 24/7'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('tickets')} className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === 'tickets' ? 'shadow-sm' : 'hover:opacity-80'}`}
            style={tab === 'tickets' ? { background: GOLD, color: '#0a0f0d' } : { background: 'oklch(95% 0.01 175)', color: TEXT_MUTED_LUXE }}>
            <TicketIcon size={15} className="inline mr-1.5 -mt-0.5" />Tickets
          </button>
          <button onClick={() => setTab('agent')} className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === 'agent' ? 'shadow-sm' : 'hover:opacity-80'}`}
            style={tab === 'agent' ? { background: GOLD, color: '#0a0f0d' } : { background: 'oklch(95% 0.01 175)', color: TEXT_MUTED_LUXE }}>
            <Bot size={15} className="inline mr-1.5 -mt-0.5" />Agent IA
          </button>
        </div>
      </div>

      {tab === 'agent' ? <AgentChatPanel /> : openTicketId ? (
        <TicketThread ticketId={openTicketId} canHandle={canHandle} onBack={() => { setOpenTicketId(null); load() }} />
      ) : (
        <>
          {showForm && (
            <div className="rounded-2xl border p-5 space-y-3" style={{ borderColor: 'oklch(90% 0.01 175)', background: 'white' }}>
              <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
                <Plus size={15} className="text-[oklch(72%_0.15_65)]" />Nouveau ticket
              </h3>
              <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Sujet de la demande"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border focus:border-[oklch(72%_0.15_65)] transition"
                style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY }} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <AppSelect value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={CATEGORIES} className="w-full" />
                <AppSelect value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v }))} options={PRIORITIES} className="w-full" />
              </div>
              <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Décrivez votre demande en détail…" rows={4}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border focus:border-[oklch(72%_0.15_65)] transition resize-none"
                style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY }} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'oklch(95% 0.01 175)', color: TEXT_MUTED_LUXE }}>Annuler</button>
                <button onClick={createTicket} disabled={creating} className="px-5 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50" style={{ background: GOLD, color: '#0a0f0d' }}>
                  {creating ? 'Envoi…' : 'Créer le ticket'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED_LUXE }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher (réf. ou sujet)…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border focus:border-[oklch(72%_0.15_65)] transition"
                style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY }} />
            </div>
            {canHandle && (
              <>
                <AppSelect value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: 'Tous les statuts' }, ...STATUSES]} className="w-full sm:w-40" />
                <AppSelect value={priorityFilter} onChange={setPriorityFilter} options={[{ value: '', label: 'Toutes priorités' }, ...PRIORITIES]} className="w-full sm:w-40" />
              </>
            )}
            <button onClick={() => setShowForm(v => !v)} className="px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition" style={{ background: GOLD, color: '#0a0f0d' }}>
              <Plus size={15} className="inline mr-1 -mt-0.5" />{showForm ? 'Fermer' : 'Nouveau ticket'}
            </button>
            <button onClick={load} className="px-3 py-2.5 rounded-xl grid place-items-center transition hover:opacity-80" style={{ background: 'oklch(95% 0.01 175)' }} aria-label="Rafraîchir">
              <RefreshCw size={15} style={{ color: TEXT_MUTED_LUXE }} />
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'oklch(95% 0.01 175)' }} />)}</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border p-10 text-center" style={{ borderColor: 'oklch(90% 0.01 175)' }}>
              <MessageSquare size={32} className="mx-auto mb-3" style={{ color: GOLD }} />
              <p className="font-semibold" style={{ color: TEXT_PRIMARY }}>Aucun ticket</p>
              <p className="text-sm mt-1" style={{ color: TEXT_MUTED_LUXE }}>Ouvrez un ticket pour une demande à notre équipe, ou interrogez l&apos;Agent IA pour une réponse immédiate.</p>
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'oklch(92% 0.01 175)', background: 'white' }}>
              <div className="max-h-[60vh] overflow-y-auto divide-y" style={{ borderColor: 'oklch(94% 0.005 175)' }}>
                {filtered.map(t => (
                  <button key={t.id} onClick={() => setOpenTicketId(t.id)}
                    className="w-full text-left px-4 py-3.5 hover:bg-[oklch(98%_0.005_175)] transition flex items-center gap-3">
                    <span className="shrink-0 grid place-items-center w-9 h-9 rounded-xl" style={{ background: 'oklch(95% 0.05 65)' }}>
                      <TicketIcon size={15} style={{ color: GOLD }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold" style={{ color: GOLD }}>{t.ref}</span>
                        <StatusPill status={t.status} />
                        <PriorityPill priority={t.priority} />
                      </div>
                      <p className="text-sm font-semibold truncate mt-0.5" style={{ color: TEXT_PRIMARY }}>{t.subject}</p>
                      <p className="text-[11px] truncate" style={{ color: TEXT_MUTED_LUXE }}>
                        {categoryLabel(t.category)} · {t.corporate ? t.corporate.name : t.school ? t.school.name : t.createdBy.name} · {formatDate(t.createdAt)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
