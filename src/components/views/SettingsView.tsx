'use client'

import { useState, useEffect, useRef } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import type { SchoolData } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, GOLD_SOFT, SUCCESS, DANGER } from '@/lib/constants'
import { getInitials } from '@/lib/helpers'
import { Building2, MapPin, FileText, Save, Star, MessageCircle, Trash2, Camera, ImagePlus, Plus, Edit, GraduationCap } from 'lucide-react'
import { toast } from 'sonner'

export default function SettingsView() {
  const { userRole, setCurrentView } = useEduGestStore()

  // ── Defense-in-depth role guard ────────────────────────────────────────
  // School settings are restricted to SUPER_ADMIN_GLOBAL and SECRETARY.
  // The Topbar gear now routes everyone to 'profile', but this guard ensures
  // that even a direct view switch (e.g. legacy sidebar, dev tools, stale
  // state) cannot land a non-admin on this page.
  const canManageSchool = userRole === 'SUPER_ADMIN_GLOBAL' || userRole === 'SECRETARY'
  if (!canManageSchool) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <div className="w-16 h-16 rounded-full grid place-items-center mx-auto mb-4" style={{ background: GOLD_SOFT }}>
          <Building2 size={28} style={{ color: GOLD }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: TEXT_PRIMARY }}>Accès restreint</h2>
        <p className="text-sm mb-6" style={{ color: TEXT_MUTED_LUXE }}>
          Seuls les administrateurs peuvent accéder aux paramètres de l&apos;école.
          Vous pouvez consulter et modifier votre profil personnel.
        </p>
        <button onClick={() => setCurrentView('profile')} className="edu-gold-cta px-6 py-2.5 rounded-xl text-sm font-semibold">
          Aller à mon profil
        </button>
      </div>
    )
  }

  return <SettingsViewInner />
}

