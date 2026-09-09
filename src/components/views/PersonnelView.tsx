'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY, GOLD_SOFT, DANGER, SUCCESS, MUTED } from '@/lib/constants'
import { getInitials, formatDate, formatNumber, getRoleLabel } from '@/lib/helpers'
import type { UserRole } from '@/lib/types'
import { UserPlus, Edit, Ban, CheckCircle, Eye, EyeOff, X, UsersRound, Award, Check } from 'lucide-react'
import { toast } from 'sonner'
import SearchAutocomplete, { AutocompleteItem } from './SearchAutocomplete'

export default function PersonnelView() {
  const { userData } = useEduGestStore()
  const [users, setUsers] = useState<Array<{
    id: string; name: string; email: string | null; phone: string;
    role: string; isActive: boolean; profileImageUrl: string | null;
    lastLoginAt: string | null; createdAt: string; schoolId: string;
    subjectName?: string | null; classNames?: string | null; isTitulaire?: boolean;
  }>>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPersonnelPassword, setShowPersonnelPassword] = useState(false)
  const [editingUser, setEditingUser] = useState<typeof users[0] | null>(null)
  const [search, setSearch] = useState('')
  const [personnelSearch, setPersonnelSearch] = useState('')
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string | null>(null)
  const [personnelSuggestions, setPersonnelSuggestions] = useState<AutocompleteItem[]>([])
  const [personnelSearchLoading, setPersonnelSearchLoading] = useState(false)
  const [roleFilter, setRoleFilter] = useState('')
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', role: 'SECRETARY',
    subjectName: '', classNames: '', isTitulaire: false,
  })
  const [availableClasses, setAvailableClasses] = useState<{ id: string; name: string; _count?: { students: number } }[]>([])
  const [showAssignmentModal, setShowAssignmentModal] = useState(false)
  const [assignmentTeacher, setAssignmentTeacher] = useState<{ id: string; name: string } | null>(null)
  const [assignments, setAssignments] = useState<{ id: string; class: { id: string; name: string }; subject: { id: string; name: string } }[]>([])
  const [assignClassId, setAssignClassId] = useState('')
  const [assignSubjectId, setAssignSubjectId] = useState('')
  const [assignSubjects, setAssignSubjects] = useState<{ id: string; name: string; coefficient: number }[]>([])
  const [assignLoading, setAssignLoading] = useState(false)

  const isTeacherForm = form.role === 'TEACHER' || form.role === 'HEAD_TEACHER'

  function openAssignmentModal(teacher: { id: string; name: string }) {
    setAssignmentTeacher(teacher)
    setShowAssignmentModal(true)
    setAssignClassId('')
    setAssignSubjectId('')
    authFetch(`/api/teacher-assignments?teacherId=${teacher.id}`).then(r => r.json()).then(j => setAssignments(j.data || [])).catch(() => {})
  }

  useEffect(() => {
    if (assignClassId && userData?.schoolId) {
      authFetch(`/api/subjects?classId=${assignClassId}&limit=20`).then(r => r.json()).then(j => { setAssignSubjects(j.data || []); setAssignSubjectId('') }).catch(() => {})
    }
  }, [assignClassId, userData?.schoolId])

  async function handleAddAssignment() {
    if (!assignmentTeacher || !assignClassId || !assignSubjectId) return
    setAssignLoading(true)
    try {
      const res = await authFetch('/api/teacher-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: assignmentTeacher.id, classId: assignClassId, subjectId: assignSubjectId })
      })
      if (res.ok) {
        const j = await res.json()
        setAssignments(prev => [...prev, j.data])
        setAssignClassId(''); setAssignSubjectId('')
        toast.success('Assignation ajoutée')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Erreur')
      }
    } catch { toast.error('Erreur de connexion') }
    setAssignLoading(false)
  }

  async function handleRemoveAssignment(id: string) {
    try {
      const res = await authFetch('/api/teacher-assignments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (res.ok) { setAssignments(prev => prev.filter(a => a.id !== id)); toast.success('Assignation supprimée') }
    } catch { toast.error('Erreur') }
  }

  useEffect(() => {
    if ((showAddModal || editingUser) && isTeacherForm && userData?.schoolId) {
      authFetch(`/api/classes?limit=50&schoolId=${userData.schoolId}`).then(r => r.json()).then(j => setAvailableClasses(j.data || [])).catch(() => {})
    }
  }, [showAddModal, editingUser, isTeacherForm, userData?.schoolId])

  const ROLES = [
    { value: 'SECRETARY', label: 'Secrétaire', color: 'oklch(60% 0.13 250)' },
    { value: 'CASHIER', label: 'Caissier', color: 'oklch(72% 0.15 65)' },
    { value: 'TEACHER', label: 'Enseignant', color: 'oklch(60% 0.15 145)' },
    { value: 'HEAD_TEACHER', label: 'Prof. Principal', color: 'oklch(55% 0.15 175)' },
    { value: 'DIRECTION_MATERNELLE', label: 'Dir. Maternelle', color: 'oklch(60% 0.13 280)' },
    { value: 'DIRECTION_PRIMAIRE', label: 'Dir. Primaire', color: 'oklch(55% 0.15 175)' },
    { value: 'DIRECTION_SECONDAIRE', label: 'Dir. Secondaire', color: 'oklch(45% 0.13 200)' },
    { value: 'DISCIPLINE_MATERNELLE', label: 'Disc. Maternelle', color: 'oklch(58% 0.20 25)' },
    { value: 'DISCIPLINE_PRIMAIRE', label: 'Disc. Primaire', color: 'oklch(58% 0.18 30)' },
    { value: 'DISCIPLINE_SECONDAIRE', label: 'Disc. Secondaire', color: 'oklch(50% 0.16 0)' },
    { value: 'PARENT', label: 'Parent', color: 'oklch(52% 0.015 250)' },
  ]

  function loadUsers() {
    setLoading(true)
    const params = new URLSearchParams({ schoolId: userData?.schoolId || '', limit: '50' })
    if (roleFilter) params.set('role', roleFilter)
    if (search) params.set('search', search)
    authFetch(`/api/users?${params}`).then(r => r.json()).then(j => { setUsers(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { loadUsers() }, [roleFilter, userData?.schoolId])

  // Personnel search autocomplete
  useEffect(() => {
    if (personnelSearch.length < 2) return
    const timer = setTimeout(() => {
      setPersonnelSearchLoading(true)
      const params = new URLSearchParams({ schoolId: userData?.schoolId || '', limit: '8' })
      if (roleFilter) params.set('role', roleFilter)
      params.set('search', personnelSearch)
      authFetch(`/api/users?${params}`)
        .then(r => r.json())
        .then(j => {
          setPersonnelSuggestions((j.data || []).map((u: typeof users[0]) => ({
            id: u.id, label: u.name, sublabel: u.email || u.phone || ''
          })))
          setPersonnelSearchLoading(false)
        })
        .catch(() => setPersonnelSearchLoading(false))
    }, 300)
    return () => { clearTimeout(timer); setPersonnelSearchLoading(false) }
  }, [personnelSearch, roleFilter, userData?.schoolId])

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.role) {
      toast.error('Veuillez remplir le nom et le rôle')
      return
    }
    if (!form.email && !form.phone) {
      toast.error('Veuillez fournir un email ou un téléphone')
      return
    }
    setSaving(true)
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          schoolId: userData?.schoolId,
          subjectName: isTeacherForm ? form.subjectName : undefined,
          classNames: isTeacherForm ? form.classNames : undefined,
          isTitulaire: isTeacherForm ? form.isTitulaire : undefined,
        }),
      })
      if (res.ok) {
        toast.success(`${getRoleLabel(form.role as UserRole)} cré avec succès !`)
        setShowAddModal(false)
        setForm({ name: '', email: '', phone: '', password: '', role: 'SECRETARY', subjectName: '', classNames: '', isTitulaire: false })
        loadUsers()
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur lors de la création')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault()
    if (!editingUser) return
    setSaving(true)
    try {
      const res = await authFetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUser.id,
          name: form.name,
          email: form.email || null,
          phone: form.phone,
          role: form.role,
          password: form.password || undefined,
          subjectName: isTeacherForm ? form.subjectName : undefined,
          classNames: isTeacherForm ? form.classNames : undefined,
          isTitulaire: isTeacherForm ? form.isTitulaire : undefined,
        }),
      })
      if (res.ok) {
        toast.success('Utilisateur modifié avec succès !')
        setEditingUser(null)
        setForm({ name: '', email: '', phone: '', password: '', role: 'SECRETARY', subjectName: '', classNames: '', isTitulaire: false })
        loadUsers()
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur lors de la modification')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(user: typeof users[0]) {
    try {
      const res = await authFetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, isActive: !user.isActive }),
      })
      if (res.ok) {
        toast.success(user.isActive ? 'Compte désactivé' : 'Compte réactivé')
        loadUsers()
      }
    } catch {
      toast.error('Erreur réseau')
    }
  }

  function openEditModal(user: typeof users[0]) {
    setEditingUser(user)
    setForm({
      name: user.name,
      email: user.email || '',
      phone: user.phone,
      password: '',
      role: user.role,
      subjectName: user.subjectName || '',
      classNames: user.classNames || '',
      isTitulaire: user.isTitulaire || false,
    })
  }

  function closeModal() {
    setShowAddModal(false)
    setEditingUser(null)
    setForm({ name: '', email: '', phone: '', password: '', role: 'SECRETARY', subjectName: '', classNames: '', isTitulaire: false })
  }

  const activeUsers = users.filter(u => u.isActive)
  const inactiveUsers = users.filter(u => !u.isActive)
  const roleCounts = ROLES.map(r => ({
    ...r,
    count: users.filter(u => u.role === r.value && u.isActive).length,
  }))

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Personnel</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>
            {formatNumber(activeUsers.length)} membres actifs · {formatNumber(inactiveUsers.length)} inactifs
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="edu-gold-cta inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold">
          <UserPlus size={14} /> Ajouter un membre
        </button>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
        {roleCounts.map(r => (
          <button
            key={r.value}
            onClick={() => setRoleFilter(roleFilter === r.value ? '' : r.value)}
            className={`p-3 rounded-xl border text-left transition ${roleFilter === r.value ? 'border-[oklch(72%_0.15_65)] shadow-md' : 'border-[oklch(90%_0.01_175)] hover:border-[oklch(80%_0.02_175)]'}`}
            style={{ background: roleFilter === r.value ? GOLD_SOFT : 'white' }}
          >
            <div className="text-2xl font-bold" style={{ color: r.color }}>{r.count}</div>
            <div className="text-[11px] font-medium truncate" style={{ color: TEXT_MUTED_LUXE }}>{r.label}</div>
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 mb-4">
        <SearchAutocomplete
          placeholder="Rechercher par nom, email, téléphone..."
          items={personnelSuggestions}
          selectedId={selectedPersonnelId}
          onSelect={(item) => { setSelectedPersonnelId(item.id); setSearch(item.label); setTimeout(() => loadUsers(), 0) }}
          onClear={() => { setSelectedPersonnelId(null); setSearch(''); setPersonnelSearch(''); setTimeout(() => loadUsers(), 0) }}
          searchQuery={personnelSearch}
          onSearchChange={setPersonnelSearch}
          loading={personnelSearchLoading}
          itemTypeName="membre"
          className="flex-1"
        />
      </div>

      {/* Users table */}
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="h-8 w-8 border-3 border-[oklch(90%_0.01_175)] border-t-[oklch(72%_0.15_65)] rounded-full animate-spin mx-auto" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <UsersRound size={48} className="mx-auto mb-3" style={{ color: MUTED }} />
            <p className="font-medium" style={{ color: TEXT_PRIMARY }}>Aucun membre du personnel</p>
            <p className="text-sm mt-1" style={{ color: TEXT_MUTED_LUXE }}>Ajoutez votre premier membre en cliquant sur le bouton ci-dessus</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[oklch(90%_0.01_175)]" style={{ background: IVORY }}>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Membre</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Contact</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Rôle</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Statut</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Dernière connexion</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const roleInfo = ROLES.find(r => r.value === user.role)
                  return (
                    <tr key={user.id} className="border-b border-[oklch(94%_0.005_250)] hover:bg-[oklch(99%_0.003_175)] transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold text-white shrink-0" style={{ background: roleInfo?.color || ACCENT }}>
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{user.name}</div>
                            <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>Cré le {formatDate(user.createdAt)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm" style={{ color: TEXT_PRIMARY }}>{user.email || '—'}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{user.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold text-white" style={{ background: roleInfo?.color || ACCENT }}>
                          {roleInfo?.label || user.role}
                        </span>
                        {(user.role === 'TEACHER' || user.role === 'HEAD_TEACHER') && user.subjectName && (
                          <div className="mt-1 text-[10px]" style={{ color: TEXT_MUTED_LUXE }}>
                            {user.subjectName}
                            {user.isTitulaire && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: GOLD_SOFT, color: GOLD }}>Titulaire</span>}
                          </div>
                        )}
                        {(user.role === 'TEACHER' || user.role === 'HEAD_TEACHER') && user.classNames && (
                          <div className="text-[10px]" style={{ color: TEXT_MUTED_LUXE }}>
                            Classes: {user.classNames}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleActive(user)} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer transition ${user.isActive ? 'bg-[oklch(94%_0.05_145)] text-[oklch(40%_0.13_145)]' : 'bg-[oklch(94%_0.05_25)] text-[oklch(45%_0.18_25)]'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-[oklch(55%_0.15_145)]' : 'bg-[oklch(55%_0.18_25)]'}`} />
                          {user.isActive ? 'Actif' : 'Inactif'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: TEXT_MUTED_LUXE }}>
                        {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Jamais'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditModal(user)} className="p-2 rounded-lg hover:bg-[oklch(95%_0.04_175)] transition" title="Modifier">
                            <Edit size={14} style={{ color: TEXT_MUTED_LUXE }} />
                          </button>
                          <button onClick={() => handleToggleActive(user)} className="p-2 rounded-lg hover:bg-[oklch(95%_0.04_175)] transition" title={user.isActive ? 'Désactiver' : 'Réactiver'}>
                            {user.isActive ? <Ban size={14} style={{ color: DANGER }} /> : <CheckCircle size={14} style={{ color: SUCCESS }} />}
                          </button>
                          {(user.role === 'TEACHER' || user.role === 'HEAD_TEACHER') && (
                            <button onClick={() => openAssignmentModal({ id: user.id, name: user.name })} className="p-2 rounded-lg hover:bg-[oklch(95%_0.04_175)] transition" title="Assigner classes/matières">
                              <Award size={14} style={{ color: GOLD }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit User Modal */}
      {(showAddModal || editingUser) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-[oklch(90%_0.01_175)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                  <UserPlus size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>
                    {editingUser ? 'Modifier le membre' : 'Ajouter un membre'}
                  </h2>
                  <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                    {editingUser ? 'Modifier les informations du membre' : 'Créer un nouveau compte personnel'}
                  </p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 rounded-lg hover:bg-[oklch(95%_0.04_175)] transition"><X size={18} /></button>
            </div>
            <form onSubmit={editingUser ? handleEditUser : handleAddUser} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Nom complet *</label>
                <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Marie Tshibangu" className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
              </div>

              {/* Role selector */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Rôle / Poste *</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setForm({ ...form, role: r.value })}
                      className={`p-3 rounded-xl border text-left transition ${form.role === r.value ? 'border-[oklch(72%_0.15_65)] shadow-sm' : 'border-[oklch(88%_0.01_175)] hover:border-[oklch(80%_0.02_175)]'}`}
                      style={{ background: form.role === r.value ? GOLD_SOFT : 'white' }}
                    >
                      <div className="text-sm font-semibold" style={{ color: form.role === r.value ? GOLD : TEXT_PRIMARY }}>{r.label}</div>
                      <div className="w-2 h-2 rounded-full mt-1" style={{ background: r.color }} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="marie@ecole.cd" className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Téléphone</label>
                <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+243 81 234 56 78" className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>
                  Mot de passe {editingUser ? '(laisser vide pour ne pas changer)' : '(défaut: password123)'}
                </label>
                <div className="relative">
                  <input type={showPersonnelPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" className="w-full px-4 py-3 pr-11 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                  <button type="button" onClick={() => setShowPersonnelPassword(!showPersonnelPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[oklch(52%_0.015_250)] hover:text-[oklch(40%_0.02_250)] transition p-1">
                    {showPersonnelPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Teacher-specific fields */}
              {isTeacherForm && (
                <div className="space-y-4 p-4 rounded-xl border border-[oklch(88%_0.01_175)]" style={{ background: GOLD_SOFT }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Award size={16} style={{ color: GOLD }} />
                    <span className="text-sm font-semibold" style={{ color: GOLD }}>Informations enseignant</span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Matière / Cours enseigné</label>
                    <input type="text" value={form.subjectName} onChange={e => setForm({ ...form, subjectName: e.target.value })} placeholder="Ex: Mathématiques, Français, Histoire-Géo..." className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                    <p className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>Vous pouvez assigner plusieurs professeurs au même cours</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Classes occupées</label>
                    {/* Available classes - click to select/deselect */}
                    {availableClasses.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        <label className="text-[12px] font-medium" style={{ color: TEXT_PRIMARY }}>Sélectionner les classes</label>
                        <div className="flex flex-wrap gap-2">
                          {availableClasses.map(c => {
                            const isSelected = form.classNames.split(',').map(n => n.trim()).filter(Boolean).includes(c.name)
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  const current = form.classNames.split(',').map(n => n.trim()).filter(Boolean)
                                  if (isSelected) {
                                    setForm({ ...form, classNames: current.filter(n => n !== c.name).join(', ') })
                                  } else {
                                    setForm({ ...form, classNames: [...current, c.name].join(', ') })
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                                  isSelected 
                                    ? 'text-white shadow-sm' 
                                    : 'border border-[oklch(88%_0.01_175)] hover:border-[oklch(72%_0.15_65)]'
                                }`}
                                style={isSelected ? { background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` } : { color: TEXT_MUTED_LUXE }}
                              >
                                {c.name} {c._count?.students ? `(${c._count.students})` : ''}
                              </button>
                            )
                          })}
                        </div>
                        <p className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>Cliquez sur les classes pour les ajouter/retirer</p>
                      </div>
                    )}
                    <input type="text" value={form.classNames} onChange={e => setForm({ ...form, classNames: e.target.value })} placeholder="Ex: 6eA, 6eB, 5eA (séparées par des virgules)" className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isTitulaire}
                        onChange={(e) => setForm({ ...form, isTitulaire: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[oklch(88%_0.01_175)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[oklch(72%_0.15_65_/_0.3)] rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[oklch(55%_0.15_175)]" />
                    </label>
                    <div>
                      <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Titulaire</div>
                      <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>Cochez si ce professeur est le titulaire de sa classe</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[oklch(88%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition" style={{ color: TEXT_MUTED_LUXE }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving} className="edu-gold-cta px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                  {saving ? (
                    <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enregistrement...</>
                  ) : editingUser ? (
                    <><Check size={14} /> Enregistrer</>
                  ) : (
                    <><UserPlus size={14} /> Créer le compte</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Teacher Assignment Modal */}
      {showAssignmentModal && assignmentTeacher && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAssignmentModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-[oklch(90%_0.01_175)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center text-white" style={{ background: `linear-gradient(135deg, ${GOLD}, ${ACCENT})` }}>
                  <Award size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>Assigner des matières</h2>
                  <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>{assignmentTeacher.name}</p>
                </div>
              </div>
              <button onClick={() => setShowAssignmentModal(false)} className="p-2 rounded-lg hover:bg-[oklch(95%_0.04_175)] transition"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Current assignments */}
              <div>
                <label className="text-[13px] font-medium mb-2 block" style={{ color: TEXT_PRIMARY }}>Assignations actuelles</label>
                {assignments.length === 0 ? (
                  <p className="text-sm py-3 px-4 rounded-xl" style={{ color: TEXT_MUTED_LUXE, background: IVORY }}>Aucune assignation</p>
                ) : (
                  <div className="space-y-2">
                    {assignments.map(a => (
                      <div key={a.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-[oklch(90%_0.01_175)]" style={{ background: IVORY }}>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{a.class.name}</span>
                          <span className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>→</span>
                          <span className="text-sm font-medium" style={{ color: GOLD }}>{a.subject.name}</span>
                        </div>
                        <button onClick={() => handleRemoveAssignment(a.id)} className="p-1.5 rounded-lg hover:bg-[oklch(95%_0.02_25)] transition" title="Supprimer">
                          <Ban size={13} style={{ color: DANGER }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add new assignment */}
              <div className="p-4 rounded-xl border border-[oklch(88%_0.01_175)]" style={{ background: GOLD_SOFT }}>
                <label className="text-[13px] font-semibold mb-3 block" style={{ color: GOLD }}>Nouvelle assignation</label>
                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] font-medium mb-1 block" style={{ color: TEXT_PRIMARY }}>Classe *</label>
                    <select value={assignClassId} onChange={e => setAssignClassId(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                      <option value="">Sélectionner une classe</option>
                      {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[12px] font-medium mb-1 block" style={{ color: TEXT_PRIMARY }}>Matière *</label>
                    <select value={assignSubjectId} onChange={e => setAssignSubjectId(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" disabled={!assignClassId}>
                      <option value="">{assignClassId ? 'Sélectionner une matière' : 'D\'abord choisir une classe'}</option>
                      {assignSubjects.map(s => <option key={s.id} value={s.id}>{s.name} (coef. {s.coefficient})</option>)}
                    </select>
                  </div>
                  <button onClick={handleAddAssignment} disabled={assignLoading || !assignClassId || !assignSubjectId} className="edu-gold-cta px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                    {assignLoading ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={14} />}
                    Assigner
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}