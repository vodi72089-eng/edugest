'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useEduGestStore, authFetch, getActiveSchoolId } from '@/lib/store'
import type { StudentData, ClassData, GradeData } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY, GOLD_SOFT, DANGER } from '@/lib/constants'
import { getInitials, formatNumber, getStatusPill } from '@/lib/helpers'
import StudentAvatar from '@/components/ui/StudentAvatar'
import { Plus, X, Users, ChevronDown, Eye, EyeOff, Edit, Trash2, Check, Archive } from 'lucide-react'
import { toast } from 'sonner'
import SearchAutocomplete, { AutocompleteItem } from './SearchAutocomplete'
import AppSelect from '@/components/ui/AppSelect'
import { onDbChange } from '@/lib/realtime'

export default function StudentsView() {
  const [students, setStudents] = useState<StudentData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [studentSuggestions, setStudentSuggestions] = useState<AutocompleteItem[]>([])
  const [studentSearchLoading, setStudentSearchLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addGender, setAddGender] = useState('M')
  const [classes, setClasses] = useState<ClassData[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [classSearch, setClassSearch] = useState('')
  const [selectedClassSearchId, setSelectedClassSearchId] = useState<string | null>(null)
  const [showParentSection, setShowParentSection] = useState(false)
  const [parentName, setParentName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parentPassword, setParentPassword] = useState('')
  const [showParentPwd, setShowParentPwd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [viewingStudent, setViewingStudent] = useState<StudentData | null>(null)
  // Résultats de la période dans le modal « Détails de l'élève »
  const [viewTrimester, setViewTrimester] = useState('T1')
  const [viewGrades, setViewGrades] = useState<GradeData[]>([])
  const [viewGradesLoading, setViewGradesLoading] = useState(false)
  useEffect(() => {
    if (!viewingStudent) { setViewGrades([]); return }
    setViewGradesLoading(true)
    authFetch(`/api/grades?studentId=${viewingStudent.id}&trimester=${viewTrimester}&limit=100`)
      .then(r => r.json())
      .then(j => setViewGrades(j.data || []))
      .catch(() => setViewGrades([]))
      .finally(() => setViewGradesLoading(false))
  }, [viewingStudent?.id, viewTrimester])
  const [editingStudent, setEditingStudent] = useState<StudentData | null>(null)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editGender, setEditGender] = useState('M')
  const [editClassId, setEditClassId] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  // Compte parent (gestion manuelle élève par élève)
  const [editParentName, setEditParentName] = useState('')
  const [editParentPhone, setEditParentPhone] = useState('')
  const [editParentPassword, setEditParentPassword] = useState('')
  const [savingParentAccount, setSavingParentAccount] = useState(false)
  const { userData, highlightedId } = useEduGestStore()
  // École active : pour le super admin plateforme, l'école choisie dans la
  // sidebar (sinon activeSchoolId est null → toutes les écoles mélangées,
  // ce qui donnait l'impression que « toutes les écoles ont les mêmes classes »).
  const activeSchoolId = getActiveSchoolId() || userData?.schoolId || ''
  const [activeSchoolYear, setActiveSchoolYear] = useState('')
  const [archivedCount, setArchivedCount] = useState(0)
  const [archivedStudents, setArchivedStudents] = useState<any[]>([])
  const [showArchives, setShowArchives] = useState(false)
  const highlightedRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (highlightedId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightedId])

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch(`/api/students?limit=50${activeSchoolId ? `&schoolId=${activeSchoolId}` : ''}`)
        const json = await res.json()
        setStudents(json.data || [])
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [activeSchoolId])

  // Synchronisation temps réel : recharge les élèves dès qu'un changement
  // est détecté dans la base de données (autre session, autre utilisateur…)
  const [dbPulse, setDbPulse] = useState(0)
  useEffect(() => onDbChange(() => setDbPulse((t) => t + 1)), [])
  useEffect(() => {
    if (dbPulse === 0) return
    async function reload() {
      try {
        const res = await authFetch(`/api/students?limit=50${activeSchoolId ? `&schoolId=${activeSchoolId}` : ''}`)
        const json = await res.json()
        setStudents(json.data || [])
      } catch (e) { console.error(e) }
    }
    reload()
  }, [dbPulse, activeSchoolId])

  useEffect(() => {
    if (activeSchoolId) {
      authFetch(`/api/schools/${activeSchoolId}`).then(r => r.json()).then(j => {
        const years = j.data?.schoolYears || []
        const active = years.find((y: any) => y.isActive)
        if (active) setActiveSchoolYear(active.id)
      }).catch(() => {})
    }
  }, [activeSchoolId])

  useEffect(() => {
    if (activeSchoolId) {
      authFetch(`/api/schools/${activeSchoolId}/archived-students`)
        .then(res => res.json())
        .then(data => {
          setArchivedStudents(data.data || [])
          setArchivedCount(data.data?.length || 0)
        })
        .catch(() => {})
    }
  }, [activeSchoolId])

  useEffect(() => {
    if (showAdd || editingStudent) {
      authFetch(`/api/classes?limit=50${activeSchoolId ? `&schoolId=${activeSchoolId}` : ''}`)
        .then(r => r.json())
        .then(j => setClasses(j.data || []))
        .catch(() => {})
    }
  }, [showAdd, editingStudent])

  useEffect(() => {
    if (studentSearch.length < 2) return
    const timer = setTimeout(() => {
      setStudentSearchLoading(true)
      authFetch(`/api/students?search=${encodeURIComponent(studentSearch)}&limit=8`)
        .then(r => r.json())
        .then(j => {
          setStudentSuggestions((j.data || []).map((s: StudentData) => ({
            id: s.id, label: `${s.firstName} ${s.lastName}`, sublabel: s.matricule, photoUrl: s.photoUrl
          })))
          setStudentSearchLoading(false)
        })
        .catch(() => setStudentSearchLoading(false))
    }, 300)
    return () => { clearTimeout(timer); setStudentSearchLoading(false) }
  }, [studentSearch])

  const classSuggestions = useMemo(() => {
    if (classSearch.length < 1) return classes.map(c => ({ id: c.id, label: c.name, sublabel: `${c._count?.students || 0} élèves · Cap. ${c.capacity}` }))
    return classes.filter(c => c.name.toLowerCase().includes(classSearch.toLowerCase())).map(c => ({
      id: c.id, label: c.name, sublabel: `${c._count?.students || 0} élèves · Cap. ${c.capacity}`
    }))
  }, [classSearch, classes])

  const filtered = selectedStudentId
    ? students.filter(s => s.id === selectedStudentId)
    : students.filter(s =>
        !search || s.firstName.toLowerCase().includes(search.toLowerCase()) || s.lastName.toLowerCase().includes(search.toLowerCase()) || s.matricule.toLowerCase().includes(search.toLowerCase())
      )

  async function handleAddStudent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAdding(true)
    const fd = new FormData(e.currentTarget)
    try {
      if (!selectedClassId) { toast.error('Veuillez sélectionner une classe'); setAdding(false); return }
      if (!activeSchoolYear) { toast.error('Aucune année scolaire active'); setAdding(false); return }
      const body: Record<string, unknown> = {
        firstName: fd.get('firstName'), lastName: fd.get('lastName'),
        gender: addGender, dateOfBirth: fd.get('dob'),
        classId: selectedClassId, schoolId: activeSchoolId || 'demo',
        schoolYearId: activeSchoolYear,
      }
      if (showParentSection && parentName) {
        body.parentName = parentName
        body.parentEmail = parentEmail
        body.parentPhone = parentPhone
        body.parentPassword = parentPassword
      }
      const res = await authFetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success('Élève ajouté avec succès!')
        setShowAdd(false)
        setParentName(''); setParentEmail(''); setParentPhone(''); setParentPassword('')
        setSelectedClassId(''); setShowParentSection(false); setAddGender('M')
        const json = await authFetch(`/api/students?limit=50${activeSchoolId ? `&schoolId=${activeSchoolId}` : ''}`).then(r => r.json())
        setStudents(json.data || [])
      } else {
        toast.error('Erreur lors de l\'ajout')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setAdding(false) }
  }

  function handleViewStudent(student: StudentData) { setViewingStudent(student) }

  function handleEditStudent(student: StudentData) {
    setEditingStudent(student)
    setEditFirstName(student.firstName)
    setEditLastName(student.lastName)
    setEditGender(student.gender || 'M')
    setEditClassId(student.classId || '')
    // Pré-remplissage du compte parent existant (le mot de passe n'est jamais pré-rempli)
    setEditParentName(student.parent?.name || '')
    setEditParentPhone(student.parent?.phone || '')
    setEditParentPassword('')
  }

  async function handleSaveParentAccount() {
    if (!editingStudent) return
    if (!editParentName.trim() || !editParentPhone.trim()) { toast.error('Nom et téléphone du parent requis'); return }
    setSavingParentAccount(true)
    try {
      const body: Record<string, string> = {
        name: editParentName.trim(),
        phone: editParentPhone.trim(),
      }
      if (editParentPassword) body.password = editParentPassword
      const res = await authFetch(`/api/students/${editingStudent.id}/parent-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(j.data?.message || 'Compte parent enregistré !')
        setEditParentPassword('')
        // Rafraîchit la liste pour afficher le parent lié
        const json = await authFetch(`/api/students?limit=50${activeSchoolId ? `&schoolId=${activeSchoolId}` : ''}`).then(r => r.json())
        setStudents(json.data || [])
      } else {
        toast.error(j.error || 'Erreur lors de l enregistrement du compte parent')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSavingParentAccount(false) }
  }

  async function handleSaveEdit() {
    if (!editingStudent || !editFirstName.trim() || !editLastName.trim()) { toast.error('Prénom et nom requis'); return }
    setSavingEdit(true)
    try {
      const res = await authFetch(`/api/students/${editingStudent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: editFirstName.trim(), lastName: editLastName.trim(), gender: editGender, classId: editClassId || undefined }),
      })
      if (res.ok) {
        toast.success('Élève modifié avec succès!')
        setEditingStudent(null)
        const json = await authFetch(`/api/students?limit=50${activeSchoolId ? `&schoolId=${activeSchoolId}` : ''}`).then(r => r.json())
        setStudents(json.data || [])
      } else {
        const j = await res.json()
        toast.error(j.error || 'Erreur lors de la modification')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSavingEdit(false) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Élèves</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>{formatNumber(filtered.length)} élèves inscrits</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="edu-gold-cta inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold">
          <Plus size={14} /> Ajouter un élève
        </button>
        {archivedCount > 0 && (
          <button onClick={() => setShowArchives(!showArchives)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-[oklch(85%_0.02_175)]" style={{ color: TEXT_PRIMARY }}>
            <Archive size={14} /> Archives ({archivedCount})
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <SearchAutocomplete
          label="Rechercher un élève *"
          placeholder="Tapez le nom de l'élève..."
          items={studentSuggestions}
          selectedId={selectedStudentId}
          onSelect={(item) => { setSelectedStudentId(item.id); setSearch('') }}
          onClear={() => { setSelectedStudentId(null); setStudentSearch('') }}
          searchQuery={studentSearch}
          onSearchChange={setStudentSearch}
          loading={studentSearchLoading}
          itemTypeName="élève"
          className="flex-1 max-w-md"
        />
      </div>

      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: IVORY }}>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Élève</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Matricule</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Classe</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Parent</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Statut</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucun élève trouvé</td></tr>
              ) : filtered.map(s => (
                <tr ref={highlightedId === s.id ? highlightedRef : undefined} key={s.id} className={`hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0 ${highlightedId === s.id ? 'edu-highlight' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <StudentAvatar firstName={s.firstName} lastName={s.lastName} photoUrl={s.photoUrl} size={32} className="text-white font-semibold" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
                      <div>
                        <div className="font-medium text-[13px]" style={{ color: TEXT_PRIMARY }}>{s.firstName} {s.lastName}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{s.gender === 'M' ? 'Garçon' : 'Fille'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] font-mono" style={{ color: TEXT_MUTED_LUXE }}>{s.matricule}</td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_PRIMARY }}>{s.class?.name || '—'}</td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{s.parent?.name || '—'}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${getStatusPill('Actif')}`}>Actif</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => handleViewStudent(s)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: ACCENT }} title="Voir détails"><Eye size={14} /></button>
                      <button onClick={() => handleEditStudent(s)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: GOLD }} title="Modifier"><Edit size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showArchives && archivedStudents.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4" style={{ color: TEXT_PRIMARY }}>Élèves archivés</h3>
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: IVORY }}>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Élève</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Classe</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Archivé le</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedStudents.map((student: any) => (
                    <tr key={student.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <StudentAvatar firstName={student.firstName} lastName={student.lastName} photoUrl={student.photoUrl} size={32} className="text-white font-semibold" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
                          <div>
                            <div className="font-medium text-[13px]" style={{ color: TEXT_PRIMARY }}>{student.firstName} {student.lastName}</div>
                            <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{student.gender === 'M' ? 'Garçon' : 'Fille'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_PRIMARY }}>{student.class?.name || '—'}</td>
                      <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{student.archivedAt ? new Date(student.archivedAt).toLocaleDateString('fr-FR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>Ajouter un élève</h2>
              <button onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Prénom</label><input name="firstName" required className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
                <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Nom</label><input name="lastName" required className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Sexe</label><div className="mt-1"><AppSelect value={addGender} onChange={setAddGender} options={[{ value: 'M', label: 'Masculin' }, { value: 'F', label: 'Féminin' }]} /></div></div>
                <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Date de naissance</label><input name="dob" type="date" className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" /></div>
              </div>
              <SearchAutocomplete
                label="Classe *"
                placeholder="Tapez le nom de la classe..."
                items={classSuggestions}
                selectedId={selectedClassSearchId}
                onSelect={(item) => { setSelectedClassSearchId(item.id); setSelectedClassId(item.id) }}
                onClear={() => { setSelectedClassSearchId(null); setSelectedClassId(''); setClassSearch('') }}
                searchQuery={classSearch}
                onSearchChange={setClassSearch}
                itemTypeName="classe"
              />

              <div className="border border-[oklch(90%_0.01_175)] rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    if (userData?.subscriptionTier === 'FREEMIUM') {
                      toast.error("Votre abonnement ne supporte pas cette fonctionnalité")
                      return
                    }
                    setShowParentSection(!showParentSection)
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition hover:bg-[oklch(97%_0.005_175)]"
                  style={{ color: TEXT_PRIMARY }}
                >
                  <span className="flex items-center gap-2"><Users size={14} style={{ color: GOLD }} /> Informations du parent</span>
                  <ChevronDown size={14} className={`transition-transform ${showParentSection ? 'rotate-180' : ''}`} />
                </button>
                {showParentSection && (
                  <div className="px-4 pb-4 space-y-3 border-t border-[oklch(90%_0.01_175)]">
                    <div className="pt-3">
                      <input placeholder="Nom du parent" value={parentName} onChange={e => setParentName(e.target.value)} className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" />
                    </div>
                    <div><input placeholder="Email du parent" type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
                    <div><input placeholder="Téléphone du parent (ex: +243 81...)" type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value)} className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
                    <div className="relative"><input placeholder="Mot de passe du parent" type={showParentPwd ? 'text' : 'password'} value={parentPassword} onChange={e => setParentPassword(e.target.value)} className="w-full px-3 py-2 pr-10 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /><button type="button" onClick={() => setShowParentPwd(!showParentPwd)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[oklch(52%_0.015_250)] hover:text-[oklch(40%_0.02_250)] transition p-1">{showParentPwd ? <EyeOff size={14} /> : <Eye size={14} />}</button></div>
                  </div>
                )}
              </div>

              <button type="submit" disabled={adding} className="w-full py-2.5 rounded-xl font-semibold text-sm edu-gold-cta inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {adding ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Plus size={14} />}
                Ajouter l&apos;élève
              </button>
            </form>
          </div>
        </div>
      )}

      {viewingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setViewingStudent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: TEXT_PRIMARY }}>Détails de l'élève</h3>
              <button onClick={() => setViewingStudent(null)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-gray-100 transition"><X size={16} className="text-gray-500" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-4">
                <StudentAvatar firstName={viewingStudent.firstName} lastName={viewingStudent.lastName} photoUrl={viewingStudent.photoUrl} size={56} className="border-2" style={{ borderColor: ACCENT, background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
                <div>
                  <div className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>{viewingStudent.firstName} {viewingStudent.lastName}</div>
                  <div className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>{viewingStudent.matricule}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[oklch(97%_0.005_175)] rounded-xl p-3">
                  <div className="text-[11px] font-medium" style={{ color: TEXT_MUTED_LUXE }}>Sexe</div>
                  <div className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{viewingStudent.gender === 'M' ? 'Masculin' : 'Féminin'}</div>
                </div>
                <div className="bg-[oklch(97%_0.005_175)] rounded-xl p-3">
                  <div className="text-[11px] font-medium" style={{ color: TEXT_MUTED_LUXE }}>Classe</div>
                  <div className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{viewingStudent.class?.name || '—'}</div>
                </div>
                <div className="bg-[oklch(97%_0.005_175)] rounded-xl p-3">
                  <div className="text-[11px] font-medium" style={{ color: TEXT_MUTED_LUXE }}>Date de naissance</div>
                  <div className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{viewingStudent.dateOfBirth ? new Date(viewingStudent.dateOfBirth).toLocaleDateString('fr-FR') : '—'}</div>
                </div>
                <div className="bg-[oklch(97%_0.005_175)] rounded-xl p-3">
                  <div className="text-[11px] font-medium" style={{ color: TEXT_MUTED_LUXE }}>Parent</div>
                  <div className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{viewingStudent.parent?.name || '—'}</div>
                </div>
              </div>
              {/* Résultats de la période (si disponibles) */}
              <div className="bg-[oklch(97%_0.005_175)] rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-[11px] font-medium" style={{ color: TEXT_MUTED_LUXE }}>Résultats de la période</div>
                  <div className="w-36">
                    <AppSelect
                      value={viewTrimester}
                      onChange={setViewTrimester}
                      options={['Trimestre 1', 'Trimestre 2', 'Trimestre 3'].map((label, i) => ({ value: `T${i + 1}`, label }))}
                    />
                  </div>
                </div>
                {viewGradesLoading ? (
                  <div className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Chargement…</div>
                ) : viewGrades.length === 0 ? (
                  <div className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Aucune note pour cette période.</div>
                ) : (() => {
                  const totalCoef = viewGrades.reduce((s, g) => s + (g.subject?.coefficient || 1), 0)
                  const avg = totalCoef > 0
                    ? viewGrades.reduce((s, g) => s + g.score * (g.subject?.coefficient || 1), 0) / totalCoef
                    : 0
                  return (
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold" style={{ color: avg >= 10 ? GOLD : DANGER }}>{avg.toFixed(1)}/20</span>
                        <span className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>moyenne · {viewGrades.length} note{viewGrades.length > 1 ? 's' : ''}</span>
                      </div>
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {viewGrades.map(g => (
                          <div key={g.id} className="flex items-center justify-between text-[13px]">
                            <span style={{ color: TEXT_MUTED_LUXE }}>{g.subject?.name || '—'} <span className="text-[11px]">(×{g.subject?.coefficient || 1})</span></span>
                            <span className="font-semibold" style={{ color: g.score >= 10 ? GOLD : DANGER }}>{g.score.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditingStudent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-semibold" style={{ color: TEXT_PRIMARY }}>Modifier l'élève</h3>
              <button onClick={() => setEditingStudent(null)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-gray-100 transition"><X size={16} className="text-gray-500" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Prénom *</label><input value={editFirstName} onChange={e => setEditFirstName(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" style={{ color: TEXT_PRIMARY }} /></div>
                <div><label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Nom *</label><input value={editLastName} onChange={e => setEditLastName(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" style={{ color: TEXT_PRIMARY }} /></div>
              </div>
              <div><label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Sexe</label><AppSelect value={editGender} onChange={setEditGender} options={[{ value: 'M', label: 'Masculin' }, { value: 'F', label: 'Féminin' }]} /></div>
              <div><label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Classe</label><AppSelect value={editClassId} onChange={setEditClassId} options={classes.map(c => ({ value: c.id, label: c.name }))} /></div>

              {/* ── Compte parent : identifiants écrits à la main par l'admin ── */}
              <div className="border border-[oklch(90%_0.01_175)] rounded-xl overflow-hidden">
                <div className="px-4 py-3 text-sm font-medium flex items-center gap-2" style={{ color: TEXT_PRIMARY, background: IVORY }}>
                  <Users size={14} style={{ color: GOLD }} />
                  Compte parent — identifiants de connexion
                </div>
                <div className="px-4 py-4 space-y-3">
                  <p className="text-[12px] leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>
                    Écrivez ici le nom et le mot de passe du compte parent de cet élève. Le parent se connectera avec son numéro de téléphone et ce mot de passe.
                  </p>
                  <div><input placeholder="Nom du parent" value={editParentName} onChange={e => setEditParentName(e.target.value)} className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" /></div>
                  <div><input placeholder="Téléphone du parent (identifiant, ex: +243 81...)" type="tel" value={editParentPhone} onChange={e => setEditParentPhone(e.target.value)} className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" /></div>
                  <div className="relative">
                    <input placeholder={editParentPhone ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe du parent"} type={showParentPwd ? 'text' : 'password'} value={editParentPassword} onChange={e => setEditParentPassword(e.target.value)} className="w-full px-3 py-2 pr-10 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
                    <button type="button" onClick={() => setShowParentPwd(!showParentPwd)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[oklch(52%_0.015_250)] hover:text-[oklch(40%_0.02_250)] transition p-1">{showParentPwd ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  </div>
                  <button type="button" onClick={handleSaveParentAccount} disabled={savingParentAccount} className="w-full py-2.5 rounded-xl text-sm font-semibold edu-gold-cta inline-flex items-center justify-center gap-2 disabled:opacity-50">
                    {savingParentAccount ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
                    Enregistrer le compte parent
                  </button>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setEditingStudent(null)} className="px-5 py-2.5 rounded-xl text-sm font-medium border border-[oklch(90%_0.01_175)]" style={{ color: TEXT_PRIMARY }}>Annuler</button>
              <button onClick={handleSaveEdit} disabled={savingEdit} className="edu-gold-cta px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                {savingEdit ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
