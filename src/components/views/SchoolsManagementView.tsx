'use client'

import { useState, useEffect, useRef } from 'react'
import { authFetch } from '@/lib/store'
import type { SchoolData } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY, SUCCESS } from '@/lib/constants'
import { getSubscriptionLabel, getSubscriptionPrice, formatNumber, getStatusPill } from '@/lib/helpers'
import { Plus, Check, X, Eye, Edit, Building2, DollarSign, AlertCircle, CreditCard, Upload, Camera, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
const SchoolMap = dynamic(() => import('@/components/SchoolMap'), { ssr: false })

export default function SchoolsManagementView() {
  const [schools, setSchools] = useState<SchoolData[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', shortName: '', email: '', phone: '', address: '',
    city: '', province: '', country: 'RDC', schoolType: 'MIXTE',
    schoolCategory: 'PRIVEE', maxStudents: 200, establishmentYear: new Date().getFullYear(),
    description: '', mission: '', subscriptionTier: 'FREEMIUM',
    latitude: null as number | null, longitude: null as number | null,
    logo: '', coverImage: '',
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement | null>(null)

  // Edit state
  const [editingSchool, setEditingSchool] = useState<SchoolData | null>(null)
  const [editForm, setEditForm] = useState({
    name: '', shortName: '', email: '', phone: '', address: '',
    city: '', province: '', country: '', schoolType: 'MIXTE',
    schoolCategory: 'PRIVEE', maxStudents: 200, establishmentYear: undefined as number | undefined,
    description: '', mission: '', subscriptionTier: 'FREEMIUM', isActive: true,
    logo: '', coverImage: '',
  })
  const [editLogoPreview, setEditLogoPreview] = useState<string | null>(null)
  const [uploadingEditLogo, setUploadingEditLogo] = useState(false)
  const editLogoInputRef = useRef<HTMLInputElement | null>(null)

  function loadSchools() {
    setLoading(true)
    authFetch('/api/schools?limit=30').then(r => r.json()).then(j => { setSchools(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { loadSchools() }, [])

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner une image')
      return
    }
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('L\'image ne doit pas dépasser 5MB')
      return
    }
    // Show preview immediately
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    // Upload to server
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'schools')
      const res = await authFetch('/api/upload', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        setForm(prev => ({ ...prev, logo: data.url }))
        toast.success('Logo importé avec succès')
      } else {
        toast.error('Erreur lors de l\'import du logo')
      }
    } catch {
      toast.error('Erreur réseau lors de l\'import')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleAddSchool(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.shortName || !form.email || !form.phone || !form.city || !form.province || !form.country) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }
    setSaving(true)
    try {
      // 1. Créer l'école
      const res = await authFetch('/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const schoolData = await res.json()
        const schoolId = schoolData.data?.id

        // 2. Si l'abonnement est payant, enregistrer le paiement en liquide
        const tierPrices: Record<string, number> = {
          ESSENTIEL: 100, STANDARD: 250, PREMIUM: 500, ENTERPRISE: 1000, CORPORATE: 0,
        }
        const price = tierPrices[form.subscriptionTier] || 0
        if (price > 0 && schoolId) {
          try {
            await authFetch('/api/payments/subscription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                schoolId,
                amount: price,
                subscriptionTier: form.subscriptionTier,
                paymentMethod: 'CASH',
                description: `Abonnement ${getSubscriptionLabel(form.subscriptionTier)} - ${getSubscriptionPrice(form.subscriptionTier)} - Paiement en liquide`,
              }),
            })
          } catch {
            // Payment recording failed, but school was created
            console.warn('Failed to record subscription payment')
          }
        }

        toast.success(`École ajoutée avec succès !${price > 0 ? ` Paiement de ${price}$ en liquide enregistré.` : ''}`)
        setShowAddModal(false)
        setForm({ name: '', shortName: '', email: '', phone: '', address: '', city: '', province: '', country: 'RDC', schoolType: 'MIXTE', schoolCategory: 'PRIVEE', maxStudents: 200, establishmentYear: new Date().getFullYear(), description: '', mission: '', subscriptionTier: 'FREEMIUM', latitude: null, longitude: null, logo: '', coverImage: '' })
        setLogoPreview(null)
        loadSchools()
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur lors de l\'ajout')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  function openEditModal(s: SchoolData) {
    setEditingSchool(s)
    setEditForm({
      name: s.name, shortName: s.shortName, email: s.email, phone: s.phone, address: s.address || '',
      city: s.city, province: s.province, country: s.country || 'RDC', schoolType: s.schoolType || 'MIXTE',
      schoolCategory: s.schoolCategory || 'PRIVEE', maxStudents: s.maxStudents || 200,
      establishmentYear: s.establishmentYear, description: s.description || '', mission: s.mission || '',
      subscriptionTier: s.subscriptionTier || 'FREEMIUM', isActive: s.isActive !== false,
      logo: s.logo || '', coverImage: s.coverImage || '',
    })
    setEditLogoPreview(s.logo || null)
  }

  async function handleEditLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Veuillez sélectionner une image'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('L\'image ne doit pas dépasser 5MB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setEditLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    setUploadingEditLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'schools')
      const res = await authFetch('/api/upload', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        setEditForm(prev => ({ ...prev, logo: data.url }))
        toast.success('Logo importé avec succès')
      } else { toast.error('Erreur lors de l\'import du logo') }
    } catch { toast.error('Erreur réseau lors de l\'import') }
    finally { setUploadingEditLogo(false) }
  }

  async function handleEditSchool(e: React.FormEvent) {
    e.preventDefault()
    if (!editingSchool) return
    setSaving(true)
    try {
      const res = await authFetch(`/api/schools/${editingSchool.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (res.ok) {
        toast.success('École modifiée avec succès !')
        setEditingSchool(null)
        loadSchools()
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur lors de la modification')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Écoles</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>{formatNumber(schools.length)} écoles</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="edu-gold-cta inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold">
          <Plus size={14} /> Ajouter une école
        </button>
      </div>

      {/* Add School Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-[oklch(90%_0.01_175)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                  <Building2 size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>Ajouter une école</h2>
                  <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Créer un nouvel établissement</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 rounded-lg hover:bg-[oklch(95%_0.04_175)] transition"><X size={18} /></button>
            </div>
            <form onSubmit={handleAddSchool} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Import du logo */}
              <div className="flex items-start gap-5">
                <div className="shrink-0">
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="relative w-24 h-24 rounded-2xl border-2 border-dashed border-[oklch(88%_0.01_175)] hover:border-[oklch(72%_0.15_65)] transition-all grid place-items-center overflow-hidden group"
                    style={{ background: logoPreview ? 'transparent' : 'oklch(97% 0.005 175)' }}
                  >
                    {logoPreview ? (
                      <>
                        <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
                          <Camera size={20} className="text-white" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        {uploadingLogo ? (
                          <div className="h-6 w-6 border-2 border-[oklch(72%_0.15_65)] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ImagePlus size={24} style={{ color: TEXT_MUTED_LUXE }} />
                        )}
                        <span className="text-[10px] font-medium" style={{ color: TEXT_MUTED_LUXE }}>Logo</span>
                      </div>
                    )}
                  </button>
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <label className="text-[13px] font-semibold" style={{ color: TEXT_PRIMARY }}>Logo de l&apos;école</label>
                  <p className="text-[11px] mt-0.5 mb-2" style={{ color: TEXT_MUTED_LUXE }}>Importez le logo de l&apos;établissement (JPG, PNG, SVG — max 5MB)</p>
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-[oklch(88%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition disabled:opacity-50"
                    style={{ color: TEXT_MUTED_LUXE }}
                  >
                    <Upload size={12} />
                    {uploadingLogo ? 'Import en cours...' : logoPreview ? 'Changer le logo' : 'Importer un logo'}
                  </button>
                </div>
              </div>

              {/* Carte interactive pour la localisation */}
              <SchoolMap
                latitude={form.latitude}
                longitude={form.longitude}
                onLocationChange={(lat, lng, address) => {
                  setForm(prev => ({
                    ...prev,
                    latitude: lat,
                    longitude: lng,
                    ...(address ? {
                      address: address.address || prev.address,
                      city: address.city || prev.city,
                      province: address.province || prev.province,
                      country: address.country || prev.country,
                    } : {}),
                  }))
                }}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Nom de l&apos;école *</label>
                  <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Complexe Scolaire Lumière" className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Sigle / Abréviation *</label>
                  <input type="text" required value={form.shortName} onChange={e => setForm({ ...form, shortName: e.target.value })} placeholder="Ex: CSL" className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Email professionnel *</label>
                  <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contact@ecole.cd" className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Téléphone *</label>
                  <input type="tel" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+243 81 234 56 78" className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Adresse</label>
                  <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Remplie auto. par la carte" className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Ville *</label>
                  <input type="text" required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Remplie auto. par la carte" className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Province *</label>
                  <input type="text" required value={form.province} onChange={e => setForm({ ...form, province: e.target.value })} placeholder="Remplie auto. par la carte" className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Pays *</label>
                  <input type="text" required value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="Remplie auto. par la carte" className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Type d&apos;école</label>
                  <select value={form.schoolType} onChange={e => setForm({ ...form, schoolType: e.target.value })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)]">
                    <option value="MIXTE">Mixte</option>
                    <option value="FILLES">Filles</option>
                    <option value="GARCONS">Garçons</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Catégorie</label>
                  <select value={form.schoolCategory} onChange={e => setForm({ ...form, schoolCategory: e.target.value })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)]">
                    <option value="PRIVEE">Privée</option>
                    <option value="PUBLIQUE">Publique</option>
                    <option value="CONVENTIONNEE">Conventionnée</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Capacité max</label>
                  <input type="number" value={form.maxStudents} onChange={e => setForm({ ...form, maxStudents: parseInt(e.target.value) || 100 })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Année de fondation</label>
                  <input type="number" value={form.establishmentYear ?? ''} onChange={e => setForm({ ...form, establishmentYear: e.target.value ? parseInt(e.target.value) : undefined })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
              </div>
              {/* Abonnement */}
              <div className="bg-[oklch(97%_0.005_175)] border border-[oklch(90%_0.01_175)] rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CreditCard size={16} style={{ color: GOLD }} />
                  <label className="text-[13px] font-semibold" style={{ color: TEXT_PRIMARY }}>Abonnement & Paiement</label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Formule d&apos;abonnement</label>
                    <select value={form.subscriptionTier} onChange={e => setForm({ ...form, subscriptionTier: e.target.value })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)]">
                      <option value="FREEMIUM">Freemium — 0$/mois</option>
                      <option value="ESSENTIEL">Essentiel — 100$/mois</option>
                      <option value="STANDARD">Standard — 250$/mois</option>
                      <option value="PREMIUM">Professionnel — 500$/mois</option>
                      <option value="ENTERPRISE">Enterprise — 1 000$/mois</option>
                      <option value="CORPORATE">Corporate — Sur mesure</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Mode de paiement</label>
                    <div className="flex items-center gap-2 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl bg-white">
                      <DollarSign size={16} style={{ color: SUCCESS }} />
                      <span className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Liquide (Cash)</span>
                      <span className="text-[11px] ml-auto" style={{ color: TEXT_MUTED_LUXE }}>Encaissé par l&apos;admin</span>
                    </div>
                  </div>
                </div>
                {form.subscriptionTier !== 'FREEMIUM' && (
                  <div className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg" style={{ background: `${GOLD}15`, color: GOLD }}>
                    <AlertCircle size={14} />
                    <span>Le paiement de <strong>{getSubscriptionPrice(form.subscriptionTier)}</strong> sera enregistré comme reçu en liquide lors de la création.</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Brève description de l'établissement..." className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)] resize-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Mission</label>
                <textarea value={form.mission} onChange={e => setForm({ ...form, mission: e.target.value })} rows={2} placeholder="Mission de l'établissement..." className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)] resize-none" />
              </div>
              <div className="sticky bottom-0 bg-white border-t border-[oklch(90%_0.01_175)] flex items-center justify-end gap-3 p-4 -mx-6 -mb-6 mt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium border border-[oklch(88%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
                <button type="submit" disabled={saving} className="edu-gold-cta px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                  {saving ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
                  Créer l&apos;école
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit School Modal */}
      {editingSchool && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingSchool(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-[oklch(90%_0.01_175)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                  <Edit size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>Modifier {editingSchool.name}</h2>
                  <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Mettre à jour les informations</p>
                </div>
              </div>
              <button onClick={() => setEditingSchool(null)} className="p-2 rounded-lg hover:bg-[oklch(95%_0.04_175)] transition"><X size={18} /></button>
            </div>
            <form onSubmit={handleEditSchool} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Logo */}
              <div className="flex items-start gap-5">
                <div className="shrink-0">
                  <input ref={editLogoInputRef} type="file" accept="image/*" className="hidden" onChange={handleEditLogoUpload} />
                  <button type="button" onClick={() => editLogoInputRef.current?.click()} disabled={uploadingEditLogo}
                    className="relative w-24 h-24 rounded-2xl border-2 border-dashed border-[oklch(88%_0.01_175)] hover:border-[oklch(72%_0.15_65)] transition-all grid place-items-center overflow-hidden group"
                    style={{ background: editLogoPreview ? 'transparent' : 'oklch(97% 0.005 175)' }}>
                    {editLogoPreview ? (
                      <>
                        <img src={editLogoPreview} alt="Logo" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center"><Camera size={20} className="text-white" /></div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        {uploadingEditLogo ? <div className="h-6 w-6 border-2 border-[oklch(72%_0.15_65)] border-t-transparent rounded-full animate-spin" /> : <ImagePlus size={24} style={{ color: TEXT_MUTED_LUXE }} />}
                        <span className="text-[10px] font-medium" style={{ color: TEXT_MUTED_LUXE }}>Logo</span>
                      </div>
                    )}
                  </button>
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <label className="text-[13px] font-semibold" style={{ color: TEXT_PRIMARY }}>Logo de l&apos;école</label>
                  <p className="text-[11px] mt-0.5 mb-2" style={{ color: TEXT_MUTED_LUXE }}>Importez le logo (JPG, PNG, SVG — max 5MB)</p>
                  <button type="button" onClick={() => editLogoInputRef.current?.click()} disabled={uploadingEditLogo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-[oklch(88%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition disabled:opacity-50"
                    style={{ color: TEXT_MUTED_LUXE }}>
                    <Upload size={12} />{uploadingEditLogo ? 'Import...' : editLogoPreview ? 'Changer' : 'Importer'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Nom de l&apos;école *</label>
                  <input type="text" required value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Sigle *</label>
                  <input type="text" required value={editForm.shortName} onChange={e => setEditForm({ ...editForm, shortName: e.target.value })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Email *</label>
                  <input type="email" required value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Téléphone *</label>
                  <input type="tel" required value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Ville *</label>
                  <input type="text" required value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Province *</label>
                  <input type="text" required value={editForm.province} onChange={e => setEditForm({ ...editForm, province: e.target.value })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Type d&apos;école</label>
                  <select value={editForm.schoolType} onChange={e => setEditForm({ ...editForm, schoolType: e.target.value })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)]">
                    <option value="MIXTE">Mixte</option>
                    <option value="FILLES">Filles</option>
                    <option value="GARCONS">Garçons</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Catégorie</label>
                  <select value={editForm.schoolCategory} onChange={e => setEditForm({ ...editForm, schoolCategory: e.target.value })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)]">
                    <option value="PRIVEE">Privée</option>
                    <option value="PUBLIQUE">Publique</option>
                    <option value="CONVENTIONNEE">Conventionnée</option>
                  </select>
                </div>
              </div>

              {/* Abonnement */}
              <div className="bg-[oklch(97%_0.005_175)] border border-[oklch(90%_0.01_175)] rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CreditCard size={16} style={{ color: GOLD }} />
                  <label className="text-[13px] font-semibold" style={{ color: TEXT_PRIMARY }}>Abonnement</label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Formule</label>
                    <select value={editForm.subscriptionTier} onChange={e => setEditForm({ ...editForm, subscriptionTier: e.target.value })} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)]">
                      <option value="FREEMIUM">Freemium — 0$/mois</option>
                      <option value="ESSENTIEL">Essentiel — 100$/mois</option>
                      <option value="STANDARD">Standard — 250$/mois</option>
                      <option value="PREMIUM">Professionnel — 500$/mois</option>
                      <option value="ENTERPRISE">Enterprise — 1 000$/mois</option>
                      <option value="CORPORATE">Corporate — Sur mesure</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Statut</label>
                    <div className="flex items-center gap-3 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl bg-white">
                      <input type="checkbox" checked={editForm.isActive} onChange={e => setEditForm({ ...editForm, isActive: e.target.checked })} className="w-4 h-4 accent-[oklch(72%_0.15_65)]" />
                      <span className="text-sm" style={{ color: TEXT_PRIMARY }}>{editForm.isActive ? 'Actif' : 'Suspendu'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Description</label>
                <textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] resize-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Mission</label>
                <textarea value={editForm.mission} onChange={e => setEditForm({ ...editForm, mission: e.target.value })} rows={2} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] resize-none" />
              </div>

              <div className="sticky bottom-0 bg-white border-t border-[oklch(90%_0.01_175)] flex items-center justify-end gap-3 p-4 -mx-6 -mb-6 mt-4">
                <button type="button" onClick={() => setEditingSchool(null)} className="px-5 py-2.5 rounded-xl text-sm font-medium border border-[oklch(88%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
                <button type="submit" disabled={saving} className="edu-gold-cta px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                  {saving ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: IVORY }}>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>École</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Abonnement</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Élèves</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Statut</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
              ) : schools.map(s => (
                <tr key={s.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {s.logo ? (
                        <img src={s.logo} alt={s.shortName} className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full grid place-items-center text-white font-semibold text-[11px] shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                          {s.shortName.substring(0, 2)}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-[13px]" style={{ color: TEXT_PRIMARY }}>{s.name}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{s.city} · {s.province}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_PRIMARY }}><strong>{getSubscriptionLabel(s.subscriptionTier)}</strong> · {getSubscriptionPrice(s.subscriptionTier)}</td>
                  <td className="px-4 py-3 text-[13px] font-semibold tabular-nums" style={{ color: TEXT_PRIMARY }}>{formatNumber(s._count?.students || s.studentCount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${getStatusPill(s.isActive ? 'Actif' : 'Suspendu')}`}>
                      {s.isActive ? 'Actif' : 'Suspendu'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => toast.info(`École: ${s.name}`)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: TEXT_MUTED_LUXE }}><Eye size={14} /></button>
                      <button onClick={() => openEditModal(s)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: TEXT_MUTED_LUXE }}><Edit size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}