'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Mail,
  MessageSquareLock,
  DatabaseZap,
  Save,
  Send,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  CircleCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import AppSelect from '@/components/ui/AppSelect'
import { authFetch } from '@/lib/store'
import { onDbChange } from '@/lib/realtime'
import { GOLD, ACCENT, SUCCESS, DANGER, TEXT_PRIMARY, TEXT_MUTED_LUXE, BORDER } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Section « Communication & notifications » + « Base de données »
// Réservée au super administrateur plateforme (Contrôle de la plateforme).
//  - Resend   : clé API email + adresse expéditeur de l'app + envoi de test
//  - SMS      : fournisseur de vérification par SMS (offre d'essai gratuite)
//  - Base     : état réel de la connexion + vraies statistiques + synchro auto
// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-xl border border-[oklch(90%_0.01_175)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[oklch(55%_0.15_175/0.25)] transition'
const labelClass = 'text-[11px] font-bold uppercase tracking-wide mb-1.5 block'

// ── SMS : fournisseurs avec offres d'essai gratuites ───────────────────────

type SmsProviderKey = 'africastalking' | 'twilio' | 'vonage' | 'custom'

const SMS_PROVIDERS: { value: SmsProviderKey; label: string }[] = [
  { value: 'africastalking', label: "Africa's Talking — sandbox gratuit (recommandé RDC)" },
  { value: 'twilio', label: 'Twilio — essai gratuit (crédits offerts)' },
  { value: 'vonage', label: 'Vonage — essai gratuit' },
  { value: 'custom', label: 'Webhook personnalisé (toute API SMS)' },
]

const PROVIDER_FIELDS: Record<SmsProviderKey, { key: string; label: string; secret?: boolean; placeholder: string }[]> = {
  africastalking: [
    { key: 'username', label: "Nom d'utilisateur (« sandbox » pour l'essai)", placeholder: 'sandbox' },
    { key: 'apiKey', label: 'Clé API', secret: true, placeholder: 'atsk_xxxxxxxx…' },
    { key: 'senderId', label: 'Sender ID (optionnel)', placeholder: 'EDUGEST' },
  ],
  twilio: [
    { key: 'accountSid', label: 'Account SID', placeholder: 'ACxxxxxxxx…' },
    { key: 'authToken', label: 'Auth Token', secret: true, placeholder: '••••••••' },
    { key: 'fromPhone', label: 'Numéro Twilio expéditeur', placeholder: '+1415XXXXXXX' },
  ],
  vonage: [
    { key: 'apiKey', label: 'API key', secret: true, placeholder: 'abcd1234' },
    { key: 'apiSecret', label: 'API secret', secret: true, placeholder: '••••••••' },
    { key: 'from', label: 'Expéditeur (nom ou numéro)', placeholder: 'EduGest' },
  ],
  custom: [
    { key: 'webhookUrl', label: 'URL du webhook', placeholder: 'https://api.exemple.com/sms' },
    { key: 'webhookToken', label: 'Token Bearer (optionnel)', secret: true, placeholder: '••••••••' },
  ],
}

type SmsFields = Record<SmsProviderKey, Record<string, string>>

function emptySmsFields(): SmsFields {
  return {
    africastalking: { username: '', apiKey: '', senderId: '' },
    twilio: { accountSid: '', authToken: '', fromPhone: '' },
    vonage: { apiKey: '', apiSecret: '', from: '' },
    custom: { webhookUrl: '', webhookToken: '' },
  }
}

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (Number.isNaN(diff)) return '—'
  if (diff < 5) return "à l'instant"
  if (diff < 60) return `il y a ${diff} s`
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
  return `il y a ${Math.floor(diff / 86400)} j`
}

// ---------------------------------------------------------------------------
// Carte Resend (email)
// ---------------------------------------------------------------------------

