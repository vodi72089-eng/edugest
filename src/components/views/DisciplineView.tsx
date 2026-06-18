'use client'

import { useState, useEffect, useMemo } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import type { DisciplineData, StudentData, UserRole } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY, GOLD_SOFT, DANGER, WARNING, SUCCESS, SUCCESS_SOFT } from '@/lib/constants'
import { getInitials, formatDate } from '@/lib/helpers'
import { Shield, Megaphone, Users, Ban, AlertTriangle, Award, Send, Check, X, Edit } from 'lucide-react'
import { toast } from 'sonner'
import SearchAutocomplete from './SearchAutocomplete'

export default function DisciplineView() {
  const { userRole, userData } = useEduGestStore()
  const [records, setRecords] = useState<DisciplineData[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'BLACKLIST' | 'GREYLIST' | 'WHITELIST'>('GREYLIST')
  const [selectedChildId, setSelectedChildId] = useState('')
  const [myChildren, setMyChildren] = useState<StudentData[]>([])
  const [childSearch, setChildSearch] = useState('')
  const [selectedChildSearchId, setSelectedChildSearchId] = useState<string | null>(null)
  const [allDisciplineRecords, setAllDisciplineRecords] = useState<DisciplineData[]>([])
  const isParent = userRole === 'PARENT'

  const disciplineRoles: UserRole[] = ['DISCIPLINE_MATERNELLE', 'DISCIPLINE_PRIMAIRE', 'DISCIPLINE_SECONDAIRE']
  const isDisciplineRole = disciplineRoles.includes(userRole as UserRole)
  const [sectionStudents, setSectionStudents] = useState<StudentData[]>([])
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedStudentSearchId, setSelectedStudentSearchId] = useState<string | null>(null)
  const [showSanctionForm, setShowSanctionForm] = useState(false)
  const [showConvocationForm, setShowConvocationForm] = useState(false)
  const [sanctionType, setSanctionType] = useState('RETARD')
  const [sanctionSeverity, setSanctionSeverity] = useState('LOW')
  const [sanctionTitle, setSanctionTitle] = useState('')
  const [sanctionDesc, setSanctionDesc] = useState('')
  const [sanctionPoints, setSanctionPoints] = useState('-2')
  const [sanctionListType, setSanctionListType] = useState<'BLACKLIST' | 'GREYLIST' | 'WHITELIST'>('GREYLIST')
  const [submitting, setSubmitting] = useState(false)
  const [convocationMotif, setConvocationMotif] = useState('')
  const [convocationDate, setConvocationDate] = useState('')
  const [convocations, setConvocations] = useState<{ id: string; motif: string; date: string; status: string; student: { firstName: string; lastName: string; matricule: string } }[]>([])
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [editPoints, setEditPoints] = useState('')
  const [editListType, setEditListType] = useState<'BLACKLIST' | 'GREYLIST' | 'WHITELIST'>('GREYLIST')
  const [editStatus, setEditStatus] = useState('PENDING')
  const [savingEdit, setSavingEdit] = useState(false)
  const sectionLevel = userRole === 'DISCIPLINE_MATERNELLE' ? 'MATERNELLE' : userRole === 'DISCIPLINE_PRIMAIRE' ? 'PRIMAIRE' : userRole === 'DISCIPLINE_SECONDAIRE' ? 'SECONDAIRE' : ''

  useEffect(() => {
    if (isParent && userData?.id) {
      authFetch(`/api/students?parentId=${userData.id}&limit=20`)
        .then(r => r.json())
        .then(j => setMyChildren(j.data || []))
        .catch(() => {})
    }
  }, [isParent, userData?.id])

  useEffect(() => {
    if (isDisciplineRole && userData?.schoolId && sectionLevel) {
      authFetch(`/api/students?limit=200&schoolId=${userData.schoolId}`)
        .then(r => r.json())
        .then(j => {
          const allStudents: StudentData[] = j.data || []
          const filtered = allStudents.filter(s => {
            const cls = (s as Record<string, unknown>).class as { name?: string; section?: string; level?: string } | undefined
            const sectionValue = cls?.section || cls?.level || ''
            const nameValue = cls?.name || ''
            return sectionValue.toUpperCase().includes(sectionLevel.toUpperCase()) ||
                   nameValue.toUpperCase().includes(sectionLevel.toUpperCase()) ||
                   (sectionLevel === 'MATERNELLE' && (nameValue.match(/^(M|MAT|MATERNELLE|PETITE|MOYENNE|GRANDE)/i) !== null)) ||
                   (sectionLevel === 'PRIMAIRE' && (nameValue.match(/^(P|PRI|PRIMAIRE|1ERE|2EME|3EME|4EME|5EME|6EME|\d)/i) !== null)) ||
                   (sectionLevel === 'SECONDAIRE' && (nameValue.match(/^(S|SEC|SECONDAIRE|7EME|8EME|9EME|10EME|11EME|12EME)/i) !== null))
          })
          setSectionStudents(filtered)
        })
        .catch(() => {})
    }
  }, [isDisciplineRole, userData?.schoolId, sectionLevel])

  useEffect(() => {
    if (isDisciplineRole && userData?.schoolId) {
      authFetch(`/api/convocations?schoolId=${userData.schoolId}&limit=50`)
        .then(r => r.json())
        .then(j => setConvocations(j.data || []))
        .catch(() => {})
    }
    if (isParent && userData?.schoolId) {
      authFetch(`/api/convocations?schoolId=${userData.schoolId}&limit=50`)
        .then(r => r.json())
        .then(j => setConvocations(j.data || []))
        .catch(() => {})
    }
  }, [isDisciplineRole, isParent, userData?.schoolId, userData?.id])

  useEffect(() => {
    if (isParent && userData?.id) {
      const params = new URLSearchParams()
      params.set('parentId', userData.id)
      params.set('limit', '200')
      authFetch(`/api/discipline?${params}`).then(r => r.json()).then(j => { setAllDisciplineRecords(j.data || []) }).catch(() => {})
    }
  }, [isParent, userData?.id])

  const childDisciplineCounts = useMemo(() => {
    const counts: Record<string, { blacklist: number; greylist: number; whitelist: number; totalPoints: number }> = {}
    for (const r of allDisciplineRecords) {
      if (!r.student) continue
      if (!counts[r.student.id]) counts[r.student.id] = { blacklist: 0, greylist: 0, whitelist: 0, totalPoints: 0 }
      if (r.listType === 'BLACKLIST') counts[r.student.id].blacklist++
      if (r.listType === 'GREYLIST') counts[r.student.id].greylist++
      if (r.listType === 'WHITELIST') counts[r.student.id].whitelist++
      counts[r.student.id].totalPoints += r.points
    }
    return counts
  }, [allDisciplineRecords])

  const studentSuggestions = useMemo(() => {
    if (!isDisciplineRole) return []
    if (studentSearch.length < 1) return sectionStudents.map(s => ({ id: s.id, label: `${s.firstName} ${s.lastName}`, sublabel: s.matricule }))
    return sectionStudents.filter(s =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(studentSearch.toLowerCase()) || s.matricule.toLowerCase().includes(studentSearch.toLowerCase())
    ).map(s => ({ id: s.id, label: `${s.firstName} ${s.lastName}`, sublabel: s.matricule }))
  }, [studentSearch, sectionStudents, isDisciplineRole])

  const childSuggestions = useMemo(() => {
    if (!isParent) return []
    if (childSearch.length < 1) return myChildren.map(c => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, sublabel: c.matricule }))
    return myChildren.filter(c =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(childSearch.toLowerCase()) || c.matricule.toLowerCase().includes(childSearch.toLowerCase())
    ).map(c => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, sublabel: c.matricule }))
  }, [childSearch, myChildren, isParent])

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams()
    params.set('listType', tab)
    params.set('limit', '50')
    if (isParent && userData?.id) {
      if (selectedChildId) {
        params.set('studentId', selectedChildId)
      } else {
        params.set('parentId', userData.id)
      }
    }
    if (isDisciplineRole && selectedStudentId) {
      params.set('studentId', selectedStudentId)
    }
    authFetch(`/api/discipline?${params}`).then(r => r.json()).then(j => { if (!cancelled) { setRecords(j.data || []); setLoading(false) } }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tab, isParent, userData?.id, selectedChildId, isDisciplineRole, selectedStudentId])

  const selectedChildName = selectedChildId ? myChildren.find(c => c.id === selectedChildId) : null
  const selectedStudentName = selectedStudentId ? sectionStudents.find(s => s.id === selectedStudentId) : null

  async function handleAddSanction() {
    if (!selectedStudentId || !sanctionTitle || !sanctionDesc || !userData?.schoolId) {
      toast.error('Veuillez remplir tous les champs')
      return
    }
    setSubmitting(true)
    try {
      const res = await authFetch('/api/discipline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudentId,
          type: sanctionType,
          severity: sanctionSeverity,
          title: sanctionTitle,
          description: sanctionDesc,
          points: parseInt(sanctionPoints) || 0,
          listType: sanctionListType,
          schoolId: userData.schoolId,
        }),
      })
      if (res.ok) {
        toast.success('Sanction enregistrée !')
        setShowSanctionForm(false)
        setSanctionTitle('')
        setSanctionDesc('')
        setSanctionPoints('-2')
        setLoading(true)
        const params = new URLSearchParams()
        params.set('listType', tab)
        params.set('limit', '50')
        if (selectedStudentId) params.set('studentId', selectedStudentId)
        authFetch(`/api/discipline?${params}`).then(r => r.json()).then(j => { setRecords(j.data || []); setLoading(false) }).catch(() => setLoading(false))
      } else {
        toast.error('Erreur lors de l\'enregistrement')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setSubmitting(false)
  }

  async function handleAddConvocation() {
    if (!selectedStudentId || !convocationMotif || !convocationDate || !userData?.schoolId) {
      toast.error('Veuillez remplir tous les champs')
      return
    }
    setSubmitting(true)
    try {
      const student = sectionStudents.find(s => s.id === selectedStudentId)
      const res = await authFetch('/api/convocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudentId,
          parentId: (student as Record<string, unknown>)?.parentId || null,
          motif: convocationMotif,
          date: convocationDate,
          schoolId: userData.schoolId,
          createdBy: userData.id,
        }),
      })
      if (res.ok) {
        toast.success('Convocation envoyée !')
        setShowConvocationForm(false)
        setConvocationMotif('')
        setConvocationDate('')
        authFetch(`/api/convocations?schoolId=${userData.schoolId}&limit=50`)
          .then(r => r.json())
          .then(j => setConvocations(j.data || []))
          .catch(() => {})
      } else {
        toast.error('Erreur lors de l\'envoi')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setSubmitting(false)
  }

  async function handleEditRecord(record: DisciplineData) {
    setEditingRecordId(record.id)
    setEditPoints(String(record.points))
    setEditListType(record.listType as 'BLACKLIST' | 'GREYLIST' | 'WHITELIST')
    setEditStatus(record.status)
  }

  async function handleSaveEdit() {
    if (!editingRecordId) return
    setSavingEdit(true)
    try {
      const res = await authFetch('/api/discipline', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRecordId,
          points: parseInt(editPoints) || 0,
          listType: editListType,
          status: editStatus,
        }),
      })
      if (res.ok) {
        toast.success('Enregistrement modifié !')
        setEditingRecordId(null)
        setLoading(true)
        const params = new URLSearchParams()
        params.set('listType', tab)
        params.set('limit', '50')
        if (isParent && userData?.id) {
          if (selectedChildId) params.set('studentId', selectedChildId)
          else params.set('parentId', userData.id)
        }
        if (isDisciplineRole && selectedStudentId) params.set('studentId', selectedStudentId)
        authFetch(`/api/discipline?${params}`).then(r => r.json()).then(j => { setRecords(j.data || []); setLoading(false) }).catch(() => setLoading(false))
      } else {
        toast.error('Erreur lors de la modification')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setSavingEdit(false)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Discipline</h1>
        {isDisciplineRole && sectionLevel && (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ background: GOLD_SOFT, color: GOLD }}>{sectionLevel}</span>
        )}
      </div>

      {isDisciplineRole && (
        <div className="mb-6 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[250px] max-w-sm">
              <SearchAutocomplete
                label="Rechercher un élève *"
                placeholder="Tapez le nom de l'élève..."
                items={studentSuggestions}
                selectedId={selectedStudentSearchId}
                onSelect={(item) => { setSelectedStudentSearchId(item.id); setSelectedStudentId(item.id) }}
                onClear={() => { setSelectedStudentSearchId(null); setSelectedStudentId(null); setStudentSearch('') }}
                searchQuery={studentSearch}
                onSearchChange={setStudentSearch}
                itemTypeName="élève"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowSanctionForm(true); setShowConvocationForm(false) }} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: DANGER }}>
                <Shield size={14} /> Sanctionner
              </button>
              <button onClick={() => { setShowConvocationForm(true); setShowSanctionForm(false) }} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: WARNING }}>
                <Megaphone size={14} /> Convocation
              </button>
            </div>
          </div>

          {!selectedStudentId && sectionStudents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} style={{ color: GOLD }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Élèves du secteur ({sectionStudents.length})</span>
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                {sectionStudents.slice(0, 30).map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedStudentId(s.id); setSelectedStudentSearchId(s.id) }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                      selectedStudentId === s.id ? 'border-[oklch(72%_0.15_65)] shadow-sm' : 'border-[oklch(90%_0.01_175)] hover:border-[oklch(72%_0.15_65_/_0.4)]'
                    }`}
                    style={{ background: selectedStudentId === s.id ? GOLD_SOFT : 'white', color: TEXT_PRIMARY }}
                  >
                    <div className="w-5 h-5 rounded-full grid place-items-center text-white text-[8px] font-bold" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                      {getInitials(`${s.firstName} ${s.lastName}`)}
                    </div>
                    {s.firstName} {s.lastName}
                  </button>
                ))}
                {sectionStudents.length > 30 && <span className="text-xs px-2 py-1" style={{ color: TEXT_MUTED_LUXE }}>+{sectionStudents.length - 30} autres</span>}
              </div>
            </div>
          )}

          {selectedStudentId && selectedStudentName && (
            <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm flex items-center gap-4">
              {(() => {
                const student = sectionStudents.find(s => s.id === selectedStudentId) || myChildren.find(s => s.id === selectedStudentId)
                return (
                  <>
                    {student?.photoUrl ? (
                      <img src={student.photoUrl} alt={`${student.firstName} ${student.lastName}`} className="w-14 h-14 rounded-full object-cover border-2 shrink-0" style={{ borderColor: ACCENT }} />
                    ) : (
                      <div className="w-14 h-14 rounded-full grid place-items-center text-white text-lg font-bold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                        {getInitials(`${selectedStudentName.firstName} ${selectedStudentName.lastName}`)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm" style={{ color: TEXT_PRIMARY }}>{selectedStudentName.firstName} {selectedStudentName.lastName}</div>
                      <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Matricule: {selectedStudentName.matricule || '—'}</div>
                      {student?.class && (
                        <div className="text-xs mt-0.5" style={{ color: ACCENT }}>
                          {student.class.name}{student.class.section ? ` — ${student.class.section}` : ''}
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setSelectedStudentId(null); setSelectedStudentSearchId(null); setStudentSearch('') }} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition shrink-0" style={{ color: TEXT_MUTED_LUXE }}>
                      <X size={14} />
                    </button>
                  </>
                )
              })()}
            </div>
          )}

          {showSanctionForm && (
            <div className="bg-white border-2 border-[oklch(72%_0.15_65_/_0.3)] rounded-2xl p-6 shadow-md">
              <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
                <Shield size={16} style={{ color: DANGER }} /> Nouvelle sanction
                {selectedStudentName && <span className="text-sm font-normal" style={{ color: TEXT_MUTED_LUXE }}>— {selectedStudentName.firstName} {selectedStudentName.lastName}</span>}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Élève *</label>
                  {!selectedStudentId ? (
                    <div className="px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm" style={{ color: DANGER }}>Sélectionnez un élève ci-dessus</div>
                  ) : (
                    <div className="px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm font-medium" style={{ color: TEXT_PRIMARY, background: GOLD_SOFT }}>
                      {selectedStudentName?.firstName} {selectedStudentName?.lastName} ({selectedStudentName?.matricule})
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Liste *</label>
                  <select value={sanctionListType} onChange={e => setSanctionListType(e.target.value as 'BLACKLIST' | 'GREYLIST' | 'WHITELIST')} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                    <option value="GREYLIST">Liste Grise (modéré)</option>
                    <option value="BLACKLIST">Liste Noire (grave)</option>
                    <option value="WHITELIST">Liste Blanche (positif)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Type *</label>
                  <select value={sanctionType} onChange={e => setSanctionType(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                    <option value="RETARD">Retard</option>
                    <option value="ABSENCE">Absence</option>
                    <option value="TRICHERIE">Tricherie</option>
                    <option value="VIOLENCE">Violence</option>
                    <option value="INCIVILITE">Incivilité</option>
                    <option value="EXCELLENCE">Excellence</option>
                    <option value="MERITE">Mérite</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Gravité *</label>
                  <select value={sanctionSeverity} onChange={e => setSanctionSeverity(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                    <option value="LOW">Faible</option>
                    <option value="MEDIUM">Moyen</option>
                    <option value="HIGH">Grave</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Motif *</label>
                  <input value={sanctionTitle} onChange={e => setSanctionTitle(e.target.value)} placeholder="Ex: Retard répété" className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Description</label>
                  <textarea value={sanctionDesc} onChange={e => setSanctionDesc(e.target.value)} rows={2} placeholder="Détails de l'incident..." className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] resize-none" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Points</label>
                  <input type="number" value={sanctionPoints} onChange={e => setSanctionPoints(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
                  <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED_LUXE }}>Négatif = pénalité, Positif = récompense</p>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleAddSanction} disabled={submitting || !selectedStudentId || !sanctionTitle} className="edu-gold-cta px-6 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50">
                  {submitting ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
                  Enregistrer la sanction
                </button>
                <button onClick={() => setShowSanctionForm(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)]" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
              </div>
            </div>
          )}

          {showConvocationForm && (
            <div className="bg-white border-2 border-[oklch(72%_0.15_65_/_0.3)] rounded-2xl p-6 shadow-md">
              <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
                <Megaphone size={16} style={{ color: WARNING }} /> Convocation des parents
                {selectedStudentName && <span className="text-sm font-normal" style={{ color: TEXT_MUTED_LUXE }}>— {selectedStudentName.firstName} {selectedStudentName.lastName}</span>}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Élève *</label>
                  {!selectedStudentId ? (
                    <div className="px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm" style={{ color: DANGER }}>Sélectionnez un élève ci-dessus</div>
                  ) : (
                    <div className="px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm font-medium" style={{ color: TEXT_PRIMARY, background: GOLD_SOFT }}>
                      {selectedStudentName?.firstName} {selectedStudentName?.lastName}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Date de convocation *</label>
                  <input type="datetime-local" value={convocationDate} onChange={e => setConvocationDate(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Motif *</label>
                  <textarea value={convocationMotif} onChange={e => setConvocationMotif(e.target.value)} rows={3} placeholder="Raison de la convocation..." className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] resize-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleAddConvocation} disabled={submitting || !selectedStudentId || !convocationMotif || !convocationDate} className="edu-gold-cta px-6 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50">
                  {submitting ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Send size={14} />}
                  Envoyer la convocation
                </button>
                <button onClick={() => setShowConvocationForm(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)]" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
              </div>
            </div>
          )}

          {convocations.length > 0 && (
            <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
                <Megaphone size={16} style={{ color: GOLD }} /> Convocations ({convocations.length})
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {convocations.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition">
                    <div className="w-8 h-8 rounded-full grid place-items-center text-white text-[10px] font-bold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                      {getInitials(`${c.student.firstName} ${c.student.lastName}`)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: TEXT_PRIMARY }}>{c.student.firstName} {c.student.lastName}</div>
                      <div className="text-[11px] truncate" style={{ color: TEXT_MUTED_LUXE }}>{c.motif}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{formatDate(c.date)}</div>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: c.status === 'CONFIRMED' ? SUCCESS_SOFT : GOLD_SOFT, color: c.status === 'CONFIRMED' ? SUCCESS : GOLD }}>{c.status === 'PENDING' ? 'En attente' : 'Confirmée'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isParent && myChildren.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} style={{ color: GOLD }} />
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Mes enfants</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <button
              onClick={() => { setSelectedChildId(''); setSelectedChildSearchId(null); setChildSearch('') }}
              className={`text-left p-4 rounded-2xl border-2 transition-all duration-200 edu-card-lift ${
                !selectedChildId ? 'border-[oklch(72%_0.15_65)] shadow-md' : 'border-[oklch(90%_0.01_175)] hover:border-[oklch(72%_0.15_65_/_0.4)]'
              }`}
              style={{ background: !selectedChildId ? GOLD_SOFT : 'white' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full grid place-items-center shrink-0" style={{ background: `linear-gradient(135deg, ${GOLD}, ${ACCENT})` }}>
                  <Users size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate" style={{ color: TEXT_PRIMARY }}>Tous mes enfants</div>
                  <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{myChildren.length} enfant{myChildren.length > 1 ? 's' : ''}</div>
                </div>
              </div>
            </button>
            {myChildren.map(child => {
              const fullName = `${child.firstName} ${child.lastName}`
              const initials = getInitials(fullName)
              const counts = childDisciplineCounts[child.id] || { blacklist: 0, greylist: 0, whitelist: 0, totalPoints: 0 }
              const isSelected = selectedChildId === child.id
              return (
                <button
                  key={child.id}
                  onClick={() => { setSelectedChildId(child.id); setSelectedChildSearchId(child.id); setChildSearch('') }}
                  className={`text-left p-4 rounded-2xl border-2 transition-all duration-200 edu-card-lift ${
                    isSelected ? 'border-[oklch(72%_0.15_65)] shadow-md' : 'border-[oklch(90%_0.01_175)] hover:border-[oklch(72%_0.15_65_/_0.4)]'
                  }`}
                  style={{ background: isSelected ? GOLD_SOFT : 'white' }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {child.photoUrl ? (
                      <img src={child.photoUrl} alt={fullName} className="w-11 h-11 rounded-full object-cover border-2 border-[oklch(90%_0.01_175)] shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-full grid place-items-center text-white font-bold text-sm shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, oklch(72% 0.15 65))` }}>
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate" style={{ color: TEXT_PRIMARY }}>{fullName}</div>
                      <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{child.matricule}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {counts.blacklist > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'oklch(95% 0.04 25)', color: DANGER }}>
                        <Ban size={9} /> {counts.blacklist}
                      </span>
                    )}
                    {counts.greylist > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'oklch(95% 0.04 85)', color: WARNING }}>
                        <AlertTriangle size={9} /> {counts.greylist}
                      </span>
                    )}
                    {counts.whitelist > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'oklch(95% 0.04 145)', color: SUCCESS }}>
                        <Award size={9} /> {counts.whitelist}
                      </span>
                    )}
                    {counts.blacklist === 0 && counts.greylist === 0 && counts.whitelist === 0 && (
                      <span className="text-[10px]" style={{ color: TEXT_MUTED_LUXE }}>Aucun enregistrement</span>
                    )}
                    <span className="ml-auto text-[11px] font-bold" style={{ color: counts.totalPoints > 0 ? SUCCESS : counts.totalPoints < 0 ? DANGER : TEXT_MUTED_LUXE }}>
                      {counts.totalPoints > 0 ? '+' : ''}{counts.totalPoints} pts
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="max-w-xs">
            <SearchAutocomplete
              label="Rechercher un enfant"
              placeholder="Tapez le nom de l'enfant..."
              items={childSuggestions}
              selectedId={selectedChildSearchId}
              onSelect={(item) => { setSelectedChildSearchId(item.id); setSelectedChildId(item.id) }}
              onClear={() => { setSelectedChildSearchId(null); setSelectedChildId(''); setChildSearch('') }}
              searchQuery={childSearch}
              onSearchChange={setChildSearch}
              itemTypeName="enfant"
            />
          </div>
        </div>
      )}

      {isParent && selectedChildName && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl" style={{ background: GOLD_SOFT }}>
          <div className="w-7 h-7 rounded-full grid place-items-center text-white text-[10px] font-bold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
            {getInitials(`${selectedChildName.firstName} ${selectedChildName.lastName}`)}
          </div>
          <span className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>
            Discipline de <strong>{selectedChildName.firstName} {selectedChildName.lastName}</strong>
          </span>
          <button onClick={() => { setSelectedChildId(''); setSelectedChildSearchId(null); setChildSearch('') }} className="ml-auto text-[11px] font-medium hover:underline" style={{ color: GOLD }}>
            Voir tous
          </button>
        </div>
      )}
      {isDisciplineRole && selectedStudentName && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl" style={{ background: GOLD_SOFT }}>
          <div className="w-7 h-7 rounded-full grid place-items-center text-white text-[10px] font-bold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
            {getInitials(`${selectedStudentName.firstName} ${selectedStudentName.lastName}`)}
          </div>
          <span className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>
            Discipline de <strong>{selectedStudentName.firstName} {selectedStudentName.lastName}</strong>
          </span>
          <button onClick={() => { setSelectedStudentId(null); setSelectedStudentSearchId(null); setStudentSearch('') }} className="ml-auto text-[11px] font-medium hover:underline" style={{ color: GOLD }}>
            Voir tous
          </button>
        </div>
      )}

      {isParent && convocations.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Megaphone size={14} style={{ color: WARNING }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: WARNING }}>Convocations ({convocations.length})</span>
          </div>
          <div className="space-y-2">
            {convocations.map(c => (
              <div key={c.id} className="bg-white border border-[oklch(90%_0.01_175)] rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: `${WARNING}15` }}>
                  <Megaphone size={16} style={{ color: WARNING }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{c.motif}</div>
                  <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                    {c.student.firstName} {c.student.lastName} — {new Date(c.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${c.status === 'PENDING' ? 'bg-[oklch(95%_0.08_80)] text-[oklch(55%_0.15_80)]' : c.status === 'SENT' ? 'bg-[oklch(95%_0.08_250)] text-[oklch(55%_0.15_250)]' : 'bg-[oklch(95%_0.08_145)] text-[oklch(55%_0.15_145)]'}`}>
                  {c.status === 'PENDING' ? 'En attente' : c.status === 'SENT' ? 'Envoyée' : 'Archivée'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-0.5 border-b border-[oklch(90%_0.01_175)] mb-5">
        {[
          { key: 'BLACKLIST' as const, label: 'Liste Noire', icon: <Ban size={14} />, color: DANGER },
          { key: 'GREYLIST' as const, label: 'Liste Grise', icon: <AlertTriangle size={14} />, color: WARNING },
          { key: 'WHITELIST' as const, label: 'Liste Blanche', icon: <Award size={14} />, color: SUCCESS },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setLoading(true) }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[13.5px] font-medium border-b-2 -mb-px transition ${
              tab === t.key ? 'border-current' : 'border-transparent hover:text-edu-fg'
            }`}
            style={tab === t.key ? { color: t.color, borderColor: t.color === WARNING ? GOLD : t.color } : { color: TEXT_MUTED_LUXE }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: IVORY }}>
                {!isParent && <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Élève</th>}
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Motif</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Type</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Date</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucun enregistrement</td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                  {!isParent && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full grid place-items-center text-white text-[11px] font-semibold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                          {r.student ? getInitials(`${r.student.firstName} ${r.student.lastName}`) : '??'}
                        </div>
                        <div>
                          <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{r.student ? `${r.student.firstName} ${r.student.lastName}` : '—'}</div>
                          <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{r.student?.matricule || ''}</div>
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{r.title}</td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_PRIMARY }}>{r.type}</td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    {editingRecordId === r.id ? (
                      <div className="flex items-center gap-2">
                        <input type="number" value={editPoints} onChange={e => setEditPoints(e.target.value)} className="w-16 px-2 py-1 border border-[oklch(90%_0.01_175)] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
                        <select value={editListType} onChange={e => setEditListType(e.target.value as 'BLACKLIST' | 'GREYLIST' | 'WHITELIST')} className="px-2 py-1 border border-[oklch(90%_0.01_175)] rounded-lg text-xs bg-white outline-none">
                          <option value="GREYLIST">Grise</option>
                          <option value="BLACKLIST">Noire</option>
                          <option value="WHITELIST">Blanche</option>
                        </select>
                        <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="px-2 py-1 border border-[oklch(90%_0.01_175)] rounded-lg text-xs bg-white outline-none">
                          <option value="PENDING">En attente</option>
                          <option value="CONFIRMED">Confirmé</option>
                          <option value="RESOLVED">Résolu</option>
                        </select>
                        <button onClick={handleSaveEdit} disabled={savingEdit} className="w-7 h-7 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_145)] transition" style={{ color: SUCCESS }} title="Sauvegarder">
                          {savingEdit ? <div className="h-3 w-3 border-2 border-[oklch(40%_0.13_145)] border-t-transparent rounded-full animate-spin" /> : <Check size={13} />}
                        </button>
                        <button onClick={() => setEditingRecordId(null)} className="w-7 h-7 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_25)] transition" style={{ color: DANGER }} title="Annuler">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold" style={{ color: r.points > 0 ? SUCCESS : DANGER }}>{r.points > 0 ? '+' : ''}{r.points}</span>
                        {isDisciplineRole && (
                          <button onClick={() => handleEditRecord(r)} className="w-7 h-7 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: TEXT_MUTED_LUXE }} title="Modifier">
                            <Edit size={13} />
                          </button>
                        )}
                      </div>
                    )}
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
