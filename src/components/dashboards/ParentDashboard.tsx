'use client'

import { useState, useEffect, useRef } from 'react'
import { useEduGestStore, authFetch, ViewType } from '@/lib/store'
import { toast } from 'sonner'
import type { StudentData } from '@/lib/types'
import { Users, Shield, PenTool, BookOpen, FileText, CreditCard, Edit, Check, Camera } from 'lucide-react'
import { ACCENT, GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, WARNING, DANGER, INFO } from '@/lib/constants'
import { getInitials } from '@/lib/helpers'
import StatCard from './StatCard'

export default function ParentDashboard() {
  const { userData, setCurrentView, setSelectedStudentId } = useEduGestStore()
  const [children, setChildren] = useState<StudentData[]>([])
  const [loading, setLoading] = useState(true)
  const [editingChild, setEditingChild] = useState<string | null>(null)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [savingChild, setSavingChild] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const childPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const [editingPhotoForChild, setEditingPhotoForChild] = useState<string | null>(null)
  const [pendingHomework, setPendingHomework] = useState(0)
  const [recentDisciplineCount, setRecentDisciplineCount] = useState(0)

  useEffect(() => {
    function fetchData() {
      if (userData?.id) {
        authFetch(`/api/students?parentId=${userData.id}&limit=20`)
          .then(r => r.json())
          .then(j => { setChildren(j.data || []); setLoading(false) })
          .catch(() => setLoading(false))
        authFetch(`/api/homework?parentId=${userData.id}&limit=100`)
          .then(r => r.json())
          .then(j => {
            const hw: { dueDate: string }[] = j.data || []
            const now = new Date()
            setPendingHomework(hw.filter(h => new Date(h.dueDate) > now).length)
          })
          .catch(() => {})
        authFetch(`/api/discipline?parentId=${userData.id}&limit=100`)
          .then(r => r.json())
          .then(j => setRecentDisciplineCount((j.data || []).length))
          .catch(() => {})
      } else {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [userData?.id])

  async function handleEditChild(child: StudentData) {
    setEditingChild(child.id)
    setEditFirstName(child.firstName)
    setEditLastName(child.lastName)
  }

  async function handleSaveChild() {
    if (!editingChild) return
    if (!editFirstName.trim() || !editLastName.trim()) {
      toast.error('Le prénom et le nom sont requis')
      return
    }
    setSavingChild(true)
    try {
      const res = await authFetch(`/api/students/${editingChild}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: editFirstName.trim(), lastName: editLastName.trim() }),
      })
      if (res.ok) {
        toast.success('Nom de l\'enfant mis à jour!')
        setChildren(prev => prev.map(c =>
          c.id === editingChild
            ? { ...c, firstName: editFirstName.trim(), lastName: editLastName.trim() }
            : c
        ))
        setEditingChild(null)
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

    setUploadingPhoto(true)
    setEditingPhotoForChild(childId)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'students')
      const uploadRes = await authFetch('/api/upload', { method: 'POST', body: formData })
      const uploadJson = await uploadRes.json()
      if (!uploadRes.ok) { toast.error(uploadJson.error || 'Erreur upload'); return }

      // Update student photoUrl
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
    finally { setUploadingPhoto(false); setEditingPhotoForChild(null) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Bonjour {userData?.name || 'Parent'}</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>Suivi scolaire de vos enfants</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <StatCard label="Mes enfants" value={String(children.length)} icon={<Users size={16} />} color={ACCENT} />
        <StatCard label="Avertissements" value={String(recentDisciplineCount)} icon={<Shield size={16} />} color={INFO} />
        <StatCard label="Devoirs à rendre" value={String(pendingHomework)} icon={<PenTool size={16} />} color={WARNING} />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-6 rounded-full" style={{ background: GOLD }} />
        <h3 className="text-lg font-semibold" style={{ color: TEXT_PRIMARY }}>Mes enfants</h3>
      </div>
      {loading ? (
        <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement de vos enfants...</div>
      ) : children.length === 0 ? (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-8 text-center shadow-sm">
          <Users size={32} className="mx-auto mb-3" style={{ color: TEXT_MUTED_LUXE }} />
          <p className="font-medium" style={{ color: TEXT_PRIMARY }}>Aucun enfant associé</p>
          <p className="text-sm mt-1" style={{ color: TEXT_MUTED_LUXE }}>Contactez l&apos;administration pour associer vos enfants à votre compte.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {children.map(child => {
            const fullName = `${child.firstName} ${child.lastName}`
            const initials = getInitials(fullName)
            const isEditing = editingChild === child.id
            return (
              <div key={child.id} className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm edu-card-lift">
                <div className="flex items-center gap-3 mb-4">
                  {/* Clickable child photo */}
                  <div className="relative group cursor-pointer" onClick={() => { setEditingPhotoForChild(child.id); childPhotoInputRef.current?.click() }}>
                    {child.photoUrl ? (
                      <img src={child.photoUrl} alt={fullName} className="w-14 h-14 rounded-full object-cover border-2 border-[oklch(90%_0.01_175)]" />
                    ) : (
                      <div className="w-14 h-14 rounded-full grid place-items-center text-white font-bold text-lg" style={{ background: `linear-gradient(135deg, ${ACCENT}, oklch(72% 0.15 65))` }}>
                        {initials}
                      </div>
                    )}
                    <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full grid place-items-center border-2 border-white shadow-sm transition group-hover:scale-110" style={{ background: GOLD }}>
                      {uploadingPhoto && editingPhotoForChild === child.id ? (
                        <div className="h-3 w-3 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Camera size={10} className="text-[oklch(15%_0.02_250)]" />
                      )}
                    </div>
                    <input
                      ref={editingPhotoForChild === child.id ? childPhotoInputRef : null}
                      type="file" accept="image/*" className="hidden"
                      onChange={e => handleChildPhotoUpload(e, child.id)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input value={editFirstName} onChange={e => setEditFirstName(e.target.value)} placeholder="Prénom" className="w-full px-2 py-1 border border-[oklch(90%_0.01_175)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
                        <input value={editLastName} onChange={e => setEditLastName(e.target.value)} placeholder="Nom" className="w-full px-2 py-1 border border-[oklch(90%_0.01_175)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
                        <div className="flex gap-2">
                          <button onClick={handleSaveChild} disabled={savingChild} className="edu-gold-cta px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                            {savingChild ? <div className="h-3 w-3 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={10} />}
                            Sauvegarder
                          </button>
                          <button onClick={() => setEditingChild(null)} className="px-3 py-1 rounded-lg text-xs font-medium border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)]" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-semibold" style={{ color: TEXT_PRIMARY }}>{fullName}</div>
                          <div className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Classe {child.class?.name || '—'} · {child.matricule}</div>
                        </div>
                        <button onClick={() => handleEditChild(child)} className="ml-auto w-7 h-7 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition shrink-0" style={{ color: TEXT_MUTED_LUXE }} title="Modifier le nom">
                          <Edit size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Notes', view: 'grades' as ViewType, icon: <BookOpen size={14} /> },
                    { label: 'Bulletin', view: 'bulletin' as ViewType, icon: <FileText size={14} /> },
                    { label: 'Paiements', view: 'payments' as ViewType, icon: <CreditCard size={14} /> },
                    { label: 'Discipline', view: 'discipline' as ViewType, icon: <Shield size={14} /> },
                  ].map(chip => (
                    <button key={chip.label} onClick={() => { setSelectedStudentId(child.id); setCurrentView(chip.view) }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-[oklch(90%_0.01_175)] hover:bg-[oklch(95%_0.04_175)] hover:border-[oklch(72%_0.15_65_/_0.3)] transition" style={{ color: TEXT_PRIMARY }}>
                      {chip.icon} {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-6 rounded-full" style={{ background: GOLD }} />
        <h3 className="text-lg font-semibold" style={{ color: TEXT_PRIMARY }}>Notifications récentes</h3>
      </div>
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl divide-y divide-[oklch(90%_0.01_175)] shadow-sm">
        {children.length > 0 && (pendingHomework > 0 || recentDisciplineCount > 0) ? [
          ...(pendingHomework > 0 ? [{ icon: <PenTool size={16} style={{ color: WARNING }} />, text: `${pendingHomework} devoir${pendingHomework > 1 ? 's' : ''} à rendre`, time: 'En cours' }] : []),
          ...(recentDisciplineCount > 0 ? [{ icon: <Shield size={16} style={{ color: DANGER }} />, text: `${recentDisciplineCount} avertissement${recentDisciplineCount > 1 ? 's' : ''} disciplinaire${recentDisciplineCount > 1 ? 's' : ''}`, time: 'Cette année' }] : []),
        ].map((n, i) => (
          <div key={i} className="flex items-start gap-3 p-4 hover:bg-[oklch(97%_0.005_175)] transition">
            <div className="w-8 h-8 rounded-full bg-[oklch(95%_0.04_175)] grid place-items-center shrink-0">{n.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm" style={{ color: TEXT_PRIMARY }}>{n.text}</div>
              <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>{n.time}</div>
            </div>
            {i === 0 && <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: GOLD }} />}
          </div>
        )) : (
          <div className="p-6 text-center" style={{ color: TEXT_MUTED_LUXE }}>Aucune notification</div>
        )}
      </div>
    </div>
  )
}
