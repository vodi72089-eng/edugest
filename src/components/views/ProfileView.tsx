'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import type { StudentData } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, GOLD_SOFT, SUCCESS, DANGER } from '@/lib/constants'
import { getInitials, getRoleLabel } from '@/lib/helpers'
import StudentAvatar from '@/components/ui/StudentAvatar'
import { Edit, Check, Camera, Lock, Phone, Monitor, LogOut, Shield, Building2, Smartphone, Globe, Tablet, Fingerprint, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { detectDevice, formatDeviceTitle, formatDeviceSummary } from '@/lib/detect-device'

// ─── Types ─────────────────────────────────────────────────────────────────
interface SessionItem {
  sid: string
  createdAt: number
  lastUsedAt: number
  expiresAt: number
  userAgent: string
  ip: string
  isCurrent: boolean
  fingerprintId?: string
  location?: { city: string; region: string; country: string; isp: string; lat: number; lon: number } | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatRelativeTime(ts: number): string {
  if (!ts) return '—'
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'à l\'instant'
  const min = Math.floor(sec / 60)
  if (min < 60) return `il y a ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `il y a ${hr} h`
  const days = Math.floor(hr / 24)
  if (days < 30) return `il y a ${days} j`
  return new Date(ts).toLocaleDateString('fr-FR')
}

function formatDateTime(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Main component ────────────────────────────────────────────────────────
export default function ProfileView() {
  const { userData, setUserData, userRole, setCurrentView } = useEduGestStore()
  const [name, setName] = useState(userData?.name || '')
  const [phone, setPhone] = useState('')
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(userData?.profileImageUrl || null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isParent = userRole === 'PARENT'
  const canManageSchool = userRole === 'SUPER_ADMIN_GLOBAL' || userRole === 'SECRETARY'

  // ── Password change state ──
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [showPw, setShowPw] = useState(false)

  // ── Phone save state ──
  const [savingPhone, setSavingPhone] = useState(false)

  // ── Sessions state ──
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [revokingSid, setRevokingSid] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)

  // ── Children (PARENT only) ──
  const [children, setChildren] = useState<StudentData[]>([])
  const [editingChildId, setEditingChildId] = useState<string | null>(null)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [savingChild, setSavingChild] = useState(false)
  const [uploadingChildPhoto, setUploadingChildPhoto] = useState(false)
  const [editingPhotoChildId, setEditingPhotoChildId] = useState<string | null>(null)
  const [photoTargetChildId, setPhotoTargetChildId] = useState<string | null>(null)
  const childFileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Fetch current phone + sessions on mount ──
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const res = await authFetch('/api/sessions')
      const j = await res.json()
      if (res.ok) setSessions(j.data || [])
    } catch { /* ignore */ }
    finally { setLoadingSessions(false) }
  }, [])

  useEffect(() => {
    // Fetch the user's current phone from the profile API (we don't store it in userData)
    authFetch('/api/profile')
      .then(r => r.json())
      .then(j => {
        if (j.data?.phone) setPhone(j.data.phone)
      })
      .catch(() => {})
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    if (userData?.profileImageUrl) {
      setProfileImageUrl(userData.profileImageUrl)
    }
  }, [userData?.profileImageUrl])

  useEffect(() => {
    if (isParent && userData?.id) {
      authFetch(`/api/students?parentId=${userData.id}&limit=20`)
        .then(r => r.json())
        .then(j => setChildren(j.data || []))
        .catch(() => {})
    }
  }, [isParent, userData?.id])

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Veuillez sélectionner une image'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('L\'image ne doit pas dépasser 5MB'); return }

    if (!userData?.id) { toast.error('Session invalide. Veuillez vous reconnecter.'); return }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'profiles')
      const res = await authFetch('/api/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (res.ok) {
        const photoUrl = json.url
        const updateRes = await authFetch('/api/users/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileImageUrl: photoUrl }),
        })
        if (!updateRes.ok) {
          const errJson = await updateRes.json().catch(() => ({}))
          toast.error(errJson.error || 'Erreur lors de la sauvegarde de la photo')
          return
        }
        setProfileImageUrl(photoUrl)
        setUserData({ ...userData, profileImageUrl: photoUrl })
        toast.success('Photo de profil mise à jour!')
      } else {
        toast.error(json.error || 'Erreur lors de l\'upload')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setUploading(false) }
  }

  async function handleSaveName() {
    if (!userData?.id) { toast.error('Session invalide.'); return }
    if (!name.trim()) { toast.error('Le nom ne peut pas être vide'); return }
    setSaving(true)
    try {
      const res = await authFetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const text = await res.text()
      let json: Record<string, unknown> = {}
      try { json = JSON.parse(text) } catch { /* not json */ }
      if (res.ok) {
        setUserData({ ...userData, name: name.trim(), initials: getInitials(name.trim()) })
        toast.success('Nom sauvegardé avec succès!')
      } else {
        toast.error((json.error as string) || 'Erreur lors de la sauvegarde')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSaving(false) }
  }

  async function handleSavePhone() {
    if (!userData?.id) { toast.error('Session invalide.'); return }
    const trimmed = phone.trim()
    if (!trimmed) { toast.error('Le numéro ne peut pas être vide'); return }
    const digits = trimmed.replace(/[^0-9]/g, '')
    if (digits.length < 7 || digits.length > 15) { toast.error('Numéro de téléphone invalide'); return }

    setSavingPhone(true)
    try {
      const res = await authFetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: trimmed }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Numéro de téléphone mis à jour!')
      } else {
        toast.error(j.error || 'Erreur lors de la mise à jour')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSavingPhone(false) }
  }

  async function handleChangePassword() {
    if (!userData?.id) { toast.error('Session invalide.'); return }
    if (!currentPw || !newPw || !confirmPw) { toast.error('Tous les champs sont requis'); return }
    if (newPw.length < 6) { toast.error('Le nouveau mot de passe doit contenir au moins 6 caractères'); return }
    if (newPw !== confirmPw) { toast.error('Les mots de passe ne correspondent pas'); return }
    if (newPw === currentPw) { toast.error('Le nouveau mot de passe doit être différent'); return }

    setSavingPw(true)
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(j.message || 'Mot de passe modifié. Autres appareils déconnectés.')
        setCurrentPw(''); setNewPw(''); setConfirmPw('')
        // Refresh sessions list (other sessions should now be gone)
        fetchSessions()
      } else {
        toast.error(j.error || 'Erreur lors du changement de mot de passe')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSavingPw(false) }
  }

  async function handleRevokeSession(sid: string) {
    setRevokingSid(sid)
    try {
      const res = await authFetch('/api/sessions/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(j.message || 'Appareil déconnecté')
        setSessions(prev => prev.filter(s => s.sid !== sid))
      } else {
        toast.error(j.error || 'Erreur lors de la déconnexion')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setRevokingSid(null) }
  }

  async function handleRevokeAll() {
    setRevokingAll(true)
    try {
      const res = await authFetch('/api/sessions/revoke-all', { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(j.message || 'Autres appareils déconnectés')
        fetchSessions()
      } else {
        toast.error(j.error || 'Erreur')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setRevokingAll(false) }
  }

  async function handleSaveChild() {
    if (!editingChildId) return
    if (!editFirstName.trim() || !editLastName.trim()) { toast.error('Le prénom et le nom sont requis'); return }
    setSavingChild(true)
    try {
      const res = await authFetch(`/api/students/${editingChildId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: editFirstName.trim(), lastName: editLastName.trim() }),
      })
      if (res.ok) {
        toast.success('Nom de l\'enfant mis à jour!')
        setChildren(prev => prev.map(c =>
          c.id === editingChildId
            ? { ...c, firstName: editFirstName.trim(), lastName: editLastName.trim() }
            : c
        ))
        setEditingChildId(null)
      } else {
        toast.error('Erreur lors de la mise à jour')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSavingChild(false) }
  }

  async function handleChildPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const childId = photoTargetChildId
    setPhotoTargetChildId(null)
    if (!file || !childId) return
    if (!file.type.startsWith('image/')) { toast.error('Veuillez sélectionner une image'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('L\'image ne doit pas dépasser 5MB'); return }

    setUploadingChildPhoto(true)
    setEditingPhotoChildId(childId)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'students')
      const uploadRes = await authFetch('/api/upload', { method: 'POST', body: formData })
      const uploadJson = await uploadRes.json()
      if (!uploadRes.ok) { toast.error(uploadJson.error || 'Erreur upload'); return }

      const updateRes = await authFetch(`/api/students/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrl: uploadJson.url }),
      })
      if (updateRes.ok) {
        toast.success('Photo de l\'enfant mise à jour!')
        setChildren(prev => prev.map(c =>
          c.id === childId ? { ...c, photoUrl: uploadJson.url } : c
        ))
      } else {
        toast.error('Erreur lors de la mise à jour de la photo')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setUploadingChildPhoto(false); setEditingPhotoChildId(null) }
  }

  const otherSessions = sessions.filter(s => !s.isCurrent)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Mon profil</h1>
      </div>

      {/* ── Profile card (photo + name) ───────────────────────────────────── */}
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
        <div className="h-28 relative" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
          <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at top right, oklch(72% 0.15 65 / 0.3), transparent 60%)' }} />
        </div>
        <div className="px-6 pb-6 -mt-12">
          <div className="relative inline-block cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
            {profileImageUrl ? (
              <img src={profileImageUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-lg" />
            ) : (
              <div className="w-20 h-20 rounded-full grid place-items-center text-white font-bold text-2xl border-4 border-white shadow-lg group-hover:opacity-80 transition" style={{ background: `linear-gradient(135deg, oklch(55% 0.15 175), oklch(72% 0.15 65))` }}>
                {userData?.initials || '??'}
              </div>
            )}
            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full grid place-items-center border-2 border-white shadow-sm transition group-hover:scale-110" style={{ background: GOLD }}>
              {uploading ? <div className="h-3 w-3 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Edit size={12} className="text-[oklch(15%_0.02_250)]" />}
            </div>
            <input
              ref={fileInputRef}
              type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>{userData?.name || 'Utilisateur'}</div>
            <div className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>{getRoleLabel(userData?.role || 'SECRETARY')}</div>
          </div>
          <div className="space-y-3 mt-5">
            <div>
              <label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Nom complet</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" />
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>École</label>
              <input defaultValue={userData?.schoolName} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none bg-[oklch(97%_0.005_175)]" disabled />
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Rôle</label>
              <input defaultValue={getRoleLabel(userData?.role || 'SECRETARY')} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none bg-[oklch(97%_0.005_175)]" disabled />
            </div>
          </div>
          <button onClick={handleSaveName} disabled={saving} className="edu-gold-cta mt-5 px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
            Sauvegarder le nom
          </button>

          {/* Admin shortcut to school settings */}
          {canManageSchool && (
            <div className="mt-4 pt-4 border-t border-[oklch(90%_0.01_175)]">
              <button
                onClick={() => setCurrentView('settings')}
                className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition"
                style={{ color: TEXT_PRIMARY }}
              >
                <Building2 size={14} style={{ color: GOLD }} />
                Paramètres de l&apos;école
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Coordonnées (phone) ───────────────────────────────────────────── */}
      <div className="mt-6 bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: GOLD_SOFT }}>
            <Phone size={16} style={{ color: GOLD }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: TEXT_PRIMARY }}>Numéro de téléphone</h3>
            <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Utilisé pour la connexion WhatsApp et les notifications</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+243 970 000 000"
            className="flex-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]"
          />
          <button onClick={handleSavePhone} disabled={savingPhone} className="edu-gold-cta px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap">
            {savingPhone ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
            Mettre à jour
          </button>
        </div>
      </div>

      {/* ── Sécurité (password) ───────────────────────────────────────────── */}
      <div className="mt-6 bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: GOLD_SOFT }}>
            <Lock size={16} style={{ color: GOLD }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: TEXT_PRIMARY }}>Mot de passe</h3>
            <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Après le changement, les autres appareils seront déconnectés</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Mot de passe actuel</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              autoComplete="current-password"
              className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
            />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Nouveau mot de passe</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              autoComplete="new-password"
              className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
            />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Confirmer le nouveau mot de passe</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              autoComplete="new-password"
              className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
            />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: TEXT_MUTED_LUXE }}>
              <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} className="rounded" />
              Afficher les mots de passe
            </label>
            <button onClick={handleChangePassword} disabled={savingPw} className="edu-gold-cta px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
              {savingPw ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Shield size={14} />}
              Changer le mot de passe
            </button>
          </div>
        </div>
      </div>

      {/* ── Appareils connectés ───────────────────────────────────────────── */}
      <div className="mt-6 bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
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
          {otherSessions.length > 0 && (
            <button
              onClick={handleRevokeAll}
              disabled={revokingAll}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition disabled:opacity-50"
              style={{ color: DANGER, borderColor: DANGER + '40' }}
            >
              {revokingAll ? <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <LogOut size={12} />}
              Tout déconnecter ({otherSessions.length})
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
                    <div className="text-xs flex items-center gap-2 flex-wrap" style={{ color: TEXT_MUTED_LUXE }}>
                      <span>{formatDeviceSummary(info)}</span>
                      {s.ip && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-0.5"><Globe size={10} />{s.ip}</span>
                        </>
                      )}
                      {s.location?.city && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-0.5"><MapPin size={10} />{s.location.city}{s.location.country ? `, ${s.location.country}` : ''}</span>
                        </>
                      )}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>
                      {s.isCurrent
                        ? `Dernière activité ${formatRelativeTime(s.lastUsedAt)}`
                        : `Dernière activité ${formatRelativeTime(s.lastUsedAt)} · créée ${formatDateTime(s.createdAt)}`
                      }
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <button
                      onClick={() => handleRevokeSession(s.sid)}
                      disabled={revokingSid === s.sid}
                      className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-xl border transition disabled:opacity-50 hover:bg-red-50"
                      style={{ color: DANGER, borderColor: DANGER + '40' }}
                      title="Déconnecter cet appareil"
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

      {/* ── Children (PARENT only) ────────────────────────────────────────── */}
      {isParent && children.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-6 rounded-full" style={{ background: GOLD }} />
            <h3 className="text-lg font-semibold" style={{ color: TEXT_PRIMARY }}>Mes enfants</h3>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: GOLD, background: GOLD_SOFT }}>{children.length}</span>
          </div>
          <div className="space-y-4">
            {children.map(child => {
              const isEditing = editingChildId === child.id
              return (
                <div key={child.id} className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="relative group cursor-pointer shrink-0" onClick={() => { setPhotoTargetChildId(child.id); setEditingPhotoChildId(child.id); setTimeout(() => childFileInputRef.current?.click(), 50) }}>
                      <StudentAvatar firstName={child.firstName} lastName={child.lastName} photoUrl={child.photoUrl} size={56} className="border-2" style={{ borderColor: ACCENT, background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
                      <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full grid place-items-center border-2 border-white shadow-sm transition group-hover:scale-110" style={{ background: GOLD }}>
                        {uploadingChildPhoto && editingPhotoChildId === child.id ? (
                          <div className="h-3 w-3 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Camera size={10} className="text-[oklch(15%_0.02_250)]" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Prénom</label>
                            <input value={editFirstName} onChange={e => setEditFirstName(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
                          </div>
                          <div>
                            <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Nom</label>
                            <input value={editLastName} onChange={e => setEditLastName(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={handleSaveChild} disabled={savingChild} className="edu-gold-cta px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                              {savingChild ? <div className="h-3 w-3 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={12} />}
                              Sauvegarder
                            </button>
                            <button onClick={() => setEditingChildId(null)} className="px-4 py-2 rounded-xl text-xs font-medium border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)]" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold" style={{ color: TEXT_PRIMARY }}>{child.firstName} {child.lastName}</div>
                            <div className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Classe {child.class?.name || '—'} · {child.matricule}</div>
                          </div>
                          <button onClick={() => { setEditingChildId(child.id); setEditFirstName(child.firstName); setEditLastName(child.lastName) }} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: TEXT_MUTED_LUXE }} title="Modifier le nom">
                            <Edit size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* SINGLE shared hidden file input — outside the .map() to avoid the shared-ref bug */}
      <input
        ref={childFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChildPhotoUpload}
      />
    </div>
  )
}