function SettingsViewInner() {
  const { userData, userRole } = useEduGestStore()
  const [school, setSchool] = useState<SchoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [comments, setComments] = useState<{ id: string; authorName: string; rating: number; comment: string; isApproved: boolean; createdAt: string }[]>([])
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'fees'>('info')
  const [fees, setFees] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [showFeeModal, setShowFeeModal] = useState(false)
  const [feeForm, setFeeForm] = useState({ name: '', amount: '', trimester: 'T1', classId: '' })
  const [editingFee, setEditingFee] = useState<any>(null)

  // Form fields
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [province, setProvince] = useState('')
  const [country, setCountry] = useState('')
  const [description, setDescription] = useState('')
  const [history, setHistory] = useState('')
  const [mission, setMission] = useState('')
  const [establishmentYear, setEstablishmentYear] = useState('')
  const [schoolType, setSchoolType] = useState('MIXTE')
  const [schoolCategory, setSchoolCategory] = useState('PRIVEE')
  const [maxStudents, setMaxStudents] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')

  useEffect(() => {
    if (userData?.schoolId) {
      authFetch(`/api/schools/${userData.schoolId}`)
        .then(r => r.json())
        .then(j => {
          const s = j.data
          if (s) {
            setSchool(s)
            setName(s.name || '')
            setShortName(s.shortName || '')
            setEmail(s.email || '')
            setPhone(s.phone || '')
            setAddress(s.address || '')
            setCity(s.city || '')
            setProvince(s.province || '')
            setCountry(s.country || '')
            setDescription(s.description || '')
            setHistory(s.history || '')
            setMission(s.mission || '')
            setEstablishmentYear(s.establishmentYear ? String(s.establishmentYear) : '')
            setSchoolType(s.schoolType || 'MIXTE')
            setSchoolCategory(s.schoolCategory || 'PRIVEE')
            setMaxStudents(String(s.maxStudents || 100))
            setLogoUrl(s.logo || '')
            setCoverUrl(s.coverImage || '')
          }
          setLoading(false)
        })
        .catch(() => setLoading(false))
      // Fetch pending comments
      authFetch(`/api/school-comments?schoolId=${userData.schoolId}&approved=false`)
        .then(r => r.json())
        .then(j => setComments(j.data || []))
        .catch(() => {})
    }
  }, [userData?.schoolId])

  useEffect(() => {
    if (userData?.schoolId) {
      authFetch(`/api/school-fees?schoolId=${userData.schoolId}`).then(r => r.json()).then(j => setFees(j.data || []))
      authFetch(`/api/classes?schoolId=${userData.schoolId}`).then(r => r.json()).then(j => setClasses(j.data || []))
    }
  }, [userData?.schoolId])

  async function handleSave() {
    if (!userData?.schoolId) return
    setSaving(true)
    try {
      const res = await authFetch(`/api/schools/${userData.schoolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, shortName, email, phone, address, city, province, country,
          description, history, mission,
          establishmentYear: establishmentYear ? parseInt(establishmentYear) : null,
          schoolType, schoolCategory,
          maxStudents: parseInt(maxStudents) || 100,
        }),
      })
      if (res.ok) {
        const j = await res.json()
        setSchool(j.data)
        toast.success('Paramètres mis à jour avec succès !')
      } else {
        toast.error('Erreur lors de la mise à jour')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setSaving(false)
  }

  async function handleImageUpload(file: File, type: 'logo' | 'coverImage') {
    if (type === 'logo') setUploadingLogo(true)
    else setUploadingCover(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'schools')
      const uploadRes = await authFetch('/api/upload', { method: 'POST', body: formData })
      if (uploadRes.ok) {
        const uploadJson = await uploadRes.json()
        const url = uploadJson.url
        const res = await authFetch(`/api/schools/${userData?.schoolId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [type]: url }),
        })
        if (res.ok) {
          if (type === 'logo') setLogoUrl(url)
          else setCoverUrl(url)
          toast.success(type === 'logo' ? 'Logo mis à jour !' : 'Image de couverture mise à jour !')
        } else {
          toast.error('Erreur lors de la mise à jour de l\'école')
        }
      } else {
        toast.error('Erreur lors de l\'import de l\'image')
      }
    } catch {
      toast.error('Erreur lors du téléchargement')
    }
    if (type === 'logo') setUploadingLogo(false)
    else setUploadingCover(false)
  }

  async function handleApproveComment(id: string) {
    try {
      const res = await authFetch('/api/school-comments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isApproved: true }),
      })
      if (res.ok) {
        setComments(prev => prev.filter(c => c.id !== id))
        toast.success('Commentaire approuvé !')
      }
    } catch {
      toast.error('Erreur')
    }
  }

  async function handleDeleteComment(id: string) {
    try {
      const res = await authFetch(`/api/school-comments?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setComments(prev => prev.filter(c => c.id !== id))
        toast.success('Commentaire supprimé')
      }
    } catch {
      toast.error('Erreur')
    }
  }

  if (loading) return <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div>

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Paramètres de l&apos;école</h1>
      </div>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setActiveTab('info')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'info' ? 'text-white' : ''}`} style={activeTab === 'info' ? { background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` } : { color: TEXT_MUTED_LUXE }}>
          Informations
        </button>
        <button onClick={() => setActiveTab('fees')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'fees' ? 'text-white' : ''}`} style={activeTab === 'fees' ? { background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` } : { color: TEXT_MUTED_LUXE }}>
          <GraduationCap size={14} className="inline mr-1" /> Frais scolaires
        </button>
      </div>

      {/* Cover Image */}
      <div className="mb-6 rounded-2xl overflow-hidden border border-[oklch(90%_0.01_175)] shadow-sm">
        <div className="relative h-40 sm:h-52" style={{ background: coverUrl ? `url(${coverUrl}) center/cover` : `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-4 left-5 flex items-center gap-4">
            {/* Logo */}
            <div className="relative group">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-20 h-20 rounded-2xl object-cover border-4 border-white shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-2xl grid place-items-center text-white text-2xl font-bold border-4 border-white shadow-lg" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                  {getInitials(name || 'S')}
                </div>
              )}
              <button
                onClick={() => logoInputRef.current?.click()}
                className="absolute inset-0 rounded-2xl bg-black/50 grid place-items-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
              >
                {uploadingLogo ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera size={20} className="text-white" />}
              </button>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, 'logo') }} />
            </div>
            <div>
              <h2 className="text-white text-xl font-bold drop-shadow">{name || 'Mon École'}</h2>
              <p className="text-white/80 text-sm">{city}{province ? `, ${province}` : ''} · {schoolCategory === 'PRIVEE' ? 'Privée' : 'Publique'}</p>
            </div>
          </div>
          <button
            onClick={() => coverInputRef.current?.click()}
            className="absolute top-4 right-4 px-3 py-1.5 rounded-xl bg-white/90 text-xs font-medium flex items-center gap-1.5 hover:bg-white transition shadow-sm"
            style={{ color: TEXT_PRIMARY }}
          >
            {uploadingCover ? <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <ImagePlus size={13} />}
            Changer la couverture
          </button>
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, 'coverImage') }} />
        </div>
      </div>

      {activeTab === 'info' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Informations générales */}
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
              <Building2 size={16} style={{ color: GOLD }} /> Informations générales
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Nom de l&apos;école *</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Abréviation</label>
                <input value={shortName} onChange={e => setShortName(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Téléphone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Type d&apos;école</label>
                <select value={schoolType} onChange={e => setSchoolType(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                  <option value="MIXTE">Mixte</option>
                  <option value="GARCONS">Garçons</option>
                  <option value="FILLES">Filles</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Catégorie</label>
                <select value={schoolCategory} onChange={e => setSchoolCategory(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                  <option value="PRIVEE">Privée</option>
                  <option value="PUBLIQUE">Publique</option>
                  <option value="CONVENTIONNEE">Conventionnée</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Année de fondation</label>
                <input type="number" value={establishmentYear} onChange={e => setEstablishmentYear(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Max élèves</label>
                <input type="number" value={maxStudents} onChange={e => setMaxStudents(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
            </div>
          </div>

          {/* Adresse */}
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
              <MapPin size={16} style={{ color: GOLD }} /> Adresse
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Adresse</label>
                <input value={address} onChange={e => setAddress(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Ville</label>
                <input value={city} onChange={e => setCity(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Province</label>
                <input value={province} onChange={e => setProvince(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Pays</label>
                <input value={country} onChange={e => setCountry(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
              <FileText size={16} style={{ color: GOLD }} /> Descriptif
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Historique</label>
                <textarea value={history} onChange={e => setHistory(e.target.value)} rows={3} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Mission</label>
                <textarea value={mission} onChange={e => setMission(e.target.value)} rows={3} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] resize-none" />
              </div>
            </div>
          </div>

          {/* Save button */}
          <button onClick={handleSave} disabled={saving} className="edu-gold-cta px-8 py-3 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
            Enregistrer les modifications
          </button>
        </div>

        {/* Sidebar - Stats + Comments */}
        <div className="space-y-6">
          {/* School Stats */}
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold mb-4" style={{ color: TEXT_PRIMARY }}>Statistiques</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span style={{ color: TEXT_MUTED_LUXE }}>Élèves inscrits</span>
                <span className="font-semibold" style={{ color: TEXT_PRIMARY }}>{school?.studentCount || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: TEXT_MUTED_LUXE }}>Classes</span>
                <span className="font-semibold" style={{ color: TEXT_PRIMARY }}>{school?.classCount || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: TEXT_MUTED_LUXE }}>Note moyenne</span>
                <span className="font-semibold flex items-center gap-1" style={{ color: GOLD }}>
                  <Star size={13} fill={GOLD} /> {school?.averageRating || 0}/5
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: TEXT_MUTED_LUXE }}>Avis</span>
                <span className="font-semibold" style={{ color: TEXT_PRIMARY }}>{school?.totalReviews || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: TEXT_MUTED_LUXE }}>Abonnement</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: GOLD_SOFT, color: GOLD }}>{school?.subscriptionTier || 'FREEMIUM'}</span>
              </div>
            </div>
          </div>

          {/* Pending Comments */}
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
              <MessageCircle size={16} style={{ color: GOLD }} /> Commentaires en attente
              {comments.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: DANGER }}>{comments.length}</span>}
            </h3>
            {comments.length === 0 ? (
              <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Aucun commentaire en attente</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                {comments.map(c => (
                  <div key={c.id} className="p-3 rounded-xl border border-[oklch(90%_0.01_175)]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{c.authorName}</span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={10} fill={i < c.rating ? GOLD : 'none'} style={{ color: i < c.rating ? GOLD : 'oklch(85%_0.01_175)' }} />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs mb-2" style={{ color: TEXT_MUTED_LUXE }}>{c.comment}</p>
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveComment(c.id)} className="flex-1 py-1 rounded-lg text-[11px] font-semibold text-white" style={{ background: SUCCESS }}>Approuver</button>
                      <button onClick={() => handleDeleteComment(c.id)} className="py-1 px-2 rounded-lg text-[11px] font-medium border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)]" style={{ color: DANGER }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {activeTab === 'fees' && (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
              <GraduationCap size={16} style={{ color: GOLD }} /> Frais scolaires
            </h3>
            <button
              onClick={() => { setEditingFee(null); setFeeForm({ name: '', amount: '', trimester: 'T1', classId: '' }); setShowFeeModal(true) }}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white inline-flex items-center gap-1.5"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}
            >
              <Plus size={14} /> Ajouter
            </button>
          </div>

          {fees.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucun frais scolaire enregistré</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[oklch(90%_0.01_175)]">
                    <th className="text-left py-3 px-2 font-medium" style={{ color: TEXT_MUTED_LUXE }}>Nom</th>
                    <th className="text-left py-3 px-2 font-medium" style={{ color: TEXT_MUTED_LUXE }}>Montant (CDF)</th>
                    <th className="text-left py-3 px-2 font-medium" style={{ color: TEXT_MUTED_LUXE }}>Trimestre</th>
                    <th className="text-left py-3 px-2 font-medium" style={{ color: TEXT_MUTED_LUXE }}>Classe</th>
                    <th className="text-right py-3 px-2 font-medium" style={{ color: TEXT_MUTED_LUXE }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.map(fee => (
                    <tr key={fee.id} className="border-b border-[oklch(92%_0.008_175)] last:border-0">
                      <td className="py-3 px-2 font-medium" style={{ color: TEXT_PRIMARY }}>{fee.name}</td>
                      <td className="py-3 px-2" style={{ color: TEXT_PRIMARY }}>{Number(fee.amount).toLocaleString()}</td>
                      <td className="py-3 px-2">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: GOLD_SOFT, color: GOLD }}>{fee.trimester}</span>
                      </td>
                      <td className="py-3 px-2" style={{ color: TEXT_PRIMARY }}>{classes.find(c => c.id === fee.classId)?.name || '—'}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setEditingFee(fee); setFeeForm({ name: fee.name, amount: String(fee.amount), trimester: fee.trimester, classId: fee.classId || '' }); setShowFeeModal(true) }}
                            className="p-1.5 rounded-lg border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition"
                            style={{ color: ACCENT }}
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm('Supprimer ce frais ?')) return
                              const res = await authFetch(`/api/school-fees/${fee.id}`, { method: 'DELETE' })
                              if (res.ok) {
                                setFees(prev => prev.filter(f => f.id !== fee.id))
                                toast.success('Frais supprimé')
                              }
                            }}
                            className="p-1.5 rounded-lg border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition"
                            style={{ color: DANGER }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Fee Modal */}
      {showFeeModal && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={() => setShowFeeModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
              <GraduationCap size={16} style={{ color: GOLD }} /> {editingFee ? 'Modifier le frais' : 'Ajouter un frais'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Nom du frais *</label>
                <input value={feeForm.name} onChange={e => setFeeForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Montant (CDF) *</label>
                <input type="number" value={feeForm.amount} onChange={e => setFeeForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Trimestre *</label>
                <select value={feeForm.trimester} onChange={e => setFeeForm(f => ({ ...f, trimester: e.target.value }))} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                  <option value="T1">T1</option>
                  <option value="T2">T2</option>
                  <option value="T3">T3</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Classe *</label>
                <select value={feeForm.classId} onChange={e => setFeeForm(f => ({ ...f, classId: e.target.value }))} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                  <option value="">Choisir une classe</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowFeeModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[oklch(90%_0.01_175)]" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
              <button
                onClick={async () => {
                  if (!feeForm.name || !feeForm.amount) { toast.error('Nom et montant requis'); return }
                  if (!feeForm.classId) { toast.error('Veuillez choisir une classe'); return }
                  const body = { name: feeForm.name, amount: Number(feeForm.amount), trimester: feeForm.trimester, classId: feeForm.classId, schoolId: userData?.schoolId }
                  let res
                  if (editingFee) {
                    res = await authFetch(`/api/school-fees/${editingFee.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                  } else {
                    res = await authFetch('/api/school-fees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                  }
                  if (res.ok) {
                    const j = await res.json()
                    if (editingFee) { setFees(prev => prev.map(f => f.id === editingFee.id ? j.data : f)) }
                    else { setFees(prev => [...prev, j.data]) }
                    setShowFeeModal(false)
                    toast.success(editingFee ? 'Frais modifié' : 'Frais ajouté')
                  } else {
                    const err = await res.json().catch(() => ({ error: 'Erreur' }))
                    toast.error(err.error || 'Erreur lors de l\'enregistrement')
                  }
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}
              >
                {editingFee ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}