function EmailConfigCard() {
  const [cfg, setCfg] = useState<{ configured: boolean; enabled: boolean } | null>(null)
  const [form, setForm] = useState({ enabled: false, fromEmail: '', fromName: '', apiKey: '' })
  const [testEmail, setTestEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    authFetch('/api/email-config')
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setCfg({ configured: !!j.data.configured, enabled: !!j.data.enabled })
          setForm({ enabled: !!j.data.enabled, fromEmail: j.data.fromEmail || '', fromName: j.data.fromName || '', apiKey: '' })
        }
      })
      .catch(() => {})
  }, [])

  // Renvoie true si l'enregistrement a réussi (utilisé par « Envoyer » qui
  // sauvegarde automatiquement avant de tester — l'utilisateur ne doit pas
  // avoir à cliquer sur « Enregistrer » puis « Envoyer » séparément).
  async function save(): Promise<boolean> {
    setSaving(true)
    try {
      const res = await authFetch('/api/email-config', {
        method: 'POST',
        body: JSON.stringify({ action: 'save', ...form }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(json.message || 'Configuration Resend enregistrée')
        setCfg({ configured: !!json.data?.configured, enabled: !!json.data?.enabled })
        setForm((f) => ({ ...f, apiKey: '' }))
        return true
      }
      toast.error(json.error || 'Erreur de sauvegarde', { duration: 8000 })
      return false
    } catch {
      toast.error('Erreur réseau — vérifiez que le serveur est démarré', { duration: 8000 })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function sendTest() {
    if (!testEmail.trim()) {
      toast.error('Entrez une adresse email de test')
      return
    }
    setTesting(true)
    try {
      // Sauvegarde automatique : si aucune clé n'est encore enregistrée ou si
      // le formulaire contient des modifications non enregistrées, on les
      // enregistre d'abord (sinon le test part avec l'ancienne config).
      const needsSave = !cfg?.configured || !!form.apiKey.trim() || (!!cfg && form.enabled !== cfg.enabled)
      if (needsSave) {
        const ok = await save()
        if (!ok) return
      }
      const res = await authFetch('/api/email-config', {
        method: 'POST',
        body: JSON.stringify({ action: 'test', testEmail }),
      })
      const json = await res.json()
      if (res.ok) toast.success(json.message || 'Email de test envoyé')
      else toast.error(json.error || 'Échec du test', { duration: 10000 })
    } catch {
      toast.error('Erreur réseau', { duration: 8000 })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'oklch(95% 0.04 175)', color: ACCENT }}
        >
          <Mail className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-extrabold tracking-tight" style={{ color: TEXT_PRIMARY }}>
              Emails — Resend
            </h3>
            {cfg?.configured ? (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={cfg.enabled ? { background: 'oklch(94% 0.05 145)', color: 'oklch(40% 0.13 145)' } : { background: 'oklch(94% 0.005 250)', color: 'oklch(52% 0.015 250)' }}
              >
                {cfg.enabled ? 'Resend actif' : 'Configuré (inactif)'}
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'oklch(94% 0.06 65)', color: 'oklch(45% 0.13 65)' }}>
                Non configuré
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>
            Clé API Resend + email de l&apos;application. Codes de vérification, notifications et communications partent via Resend.
            Créez votre clé sur <span className="font-semibold">resend.com</span> (gratuit) puis validez votre domaine expéditeur.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label
          className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
          style={{ background: 'oklch(97% 0.02 175)', border: '1px solid oklch(90% 0.01 175)' }}
        >
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            className="w-4 h-4 rounded accent-[oklch(72%_0.15_65)]"
          />
          <span className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>
            Activer l&apos;envoi d&apos;emails via Resend
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
              Clé API Resend {cfg?.configured && <span className="font-normal normal-case">— laisser vide pour conserver</span>}
            </label>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="re_123456789…"
              autoComplete="new-password"
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
              Email de l&apos;application (expéditeur)
            </label>
            <input
              type="email"
              value={form.fromEmail}
              onChange={(e) => setForm((f) => ({ ...f, fromEmail: e.target.value }))}
              placeholder="noreply@votre-ecole.cd"
              autoComplete="off"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
              Nom de l&apos;expéditeur
            </label>
            <input
              type="text"
              value={form.fromName}
              onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))}
              placeholder="EduGest"
              autoComplete="off"
              className={inputClass}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60 w-full"
              style={{ background: 'oklch(15% 0.02 250)' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>

        <div className="pt-3 border-t" style={{ borderColor: BORDER }}>
          <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
            Tester l&apos;envoi d&apos;email
          </label>
          <div className="flex gap-2 max-w-md">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="vous@exemple.com"
              autoComplete="off"
              className={inputClass}
            />
            <button
              type="button"
              onClick={sendTest}
              disabled={testing || saving}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60 shrink-0"
              style={{ background: 'oklch(55% 0.15 175)' }}
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Envoyer
            </button>
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>
            « Envoyer » enregistre d&apos;abord vos modifications puis teste l&apos;envoi réel via Resend.
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Carte SMS (vérification par SMS — fournisseur gratuit)
// ---------------------------------------------------------------------------

function SmsConfigCard() {
  const [loaded, setLoaded] = useState(false)
  const [cfg, setCfg] = useState<{ configured: boolean; enabled: boolean; provider: SmsProviderKey } | null>(null)
  const [form, setForm] = useState<{ enabled: boolean; provider: SmsProviderKey; fields: SmsFields }>({
    enabled: false,
    provider: 'africastalking',
    fields: emptySmsFields(),
  })
  const [testPhone, setTestPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    authFetch('/api/sms-config')
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setCfg({ configured: !!j.data.configured, enabled: !!j.data.enabled, provider: j.data.provider })
          setForm((prev) => {
            const fields = emptySmsFields()
            for (const p of Object.keys(fields) as SmsProviderKey[]) {
              for (const f of PROVIDER_FIELDS[p]) {
                // Les secrets restent vides (valeur conservée côté serveur)
                fields[p][f.key] = f.secret ? '' : (j.data.fields?.[p]?.[f.key] || '')
              }
            }
            // Anti-erreur : en sandbox Africa's Talking, l'username DOIT être
            // « sandbox » — on pré-remplit pour éviter le refus d'authentification.
            if (!fields.africastalking.username.trim()) fields.africastalking.username = 'sandbox'
            return { enabled: !!j.data.enabled, provider: j.data.provider || prev.provider, fields }
          })
          setLoaded(true)
        }
      })
      .catch(() => setLoaded(true))
  }, [])

  // Renvoie true si l'enregistrement a réussi (« Envoyer » sauvegarde
  // automatiquement avant de tester — un seul clic pour l'utilisateur).
  async function save(): Promise<boolean> {
    setSaving(true)
    try {
      const res = await authFetch('/api/sms-config', {
        method: 'POST',
        body: JSON.stringify({ action: 'save', enabled: form.enabled, provider: form.provider, fields: form.fields }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(json.message || 'Configuration SMS enregistrée')
        setCfg({ configured: !!json.data?.configured, enabled: !!json.data?.enabled, provider: json.data?.provider })
        return true
      }
      toast.error(json.error || 'Erreur de sauvegarde', { duration: 8000 })
      return false
    } catch {
      toast.error('Erreur réseau — vérifiez que le serveur est démarré', { duration: 8000 })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function sendTest() {
    if (!testPhone.trim()) {
      toast.error('Entrez un numéro de téléphone de test')
      return
    }
    setTesting(true)
    try {
      // Sauvegarde automatique : si aucun fournisseur n'est encore enregistré
      // ou si le formulaire contient des modifications (case activée, champs
      // saisis…), on enregistre d'abord — sinon le test part sans la config.
      const currentFields = form.fields[form.provider] || {}
      const hasTypedValues = Object.values(currentFields).some((v) => (v || '').trim() !== '')
      const needsSave = !cfg?.configured || (!!cfg && form.enabled !== cfg.enabled) || (!!cfg && form.provider !== cfg.provider) || hasTypedValues
      if (needsSave) {
        const ok = await save()
        if (!ok) return
      }
      const res = await authFetch('/api/sms-config', {
        method: 'POST',
        body: JSON.stringify({ action: 'test', testPhone }),
      })
      const json = await res.json()
      if (res.ok) toast.success(json.message || 'SMS de test envoyé')
      else toast.error(json.error || 'Échec du test', { duration: 10000 })
    } catch {
      toast.error('Erreur réseau', { duration: 8000 })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'oklch(95% 0.04 175)', color: ACCENT }}
        >
          <MessageSquareLock className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-extrabold tracking-tight" style={{ color: TEXT_PRIMARY }}>
              Vérification par SMS
            </h3>
            {cfg?.configured ? (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={cfg.enabled ? { background: 'oklch(94% 0.05 145)', color: 'oklch(40% 0.13 145)' } : { background: 'oklch(94% 0.005 250)', color: 'oklch(52% 0.015 250)' }}
              >
                {cfg.enabled ? 'SMS actif' : 'Configuré (inactif)'}
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'oklch(94% 0.06 65)', color: 'oklch(45% 0.13 65)' }}>
                Non configuré
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>
            Codes de vérification et notifications par SMS. Choisissez un fournisseur avec offre d&apos;essai
            gratuite (recommandé : <span className="font-semibold">Africa&apos;s Talking</span>, sandbox gratuit).
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label
          className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
          style={{ background: 'oklch(97% 0.02 175)', border: '1px solid oklch(90% 0.01 175)' }}
        >
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            className="w-4 h-4 rounded accent-[oklch(72%_0.15_65)]"
          />
          <span className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>
            Activer la vérification par SMS
          </span>
        </label>

        <div>
          <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
            Fournisseur SMS
          </label>
          <AppSelect
            value={form.provider}
            onChange={(val) =>
              setForm((f) => ({
                ...f,
                provider: val as SmsProviderKey,
                // Passage à Africa's Talking : pré-remplit « sandbox » si vide
                fields:
                  val === 'africastalking' && !f.fields.africastalking.username.trim()
                    ? { ...f.fields, africastalking: { ...f.fields.africastalking, username: 'sandbox' } }
                    : f.fields,
              }))
            }
            options={SMS_PROVIDERS}
            disabled={!loaded}
          />
          {form.provider === 'africastalking' && (
            <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>
              Sandbox Africa&apos;s Talking : le nom d&apos;utilisateur doit être exactement{' '}
              <span className="font-mono font-bold">sandbox</span> (déjà rempli ci-dessous), le SENDER ID
              peut rester vide, et votre numéro de test doit être ajouté au simulateur
              (africastalking.com → Sandbox → SMS Simulator) pour recevoir les SMS.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PROVIDER_FIELDS[form.provider].map((f) => (
            <div key={f.key}>
              <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
                {f.label} {f.secret && cfg?.configured && <span className="font-normal normal-case">— laisser vide pour conserver</span>}
              </label>
              <input
                type={f.secret ? 'password' : 'text'}
                value={form.fields[form.provider][f.key] || ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    fields: { ...prev.fields, [prev.provider]: { ...prev.fields[prev.provider], [f.key]: e.target.value } },
                  }))
                }
                placeholder={f.placeholder}
                autoComplete={f.secret ? 'new-password' : 'off'}
                className={`${inputClass} ${f.secret ? 'font-mono' : ''}`}
              />
              {form.provider === 'africastalking' && f.key === 'username' &&
                (form.fields.africastalking.username || '').trim().toLowerCase() !== 'sandbox' && (
                  <p className="mt-1 text-[11px] font-semibold" style={{ color: 'oklch(55% 0.16 55)' }}>
                    ⚠️ En sandbox, le nom d&apos;utilisateur doit être exactement «&nbsp;sandbox&nbsp;»
                    — sinon l&apos;authentification échouera même avec une clé valide.
                  </p>
              )}
            </div>
          ))}
          <div className="flex items-end">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60 w-full"
              style={{ background: 'oklch(15% 0.02 250)' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>

        <div className="pt-3 border-t" style={{ borderColor: BORDER }}>
          <label className={labelClass} style={{ color: TEXT_MUTED_LUXE }}>
            Tester l&apos;envoi de SMS
          </label>
          <div className="flex gap-2 max-w-md">
            <input
              type="tel"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+243812345678"
              autoComplete="off"
              className={inputClass}
            />
            <button
              type="button"
              onClick={sendTest}
              disabled={testing || saving}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60 shrink-0"
              style={{ background: 'oklch(55% 0.15 175)' }}
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Envoyer
            </button>
          </div>
          <p className="mt-1.5 text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>
            « Envoyer » enregistre d&apos;abord vos modifications puis teste l&apos;envoi réel du SMS.
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Carte Base de données — connexion réelle + vraies stats + synchro auto
// ---------------------------------------------------------------------------

interface PulseData {
  db: string
  signature: string
  lastWriteAt: string | null
  counts: {
    schools: number
    users: number
    students: number
    payments: number
    communications: number
    notifications: number
  }
}

const COUNT_LABELS: { key: keyof PulseData['counts']; label: string }[] = [
  { key: 'schools', label: 'Écoles' },
  { key: 'users', label: 'Utilisateurs' },
  { key: 'students', label: 'Élèves' },
  { key: 'payments', label: 'Paiements' },
  { key: 'communications', label: 'Communications' },
  { key: 'notifications', label: 'Notifications' },
]

function DatabaseStatusCard() {
  const [pulse, setPulse] = useState<PulseData | null>(null)
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)

  const fetchPulse = useCallback(async () => {
    setChecking(true)
    try {
      const res = await authFetch('/api/sync/pulse')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json?.data?.db === 'connected') {
        setPulse(json.data)
        setError(false)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setChecking(false)
      setCheckedAt(new Date().toISOString())
    }
  }, [])

  useEffect(() => {
    fetchPulse()
    const interval = setInterval(fetchPulse, 5000)
    // Rafraîchit immédiatement dès qu'un changement est détecté
    const unsubscribe = onDbChange(() => fetchPulse())
    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [fetchPulse])

  const connected = !error && pulse?.db === 'connected'

  return (
    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl shadow-sm p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'oklch(95% 0.04 175)', color: ACCENT }}
          >
            <DatabaseZap className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-extrabold tracking-tight" style={{ color: TEXT_PRIMARY }}>
                Base de données — connexion & synchronisation
              </h3>
              {connected ? (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'oklch(94% 0.05 145)', color: 'oklch(40% 0.13 145)' }}>
                  <ShieldCheck className="w-3 h-3" />
                  Connectée
                </span>
              ) : error ? (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'oklch(94% 0.05 25)', color: 'oklch(45% 0.18 25)' }}>
                  <ShieldAlert className="w-3 h-3" />
                  Déconnectée
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'oklch(94% 0.005 250)', color: 'oklch(52% 0.015 250)' }}>
                  Vérification…
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>
              Statistiques réelles lues directement dans la base. Toute écriture (paiement, élève, note…) est
              détectée automatiquement et l&apos;application se met à jour sans rechargement.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchPulse}
          disabled={checking}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[oklch(90%_0.01_175)] bg-white px-3 py-2 text-xs font-bold transition hover:bg-[oklch(97%_0.005_175)] disabled:opacity-60"
          style={{ color: TEXT_PRIMARY }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          Vérifier
        </button>
      </div>

      {pulse && (
        <>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {COUNT_LABELS.map(({ key, label }) => (
              <div key={key} className="rounded-xl border border-[oklch(92%_0.01_175)] bg-[oklch(98%_0.004_250)] px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: TEXT_MUTED_LUXE }}>
                  {label}
                </p>
                <p className="text-lg font-extrabold leading-tight" style={{ color: TEXT_PRIMARY }}>
                  {pulse.counts[key]}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>
            <span className="inline-flex items-center gap-1.5">
              <CircleCheck className="w-3.5 h-3.5" style={{ color: SUCCESS }} />
              Données connectées en temps réel
            </span>
            <span>
              Dernière écriture en base : <strong style={{ color: TEXT_PRIMARY }}>{relTime(pulse.lastWriteAt)}</strong>
            </span>
            <span>
              Synchronisation automatique toutes les 5 s · dernière vérification {relTime(checkedAt)}
            </span>
          </div>
        </>
      )}
      {error && (
        <p className="mt-3 text-xs font-medium" style={{ color: DANGER }}>
          Impossible de joindre la base de données. Vérifiez la connexion puis réessayez.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section complète
// ---------------------------------------------------------------------------

export default function PlatformApiConfigSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-1 h-6 rounded-full" style={{ background: GOLD }} />
        <h3 className="text-lg font-extrabold tracking-tight" style={{ color: TEXT_PRIMARY }}>
          Communication & notifications
        </h3>
        <div className="h-px flex-1" style={{ background: BORDER }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EmailConfigCard />
        <SmsConfigCard />
      </div>

      <DatabaseStatusCard />
    </div>
  )
}
