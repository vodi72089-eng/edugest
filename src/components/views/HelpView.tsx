'use client'

import { useState, useRef } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, SUCCESS } from '@/lib/constants'
import { Camera, Paperclip, X, Send, Loader2, LifeBuoy, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import AppSelect from '@/components/ui/AppSelect'

// ─── Aide — signaler un bug ─────────────────────────────────────────────
// Formulaire : sujet + explication + capture d'écran (capture auto via
// html2canvas-pro, ou image jointe). Envoi = ticket TECHNIQUE vers le
// support ; le serveur journalise TICKET_CREATED, relayé à l'agent Hermes
// (webhook signé) quand il est configuré — sinon le ticket reste dans la
// file du support.
export default function HelpView() {
  const { userData } = useEduGestStore()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState('NORMAL')
  const [screenshotUrl, setScreenshotUrl] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentRef, setSentRef] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function uploadFile(file: File): Promise<string | null> {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await authFetch('/api/upload', { method: 'POST', body: formData })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.url) {
        toast.error(j.error || "Envoi de l'image impossible")
        return null
      }
      return j.url as string
    } catch {
      toast.error('Erreur réseau pendant l’envoi de l’image')
      return null
    } finally {
      setUploading(false)
    }
  }

  // Capture d'écran de la page (sans le panneau d'aide lui-même si possible).
  async function handleCapture() {
    setCapturing(true)
    try {
      const { default: html2canvas } = await import('html2canvas-pro')
      const canvas = await html2canvas(document.body, {
        scale: 0.6,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#0a0f0d',
        windowWidth: document.documentElement.scrollWidth,
      })
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(b => resolve(b), 'image/jpeg', 0.82)
      )
      if (!blob) {
        toast.error('Capture impossible — joignez une image manuellement')
        return
      }
      const url = await uploadFile(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      if (url) {
        setScreenshotUrl(url)
        toast.success('Capture d’écran jointe')
      }
    } catch {
      // html2canvas peut échouer sur certains CSS (oklch…) : repli fichier.
      toast.error('Capture automatique impossible — joignez une image manuellement')
    } finally {
      setCapturing(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) {
      toast.error('Joignez une image (PNG, JPEG, WebP…)')
      return
    }
    const url = await uploadFile(f)
    if (url) {
      setScreenshotUrl(url)
      toast.success('Image jointe')
    }
  }

  async function handleSend() {
    if (subject.trim().length < 4) { toast.error('Donnez un sujet (4+ caractères)'); return }
    if (body.trim().length < 5) { toast.error('Expliquez le problème (5+ caractères)'); return }
    setSending(true)
    try {
      const res = await authFetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          category: 'TECHNIQUE',
          priority,
          body: body.trim(),
          screenshotUrl: screenshotUrl || undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j.error || 'Envoi impossible')
        return
      }
      setSentRef(j.data?.ref || '')
      setSubject('')
      setBody('')
      setPriority('NORMAL')
      setScreenshotUrl('')
      toast.success('Signalement envoyé à notre équipe')
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSending(false)
    }
  }

  const busy = capturing || uploading || sending
  const inputCls = 'w-full px-4 py-2.5 rounded-xl text-sm outline-none border focus:border-[oklch(72%_0.15_65)] transition'

  return (
    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm max-w-2xl">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: GOLD + '20' }}>
          <LifeBuoy size={18} style={{ color: GOLD }} />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: TEXT_PRIMARY }}>Signaler un bug</h3>
          <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>
            Expliquez le problème, joignez une capture — transmis à notre équipe
            et à l’agent Hermes{userData?.name ? ` · ${userData.name}` : ''}.
          </p>
        </div>
      </div>

      {sentRef ? (
        <div className="mt-4 p-4 rounded-xl flex items-start gap-3" style={{ background: SUCCESS + '14' }}>
          <CheckCircle2 size={18} className="shrink-0 mt-0.5" style={{ color: SUCCESS }} />
          <div className="text-sm" style={{ color: TEXT_PRIMARY }}>
            <p className="font-semibold">Signalement {sentRef} bien reçu.</p>
            <p className="mt-1" style={{ color: TEXT_MUTED_LUXE }}>
              Notre équipe le traite — suivez-le dans Support client, et l’agent
              Hermes a été notifié automatiquement.
            </p>
            <button onClick={() => setSentRef('')} className="mt-2 text-xs font-semibold underline" style={{ color: ACCENT }}>
              Faire un autre signalement
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Sujet — ex. : le bouton Payer ne répond pas"
            className={inputCls} style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY }} />
          <AppSelect value={priority} onChange={setPriority} options={[
            { value: 'NORMAL', label: 'Priorité normale' },
            { value: 'HIGH', label: 'Priorité haute' },
            { value: 'URGENT', label: 'Urgent (bloquant)' },
          ]} className="w-full sm:w-64" />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
            placeholder="Expliquez le problème en détail : où, quand, que faisiez-vous, message d’erreur affiché…"
            className={`${inputCls} resize-none`} style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY }} />

          <div>
            <p className="text-xs font-medium mb-2" style={{ color: TEXT_MUTED_LUXE }}>Capture d’écran (recommandée)</p>
            {screenshotUrl ? (
              <div className="relative inline-block">
                <img src={screenshotUrl} alt="Capture jointe" className="max-h-48 rounded-xl border border-[oklch(90%_0.01_175)]" />
                <button onClick={() => setScreenshotUrl('')} disabled={busy} aria-label="Retirer la capture"
                  className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white shadow grid place-items-center border border-[oklch(90%_0.01_175)]">
                  <X size={13} style={{ color: TEXT_MUTED_LUXE }} />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button onClick={handleCapture} disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition disabled:opacity-50"
                  style={{ borderColor: GOLD + '60', color: TEXT_PRIMARY }}>
                  {capturing ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} style={{ color: GOLD }} />}
                  Capturer l’écran
                </button>
                <button onClick={() => fileRef.current?.click()} disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition disabled:opacity-50"
                  style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_MUTED_LUXE }}>
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                  Joindre une image
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button onClick={handleSend} disabled={busy}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50"
              style={{ background: GOLD, color: '#0a0f0d' }}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Envoyer le signalement
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
