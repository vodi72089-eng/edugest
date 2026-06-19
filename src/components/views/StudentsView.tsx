'use client'

import { useState, useEffect, useMemo } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import type { StudentData, ClassData } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY, GOLD_SOFT } from '@/lib/constants'
import { getInitials, formatNumber, getStatusPill } from '@/lib/helpers'
import { Plus, X, Users, ChevronDown, Eye, EyeOff, Edit, Trash2, Check } from 'lucide-react'
import { toast } from 'sonner'
import SearchAutocomplete, { AutocompleteItem } from './SearchAutocomplete'

export default function StudentsView() {
  const [students, setStudents] = useState<StudentData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [studentSuggestions, setStudentSuggestions] = useState<AutocompleteItem[]>([])
  const [studentSearchLoading, setStudentSearchLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
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
  const [editingStudent, setEditingStudent] = useState<StudentData | null>(null)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editGender, setEditGender] = useState('M')
  const [editClassId, setEditClassId] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const { userData } = useEduGestStore()

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch(`/api/students?limit=50${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`)
        const json = await res.json()
        setStudents(json.data || [])
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [userData?.schoolId])

  useEffect(() => {
    if (showAdd || editingStudent) {
      authFetch(`/api/classes?limit=50${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`)
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
      const body: Record<string, unknown> = {
        firstName: fd.get('firstName'), lastName: fd.get('lastName'),
        gender: fd.get('gender'), dateOfBirth: fd.get('dob'),
        classId: selectedClassId || students[0]?.classId, schoolId: userData?.schoolId || 'demo',
        schoolYearId: students[0]?.schoolYearId || 'demo',
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
        setSelectedClassId(''); setShowParentSection(false)
        const json = await authFetch(`/api/students?limit=50${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`).then(r => r.json())
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
        const json = await authFetch(`/api/students?limit=50${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`).then(r => r.json())
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
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Élèves</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>{formatNumber(filtered.length)} élèves inscrits</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="edu-gold-cta inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold">
          <Plus size={14} /> Ajouter un élève
        </button>
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
                <tr key={s.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full grid place-items-center text-white font-semibold text-[11px] shrink-0 overflow-hidden" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                        {s.photoUrl ? (
                          <img src={s.photoUrl} alt={`${s.firstName} ${s.lastName}`} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          getInitials(s.firstName + ' ' + s.lastName)
                        )}
                      </div>
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
                <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Sexe</label><select name="gender" className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"><option value="M">Masculin</option><option value="F">Féminin</option></select></div>
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
                  onClick={() => setShowParentSection(!showParentSection)}
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
                {viewingStudent.photoUrl ? (
                  <img src={viewingStudent.photoUrl} alt="" className="w-16 h-16 rounded-full object-cover border-2" style={{ borderColor: ACCENT }} />
                ) : (
                  <div className="w-16 h-16 rounded-full grid place-items-center text-white text-xl font-bold" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                    {getInitials(viewingStudent.firstName + ' ' + viewingStudent.lastName)}
                  </div>
                )}
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
            </div>
          </div>
        </div>
      )}

      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditingStudent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: TEXT_PRIMARY }}>Modifier l'élève</h3>
              <button onClick={() => setEditingStudent(null)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-gray-100 transition"><X size={16} className="text-gray-500" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Prénom *</label><input value={editFirstName} onChange={e => setEditFirstName(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" style={{ color: TEXT_PRIMARY }} /></div>
                <div><label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Nom *</label><input value={editLastName} onChange={e => setEditLastName(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" style={{ color: TEXT_PRIMARY }} /></div>
              </div>
              <div><label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Sexe</label><select value={editGender} onChange={e => setEditGender(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"><option value="M">Masculin</option><option value="F">Féminin</option></select></div>
              <div><label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Classe</label><select value={editClassId} onChange={e => setEditClassId(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
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
