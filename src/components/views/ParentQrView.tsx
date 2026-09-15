'use client'

import { useState, useEffect, useCallback } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY } from '@/lib/constants'
import { Plus, X, QrCode, Copy, Download, Ban, Loader2, Clock, CheckCircle2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import AppSelect from '@/components/ui/AppSelect'

interface QrItem {
  id: string
  token: string
  label: string | null
  expiresAt: string
  isActive: boolean
  createdAt: string
  createdBy: string | null
}

const DURATIONS = [
  { value: '1h', label: '1 heure', hours: 1 },
  { value: '24h', label: '24 heures', hours: 24 },
  { value: '7d', label: '7 jours', hours: 24 * 7 },
  { value: '30d', label: '30 jours', hours: 24 * 30 },
  { value: '90d', label: '3 mois', hours: 24 * 90 },
  { value: '1y', label: '1 an', hours: 24 * 365 },
]

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ParentQrView() {
  const { userData } = useEduGestStore()
  const [codes, setCodes] = useState<QrItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [label, setLabel] = useState('')
  const [duration, setDuration] = useState('30d')
  const [creating, setCreating] = useState(false)

  const [previewQr, setPreviewQr] = useState<{ item: QrItem; dataUrl: string; url: string } | null>(null)

  const loadCodes = useCallback(async () => {
    setLoading(true)
    try {
      const r = await authFetch('/api/school-qr-codes')
      const j = await r.json()
      setCodes(j.data || [])
    } catch { toast.error('Erreur de chargement des QR codes') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadCodes() }, [loadCodes])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const d = DURATIONS.find(x => x.value === duration) || DURATIONS[3]
      const r = await authFetch('/api/school-qr-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label || null, durationHours: d.hours }),
      })
      const j = await r.json()
      if (!r.ok) {
        toast.error(j.error || 'Erreur lors de la génération')
        return
      }
      toast.success('QR code généré avec succès')
      setShowCreate(false)
      setLabel('')
      await loadCodes()
      await openPreview(j.data)
    } catch { toast.error('Erreur réseau') }
    finally { setCreating(false) }
  }

  async function openPreview(item: QrItem) {
    const url = `${window.location.origin}/find-child?token=${item.token}`
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: 'M' })
      setPreviewQr({ item, dataUrl, url })
    } catch {
      toast.error('Impossible de générer l\'image du QR code')
    }
  }

  function copyLink(item: QrItem) {
    const url = `${window.location.origin}/find-child?token=${item.token}`
    navigator.clipboard.writeText(url).then(() => toast.success('Lien copié !')).catch(() => toast.error('Copie impossible'))
  }

  function downloadPng() {
    if (!previewQr) return
    const a = document.createElement('a')
    a.href = previewQr.dataUrl
    a.download = `qr-parents-${previewQr.item.id.slice(-6)}.png`
    a.click()
  }

  async function revoke(item: QrItem) {
    if (!confirm('Révoquer ce QR code ? Les parents ne pourront plus l\'utiliser.')) return
    try {
      const r = await authFetch(`/api/school-qr-codes/${item.id}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('QR code révoqué')
        setPreviewQr(null)
        await loadCodes()
      } else {
        const j = await r.json()
        toast.error(j.error || 'Erreur')
      }
    } catch { toast.error('Erreur réseau') }
  }

  function statusOf(item: QrItem): { label: string; color: string; bg: string } {
    if (!item.isActive) return { label: 'Révoqué', color: '#7f1d1d', bg: '#fecaca' }
    if (new Date(item.expiresAt).getTime() < Date.now()) return { label: 'Expiré', color: '#854d0e', bg: '#fef9c3' }
    return { label: 'Actif', color: '#166534', bg: '#dcfce7' }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>QR Parents</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>
            Générez un QR code d&apos;inscription : les parents le scannent, retrouvent leur enfant et créent leur compte. Vous choisissez la durée de vie.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="edu-gold-cta inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold">
          <Plus size={14} /> Générer un QR code
        </button>
      </div>

      {/* Liste */}
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: IVORY }}>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Libellé</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Créé le</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Expire le</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Statut</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement…</td></tr>
              ) : codes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10" style={{ color: TEXT_MUTED_LUXE }}>
                    <QrCode size={28} className="mx-auto mb-2 opacity-40" />
                    Aucun QR code pour le moment. Cliquez sur « Générer un QR code » pour créer le premier.
                  </td>
                </tr>
              ) : codes.map(item => {
                const st = statusOf(item)
                return (
                  <tr key={item.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                    <td className="px-4 py-3 text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{item.label || 'Inscription parents'}</td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{formatDateFr(item.createdAt)}</td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>
                      <span className="inline-flex items-center gap-1"><Clock size={12} /> {formatDateFr(item.expiresAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ color: st.color, background: st.bg }}>
                        {st.label === 'Actif' ? <CheckCircle2 size={11} /> : null} {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openPreview(item)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: ACCENT }} title="Afficher le QR code"><QrCode size={14} /></button>
                        <button onClick={() => copyLink(item)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: GOLD }} title="Copier le lien"><Copy size={14} /></button>
                        {item.isActive && (
                          <button onClick={() => revoke(item)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-red-50 transition text-red-500" title="Révoquer"><Ban size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal création */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>Générer un QR code parents</h2>
              <button onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1" style={{ color: TEXT_PRIMARY }}>Libellé (optionnel)</label>
                <input value={label} onChange={e => setLabel(e.target.value)} placeholder="ex. Journée portes ouvertes 2026" className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1" style={{ color: TEXT_PRIMARY }}>Durée de vie du QR code *</label>
                <AppSelect value={duration} onChange={setDuration} options={DURATIONS.map(d => ({ value: d.value, label: d.label }))} />
                <p className="text-[12px] mt-2 flex items-start gap-1.5" style={{ color: TEXT_MUTED_LUXE }}>
                  <Clock size={12} className="shrink-0 mt-0.5" />
                  Après expiration, le QR code ne fonctionne plus : mesure de sécurité pour empêcher les inscriptions non autorisées.
                </p>
              </div>
              <button type="submit" disabled={creating} className="w-full py-2.5 rounded-xl font-semibold text-sm edu-gold-cta inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
                Générer le QR code
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal aperçu QR */}
      {previewQr && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreviewQr(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>QR code parents</h2>
              <button onClick={() => setPreviewQr(null)}><X size={18} /></button>
            </div>
            <img src={previewQr.dataUrl} alt="QR code d'inscription parents" className="w-full max-w-[260px] mx-auto rounded-xl border border-[oklch(90%_0.01_175)]" />
            <p className="text-[13px] mt-4" style={{ color: TEXT_PRIMARY }}>
              {previewQr.item.label || 'Inscription parents'} — {userData?.schoolName}
            </p>
            <p className="text-[12px] mt-1" style={{ color: TEXT_MUTED_LUXE }}>
              Le parent scanne ce code, retrouve son enfant (classe + nom) puis crée son compte.
            </p>
            <p className="text-[11px] mt-2" style={{ color: TEXT_MUTED_LUXE }}>Expire le {formatDateFr(previewQr.item.expiresAt)}</p>
            <div className="flex gap-2 mt-5">
              <button onClick={downloadPng} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-[oklch(90%_0.01_175)] inline-flex items-center justify-center gap-2" style={{ color: TEXT_PRIMARY }}>
                <Download size={14} /> Télécharger PNG
              </button>
              <button onClick={() => copyLink(previewQr.item)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold edu-gold-cta inline-flex items-center justify-center gap-2">
                <Copy size={14} /> Copier le lien
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
