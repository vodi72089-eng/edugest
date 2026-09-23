'use client'

import { useState, useEffect, useRef } from 'react'
import { useEduGestStore, authFetch, getActiveSchoolId } from '@/lib/store'
import type { SchoolData } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, GOLD_SOFT, SUCCESS, DANGER } from '@/lib/constants'
import { getInitials } from '@/lib/helpers'
import { Building2, MapPin, FileText, Save, Star, MessageCircle, Trash2, Camera, ImagePlus, Plus, Edit, GraduationCap, Monitor, Smartphone, LogOut, Tablet, Globe, Fingerprint, Palette, HardDriveDownload } from 'lucide-react'
import PersonalizationView from './PersonalizationView'
import { toast } from 'sonner'
import { detectDevice, formatDeviceTitle, formatDeviceSummary, isLoopbackIp } from '@/lib/detect-device'
import CurrentDeviceInfo from '@/components/CurrentDeviceInfo'
import AppSelect from '@/components/ui/AppSelect'

export default function SettingsView() {
  const { userRole, userData, setCurrentView } = useEduGestStore()

  // ── Defense-in-depth role guard ────────────────────────────────────────
  // Paramètres école : réservés à SUPER_ADMIN_GLOBAL et SCHOOL_ADMIN
  // (personnalisation). Le secrétaire et les DIRECTION_* n'y ont plus
  // AUCUN accès — décision produit, le menu ne leur est plus non plus
  // affiché, et l'API refuse leurs demandes de changement.
  const personalizationOnly = userRole === 'SCHOOL_ADMIN'
  const canManageSchool = userRole === 'SUPER_ADMIN_GLOBAL' || personalizationOnly
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
  const { userData, userRole, setCurrentView } = useEduGestStore()
  // SCHOOL_ADMIN : uniquement l'onglet Personnalisation (intègre l'ancienne
  // vue « Personnalisation » — demande utilisateur)
  const personalizationOnly = userRole === 'SCHOOL_ADMIN'
  const canPersonalize = userRole === 'SUPER_ADMIN_GLOBAL' || userRole === 'SCHOOL_ADMIN'
  // Modération des avis : réservée aux rôles disposant de « comments:approve »
  // (SCHOOL_ADMIN + super admin). Évite un 403 systématique + une carte
  // trompeuse « Aucun commentaire en attente » pour secrétaire / direction.
  const canModerateComments = userRole === 'SUPER_ADMIN_GLOBAL' || userRole === 'SCHOOL_ADMIN'
  const [school, setSchool] = useState<SchoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [comments, setComments] = useState<{ id: string; authorName: string; rating: number; comment: string; isApproved: boolean; createdAt: string }[]>([])
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'fees' | 'devices' | 'personalization'>(personalizationOnly ? 'personalization' : 'info')
  const [fees, setFees] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [showFeeModal, setShowFeeModal] = useState(false)
  const [feeForm, setFeeForm] = useState({ name: '', amount: '', currency: 'CDF', trimester: 'T1', classId: '' })
  const [editingFee, setEditingFee] = useState<any>(null)
  const [selectedFeeClass, setSelectedFeeClass] = useState<string | null>(null)

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

  const [sessions, setSessions] = useState<any[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [revokingSid, setRevokingSid] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
  const isAdmin = userRole === 'SUPER_ADMIN_GLOBAL'

  function loadSessions() {
    setLoadingSessions(true)
    authFetch('/api/sessions')
      .then(r => r.json())
      .then(j => { setSessions(j.data || []); setLoadingSessions(false) })
      .catch(() => setLoadingSessions(false))
  }

  useEffect(() => {
    if (activeTab === 'devices') loadSessions()
  }, [activeTab])

  async function handleRevokeSession(sid: string) {
    setRevokingSid(sid)
    try {
      const res = await authFetch(`/api/sessions/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid }),
      })
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.sid !== sid))
        toast.success('Appareil déconnecté')
      } else toast.error('Erreur lors de la déconnexion')
    } catch { toast.error('Erreur réseau') }
    finally { setRevokingSid(null) }
  }

  async function handleRevokeAll() {
    setRevokingAll(true)
    try {
      const res = await authFetch('/api/sessions/revoke-all', { method: 'POST' })
      if (res.ok) {
        setSessions(prev => prev.filter(s => !s.isCurrent))
        toast.success('Tous les autres appareils déconnectés')
      } else toast.error('Erreur lors de la déconnexion')
    } catch { toast.error('Erreur réseau') }
    finally { setRevokingAll(false) }
  }

  useEffect(() => {
    if (getActiveSchoolId()) {
      authFetch(`/api/schools/${getActiveSchoolId()}`)
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
      // Fetch pending comments (modérateurs uniquement — sinon 403)
      if (canModerateComments) {
        authFetch(`/api/school-comments?schoolId=${getActiveSchoolId()}&approved=false`)
          .then(r => r.json())
          .then(j => setComments(j.data || []))
          .catch(() => {})
      }
      // Fetch pending settings approvals (approvers : admin école + super admin)
      if (userRole === 'SUPER_ADMIN_GLOBAL' || userRole === 'SCHOOL_ADMIN') {
        authFetch(`/api/settings-approval?status=PENDING`)
          .then(r => r.json())
          .then(j => setPendingApprovals(j.data || []))
          .catch(() => {})
      }
    }
  }, [getActiveSchoolId()])

  useEffect(() => {
    if (getActiveSchoolId()) {
      authFetch(`/api/school-fees?schoolId=${getActiveSchoolId()}`).then(r => r.json()).then(j => setFees(j.data || []))
      authFetch(`/api/classes?schoolId=${getActiveSchoolId()}`).then(r => r.json()).then(j => setClasses(j.data || []))
    }
  }, [getActiveSchoolId()])

  async function handleSave() {
    if (!getActiveSchoolId()) return
    setSaving(true)
    try {
      if (!isAdmin) {
        // Non-admin: create approval request instead of saving directly
        const changeData = {
          name, shortName, email, phone, address, city, province, country,
          description, history, mission,
          establishmentYear: establishmentYear ? parseInt(establishmentYear) : null,
          schoolType, schoolCategory,
          maxStudents: parseInt(maxStudents) || 100,
        }
        const currentData = school ? {
          name: school.name, shortName: school.shortName, email: school.email, phone: school.phone,
          address: school.address, city: school.city, province: school.province, country: school.country,
          description: school.description, history: school.history, mission: school.mission,
          establishmentYear: school.establishmentYear, schoolType: school.schoolType,
          schoolCategory: school.schoolCategory, maxStudents: school.maxStudents,
        } : null
        const res = await authFetch('/api/settings-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changeType: 'school_info', changeData, currentData }),
        })
        if (res.ok) {
          toast.success('Demande d\'approbation envoyée à l\'administrateur')
        } else {
          toast.error('Erreur lors de l\'envoi')
        }
      } else {
        // Admin: save directly
        const res = await authFetch(`/api/schools/${getActiveSchoolId()}`, {
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
        const res = await authFetch(`/api/schools/${getActiveSchoolId()}`, {
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

  async function handleApprovalDecision(id: string, decision: 'APPROVED' | 'REJECTED') {
    try {
      const approval = pendingApprovals.find(a => a.id === id)
      if (!approval) return
      if (decision === 'APPROVED' && approval.changeType === 'school_info') {
        // school_info : application côté client (PUT école) — réservé au super admin
        const changeData = JSON.parse(approval.changeData)
        const res = await authFetch(`/api/schools/${getActiveSchoolId()}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changeData),
        })
        if (!res.ok) { toast.error('Erreur lors de l\'application'); return }
        const j = await res.json()
        setSchool(j.data)
        setName(changeData.name || '')
        setShortName(changeData.shortName || '')
        setEmail(changeData.email || '')
        setPhone(changeData.phone || '')
        setAddress(changeData.address || '')
        setCity(changeData.city || '')
        setProvince(changeData.province || '')
        setCountry(changeData.country || '')
        setDescription(changeData.description || '')
        setHistory(changeData.history || '')
        setMission(changeData.mission || '')
        setEstablishmentYear(changeData.establishmentYear ? String(changeData.establishmentYear) : '')
        setSchoolType(changeData.schoolType || 'MIXTE')
        setSchoolCategory(changeData.schoolCategory || 'PRIVEE')
        setMaxStudents(String(changeData.maxStudents || 100))
      }
      // qr_create / class_delete : exécutés côté serveur au moment du PATCH
      await authFetch('/api/settings-approval', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: decision }),
      }).then(async res => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || 'Erreur')
        }
      })
      setPendingApprovals(prev => prev.filter(a => a.id !== id))
      toast.success(decision === 'APPROVED' ? (approval.changeType === 'school_info' ? 'Changements appliqués' : 'Demande approuvée et appliquée') : 'Demande rejetée')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
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
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Paramètres de l&apos;école</h1>
      </div>

      {/* Base de données : import / ré-import réservé aux administrateurs d'école.
          Ouvre le même modal que celui affiché après la connexion, via l'événement
          global 'edugest:open-import-db' (écouté par DashboardLayout). */}
      {userRole === 'SCHOOL_ADMIN' && (
        <div
          className="rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between border"
          style={{ borderColor: 'rgba(245,166,35,0.35)', background: 'linear-gradient(135deg, rgba(245,166,35,0.08), rgba(245,166,35,0.02))' }}
        >
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: GOLD_SOFT }}>
              <HardDriveDownload size={18} style={{ color: GOLD }} aria-hidden="true" />
            </div>
            <div>
              <p className="font-bold text-[15px]" style={{ color: TEXT_PRIMARY }}>Base de données de l&apos;école</p>
              <p className="text-[12.5px] leading-relaxed mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>
                Importez vos fichiers (.db) : élèves, classes, matières, notes et professeurs.
                Les doublons sont ignorés — réimportez sans risque, autant de fois que nécessaire.
              </p>
            </div>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('edugest:open-import-db'))}
            className="edu-gold-cta px-5 py-2.5 rounded-xl text-[13px] font-semibold shrink-0 self-start sm:self-center"
          >
            Importer une base
          </button>
        </div>
      )}

      <div className="flex gap-2 mb-6 flex-wrap">
        {!personalizationOnly && (
          <button onClick={() => setActiveTab('info')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'info' ? 'text-white' : ''}`} style={activeTab === 'info' ? { background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` } : { color: TEXT_MUTED_LUXE }}>
            Informations
          </button>
        )}
        {!personalizationOnly && (
          <button onClick={() => setActiveTab('fees')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'fees' ? 'text-white' : ''}`} style={activeTab === 'fees' ? { background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` } : { color: TEXT_MUTED_LUXE }}>
            <GraduationCap size={14} className="inline mr-1" /> Frais scolaires
          </button>
        )}
        {!personalizationOnly && (
          <button onClick={() => setActiveTab('devices')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'devices' ? 'text-white' : ''}`} style={activeTab === 'devices' ? { background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` } : { color: TEXT_MUTED_LUXE }}>
            <Monitor size={14} className="inline mr-1" /> Appareils connectés
          </button>
        )}
        {canPersonalize && (
          <button onClick={() => setActiveTab('personalization')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'personalization' ? 'text-white' : ''}`} style={activeTab === 'personalization' ? { background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` } : { color: TEXT_MUTED_LUXE }}>
            <Palette size={14} className="inline mr-1" /> Personnalisation
          </button>
        )}
      </div>

      {/* Pending Approvals (approbateurs : admin école + super admin) */}
      {(isAdmin || userRole === 'SCHOOL_ADMIN') && pendingApprovals.length > 0 && (
        <div className="mb-6 bg-white border-2 border-[oklch(72%_0.15_65_/_0.3)] rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: ACCENT }}>
            <Star size={16} style={{ color: ACCENT }} /> Demandes d&apos;approbation en attente ({pendingApprovals.length})
          </h3>
          <div className="space-y-3">
            {pendingApprovals.map(a => {
              const data = JSON.parse(a.changeData || '{}')
              const typeLabel = a.changeType === 'qr_create' ? 'Création QR code'
                : a.changeType === 'class_delete' ? 'Suppression de classe'
                : a.changeType === 'school_info' ? 'Infos école'
                : a.changeType === 'school_fee' ? 'Frais scolaires'
                : a.changeType === 'currency' ? 'Devise'
                : a.changeType
              return (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border border-[oklch(90%_0.01_175)]" style={{ background: GOLD_SOFT }}>
                  <div className="text-sm">
                    <span className="font-semibold" style={{ color: TEXT_PRIMARY }}>{typeLabel}</span>
                    {a.changeType === 'class_delete' && data.className && <span className="text-xs ml-2" style={{ color: TEXT_PRIMARY }}>« {data.className} »</span>}
                    {a.changeType === 'qr_create' && data.label && <span className="text-xs ml-2" style={{ color: TEXT_PRIMARY }}>« {data.label} »</span>}
                    <span className="text-xs ml-2" style={{ color: TEXT_MUTED_LUXE }}>par {a.requestedBy}</span>
                    {data.name && <div className="text-xs mt-1" style={{ color: TEXT_MUTED_LUXE }}>Nom: {data.name}</div>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApprovalDecision(a.id, 'APPROVED')} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: SUCCESS }}>Approuver</button>
                    <button onClick={() => handleApprovalDecision(a.id, 'REJECTED')} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ color: DANGER, borderColor: DANGER + '40' }}>Rejeter</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
                <AppSelect value={schoolType} onChange={setSchoolType} options={[{ value: 'MIXTE', label: 'Mixte' }, { value: 'GARCONS', label: 'Garçons' }, { value: 'FILLES', label: 'Filles' }]} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Catégorie</label>
                <AppSelect value={schoolCategory} onChange={setSchoolCategory} options={[{ value: 'PRIVEE', label: 'Privée' }, { value: 'PUBLIQUE', label: 'Publique' }, { value: 'CONVENTIONNEE', label: 'Conventionnée' }]} />
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
          {!isAdmin && (
            <div className="px-4 py-2.5 rounded-xl text-xs mb-3" style={{ background: `${ACCENT}10`, color: ACCENT }}>
              Les modifications seront envoyées à l&apos;administrateur pour approbation avant d&apos;être appliquées.
            </div>
          )}
          <button onClick={handleSave} disabled={saving} className="edu-gold-cta px-8 py-3 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
            {isAdmin ? 'Enregistrer les modifications' : 'Demander l\'approbation'}
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
              <div className="flex justify-between text-sm items-center">
                <span style={{ color: TEXT_MUTED_LUXE }}>Abonnement</span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: GOLD_SOFT, color: GOLD }}>{school?.subscriptionTier || 'FREEMIUM'}</span>
                  <button
                    onClick={() => setCurrentView('my-subscription')}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition hover:opacity-80"
                    style={{ background: GOLD, color: '#0a0f0d' }}
                  >
                    Upgrade
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Comments — modérateurs uniquement (sinon 403 API) */}
          {canModerateComments && (
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
          )}
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
              onClick={() => { setEditingFee(null); setFeeForm({ name: '', amount: '', currency: 'CDF', trimester: 'T1', classId: '' }); setShowFeeModal(true) }}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white inline-flex items-center gap-1.5"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}
            >
              <Plus size={14} /> Ajouter
            </button>
          </div>

          {fees.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucun frais scolaire enregistré</p>
          ) : (
            <>
              {/* Class filter chips */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={() => setSelectedFeeClass(null)} className={`px-3 py-1 rounded-lg text-xs font-medium transition ${!selectedFeeClass ? 'text-white' : ''}`} style={!selectedFeeClass ? { background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` } : { color: TEXT_MUTED_LUXE, border: '1px solid oklch(90% 0.01 175)' }}>
                  Toutes les classes
                </button>
                {[...new Set(fees.map(f => f.classId))].map(classId => {
                  const cls = classes.find(c => c.id === classId)
                  if (!cls) return null
                  const classFees = fees.filter(f => f.classId === classId)
                  return (
                    <button key={classId} onClick={() => setSelectedFeeClass(selectedFeeClass === classId ? null : classId)} className={`px-3 py-1 rounded-lg text-xs font-medium transition ${selectedFeeClass === classId ? 'text-white' : ''}`} style={selectedFeeClass === classId ? { background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` } : { color: TEXT_MUTED_LUXE, border: '1px solid oklch(90% 0.01 175)' }}>
                      {cls.name} ({classFees.length})
                    </button>
                  )
                })}
              </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[oklch(90%_0.01_175)]">
                    <th className="text-left py-3 px-2 font-medium" style={{ color: TEXT_MUTED_LUXE }}>Nom</th>
                    <th className="text-left py-3 px-2 font-medium" style={{ color: TEXT_MUTED_LUXE }}>Montant</th>
                    <th className="text-left py-3 px-2 font-medium" style={{ color: TEXT_MUTED_LUXE }}>Frais</th>
                    <th className="text-left py-3 px-2 font-medium" style={{ color: TEXT_MUTED_LUXE }}>Classe</th>
                    <th className="text-right py-3 px-2 font-medium" style={{ color: TEXT_MUTED_LUXE }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.filter(f => !selectedFeeClass || f.classId === selectedFeeClass).map(fee => (
                    <tr key={fee.id} className="border-b border-[oklch(92%_0.008_175)] last:border-0">
                      <td className="py-3 px-2 font-medium" style={{ color: TEXT_PRIMARY }}>{fee.name}</td>
                      <td className="py-3 px-2" style={{ color: TEXT_PRIMARY }}>{Number(fee.amount).toLocaleString()} {fee.currency || 'CDF'}</td>
                      <td className="py-3 px-2">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: GOLD_SOFT, color: GOLD }}>{fee.trimester === 'T1' ? 'Trimestre 1' : fee.trimester === 'T2' ? 'Trimestre 2' : fee.trimester === 'T3' ? 'Trimestre 3' : fee.trimester}</span>
                      </td>
                      <td className="py-3 px-2">
                        <button onClick={() => setSelectedFeeClass(selectedFeeClass === fee.classId ? null : fee.classId)} className="text-xs font-medium underline" style={{ color: ACCENT }}>
                          {classes.find(c => c.id === fee.classId)?.name || '—'}
                        </button>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setEditingFee(fee); setFeeForm({ name: fee.name, amount: String(fee.amount), currency: fee.currency || 'CDF', trimester: fee.trimester || 'T1', classId: fee.classId || '' }); setShowFeeModal(true) }}
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
            </>
          )}
        </div>
      )}

      {activeTab === 'personalization' && <PersonalizationView />}

      {activeTab === 'devices' && (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: GOLD_SOFT }}>
                <Monitor size={16} style={{ color: GOLD }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: TEXT_PRIMARY }}>Appareils connectés</h3>
                <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                  {sessions.length} session(s) active(s) · expire dans 24 h
                </p>
              </div>
            </div>
            {sessions.filter(s => !s.isCurrent).length > 0 && (
              <button
                onClick={handleRevokeAll}
                disabled={revokingAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition disabled:opacity-50"
                style={{ color: DANGER, borderColor: DANGER + '40' }}
              >
                {revokingAll ? <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <LogOut size={12} />}
                Tout déconnecter ({sessions.filter(s => !s.isCurrent).length})
              </button>
            )}
          </div>

          {loadingSessions ? (
            <div className="py-8 text-center">
              <div className="h-6 w-6 border-2 border-[oklch(72%_0.15_65)] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs mt-2" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Aucune session active</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <CurrentDeviceInfo />
              {sessions.map(s => {
                const info = detectDevice(s.userAgent)
                const DeviceIcon = info.isMobile ? Smartphone : info.isTablet ? Tablet : Monitor
                return (
                  <div
                    key={s.sid}
                    className="flex items-center gap-3 p-3 rounded-xl border transition"
                    style={{
                      borderColor: s.isCurrent ? GOLD + '60' : 'oklch(90% 0.01 175)',
                      background: s.isCurrent ? GOLD_SOFT + '40' : 'transparent',
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: s.isCurrent ? GOLD_SOFT : 'oklch(95% 0.01 175)' }}>
                      <DeviceIcon size={18} style={{ color: s.isCurrent ? GOLD : TEXT_MUTED_LUXE }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{formatDeviceTitle(info)}</span>
                        {s.fingerprintId && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1" style={{ color: GOLD, background: GOLD_SOFT }}>
                            <Fingerprint size={9} />{s.fingerprintId.slice(0, 8)}
                          </span>
                        )}
                        {s.isCurrent && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: GOLD, background: GOLD_SOFT }}>CET APPAREIL</span>
                        )}
                      </div>
                      <div className="text-xs flex items-center gap-1 flex-wrap" style={{ color: TEXT_MUTED_LUXE }}>
                        <span>{formatDeviceSummary(info)}</span>
                        {s.ip && !isLoopbackIp(s.ip) && <><span>·</span><span className="inline-flex items-center gap-0.5"><Globe size={10} />{s.ip}</span></>}
                        {s.location?.city && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5"><MapPin size={10} />{s.location.city}{s.location.country ? `, ${s.location.country}` : ''}</span>
                          </>
                        )}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>
                        {s.isCurrent ? 'Session actuelle' : `Dernière activité ${new Date(s.lastUsedAt).toLocaleString('fr-FR')}`}
                      </div>
                    </div>
                    {!s.isCurrent && (
                      <button
                        onClick={() => handleRevokeSession(s.sid)}
                        disabled={revokingSid === s.sid}
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-xl border transition disabled:opacity-50 hover:bg-red-50"
                        style={{ color: DANGER, borderColor: DANGER + '40' }}
                      >
                        {revokingSid === s.sid ? <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <LogOut size={12} />}
                        Déconnecter
                      </button>
                    )}
                  </div>
                )
              })}
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
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Montant *</label>
                <input type="number" value={feeForm.amount} onChange={e => setFeeForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Devise *</label>
                <AppSelect value={feeForm.currency} onChange={(val) => setFeeForm(f => ({ ...f, currency: val }))} options={[{ value: 'CDF', label: 'CDF (Franc congolais)' }, { value: 'USD', label: 'USD (Dollar américain)' }, { value: 'FCFA', label: 'FCFA (Franc CFA)' }]} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Frais *</label>
                <AppSelect value={feeForm.trimester} onChange={(val) => setFeeForm(f => ({ ...f, trimester: val }))} options={[{ value: 'T1', label: 'T1 - Trimestre 1' }, { value: 'T2', label: 'T2 - Trimestre 2' }, { value: 'T3', label: 'T3 - Trimestre 3' }]} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Classe *</label>
                <AppSelect value={feeForm.classId} onChange={(val) => setFeeForm(f => ({ ...f, classId: val }))} placeholder="Choisir une classe" options={[{ value: '', label: 'Choisir une classe' }, ...classes.map(c => ({ value: c.id, label: c.name }))]} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowFeeModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[oklch(90%_0.01_175)]" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
              <button
                onClick={async () => {
                  if (!feeForm.name || !feeForm.amount) { toast.error('Nom et montant requis'); return }
                  if (!feeForm.classId) { toast.error('Veuillez choisir une classe'); return }
                  const body = { name: feeForm.name, amount: Number(feeForm.amount), currency: feeForm.currency, trimester: feeForm.trimester, classId: feeForm.classId, schoolId: getActiveSchoolId() }
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