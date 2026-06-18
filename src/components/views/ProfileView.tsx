'use client'

import { useState, useEffect, useRef } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import type { StudentData } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, GOLD_SOFT } from '@/lib/constants'
import { getInitials, getRoleLabel } from '@/lib/helpers'
import { Edit, Check, Camera } from 'lucide-react'
import { toast } from 'sonner'

export default function ProfileView() {
  const { userData, setUserData, userRole } = useEduGestStore()
  const [name, setName] = useState(userData?.name || '')
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(userData?.profileImageUrl || null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isParent = userRole === 'PARENT'

  const [children, setChildren] = useState<StudentData[]>([])
  const [editingChildId, setEditingChildId] = useState<string | null>(null)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [savingChild, setSavingChild] = useState(false)
  const [uploadingChildPhoto, setUploadingChildPhoto] = useState(false)
  const [editingPhotoChildId, setEditingPhotoChildId] = useState<string | null>(null)
  const childFileInputRef = useRef<HTMLInputElement | null>(null)

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

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Veuillez sélectionner une image'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('L\'image ne doit pas dépasser 5MB'); return }

    if (!userData?.id) {
      toast.error('Session invalide. Veuillez vous reconnecter.')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'profiles')
      const res = await authFetch('/api/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (res.ok) {
        const photoUrl = json.url
        setProfileImageUrl(photoUrl)
        await authFetch('/api/users/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileImageUrl: photoUrl }),
        })
        setUserData({ ...userData, profileImageUrl: photoUrl })
        toast.success('Photo de profil mise à jour!')
      } else {
        toast.error(json.error || 'Erreur lors de l\'upload')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setUploading(false) }
  }

  async function handleSave() {
    if (!userData?.id) {
      toast.error('Session invalide. Veuillez vous reconnecter.')
      return
    }

    if (!name.trim()) {
      toast.error('Le nom ne peut pas être vide')
      return
    }

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
        setUserData({
          ...userData,
          name: name.trim(),
          initials: getInitials(name.trim()),
        })
        toast.success('Profil sauvegardé avec succès!')
      } else {
        toast.error((json.error as string) || 'Erreur lors de la sauvegarde')
      }
    } catch (e) { console.error('Profile save error:', e); toast.error('Erreur réseau') }
    finally { setSaving(false) }
  }

  async function handleSaveChild() {
    if (!editingChildId) return
    if (!editFirstName.trim() || !editLastName.trim()) {
      toast.error('Le prénom et le nom sont requis')
      return
    }
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

  async function handleChildPhotoUpload(e: React.ChangeEvent<HTMLInputElement>, childId: string) {
    const file = e.target.files?.[0]
    if (!file) return
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

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Mon profil</h1>
      </div>
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl max-w-lg overflow-hidden shadow-sm">
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
          <button onClick={handleSave} disabled={saving} className="edu-gold-cta mt-5 px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
            Sauvegarder
          </button>
        </div>
      </div>

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
                    <div className="relative group cursor-pointer shrink-0" onClick={() => { setEditingPhotoChildId(child.id); childFileInputRef.current?.click() }}>
                      {child.photoUrl ? (
                        <img src={child.photoUrl} alt={`${child.firstName} ${child.lastName}`} className="w-16 h-16 rounded-full object-cover border-2 border-[oklch(90%_0.01_175)]" />
                      ) : (
                        <div className="w-16 h-16 rounded-full grid place-items-center text-white font-bold text-lg" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                          {getInitials(`${child.firstName} ${child.lastName}`)}
                        </div>
                      )}
                      <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full grid place-items-center border-2 border-white shadow-sm transition group-hover:scale-110" style={{ background: GOLD }}>
                        {uploadingChildPhoto && editingPhotoChildId === child.id ? (
                          <div className="h-3 w-3 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Camera size={10} className="text-[oklch(15%_0.02_250)]" />
                        )}
                      </div>
                      <input
                        ref={editingPhotoChildId === child.id ? childFileInputRef : null}
                        type="file" accept="image/*" className="hidden"
                        onChange={e => handleChildPhotoUpload(e, child.id)}
                      />
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
    </div>
  )
}
