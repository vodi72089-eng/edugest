'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Search, CreditCard, ArrowLeft, User, Phone, GraduationCap, Calendar, FileText, CheckCircle, XCircle, Clock } from 'lucide-react'
import StudentAvatar from '@/components/ui/StudentAvatar'
import { authFetch, useEduGestStore } from '@/lib/store'

const COLORS = {
  bg: '#f8f9fa',
  card: '#ffffff',
  primary: '#F5A623',
  text: '#1a1a2e',
  textMuted: '#6c757d',
  border: '#e9ecef',
  danger: '#dc3545',
  success: '#28a745',
  warning: '#ffc107',
}

interface DebtStudent {
  id: string
  student: {
    id: string
    firstName: string
    lastName: string
    matricule: string
    photoUrl: string | null
    parentId: string | null
    parent: {
      id: string
      name: string
      phone: string | null
    } | null
    class: {
      id: string
      name: string
      section: string
    } | null
  }
  amount: number
  paidAmount: number
  remaining: number
  trimester: string
  status: string
  paymentMethod: string | null
  createdAt: string
}

interface GroupedStudent {
  student: DebtStudent['student']
  debts: DebtStudent[]
  totalRemaining: number
  totalAmount: number
  totalPaid: number
}

interface DettesViewProps {
  onNavigate: (view: string) => void
  schoolId: string
}

export default function DettesView({ onNavigate, schoolId }: DettesViewProps) {
  const [debts, setDebts] = useState<DebtStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<GroupedStudent | null>(null)
  const { setPendingPaymentStudent } = useEduGestStore()

  const fetchDebts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await authFetch(`/api/debts?schoolId=${schoolId}`)
      if (res.ok) {
        const data = await res.json()
        setDebts(data)
      }
    } catch (err) {
      console.error('Error fetching debts:', err)
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => {
    fetchDebts()
  }, [fetchDebts])

  // Group debts by student
  const grouped: GroupedStudent[] = []
  const studentMap = new Map<string, GroupedStudent>()
  for (const debt of debts) {
    const sid = debt.student.id
    if (!studentMap.has(sid)) {
      const group: GroupedStudent = {
        student: debt.student,
        debts: [],
        totalRemaining: 0,
        totalAmount: 0,
        totalPaid: 0,
      }
      studentMap.set(sid, group)
      grouped.push(group)
    }
    const g = studentMap.get(sid)!
    g.debts.push(debt)
    g.totalRemaining += debt.remaining
    g.totalAmount += debt.amount
    g.totalPaid += debt.paidAmount
  }

  const filtered = grouped.filter((g) => {
    const q = search.toLowerCase()
    return (
      g.student.firstName.toLowerCase().includes(q) ||
      g.student.lastName.toLowerCase().includes(q) ||
      g.student.matricule.toLowerCase().includes(q) ||
      g.student.class?.name.toLowerCase().includes(q)
    )
  })

  const totalRemaining = grouped.reduce((sum, g) => sum + g.totalRemaining, 0)
  const uniqueStudents = grouped.length

  if (selectedGroup) {
    return (
      <StudentDetail
        group={selectedGroup}
        onBack={() => setSelectedGroup(null)}
        onPay={(debt) => {
          setPendingPaymentStudent({
            id: selectedGroup.student.id,
            firstName: selectedGroup.student.firstName,
            lastName: selectedGroup.student.lastName,
            matricule: selectedGroup.student.matricule,
            classId: selectedGroup.student.class?.id,
            tranche: debt.trimester,
            amount: debt.remaining,
          })
          setSelectedGroup(null)
          onNavigate('payments')
        }}
        schoolId={schoolId}
      />
    )
  }

  return (
    <div style={{ background: COLORS.bg, minHeight: '100vh', padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <AlertTriangle size={24} color={COLORS.danger} />
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: COLORS.text, margin: 0 }}>
              Dettes
            </h1>
            <p style={{ color: COLORS.textMuted, margin: 0, fontSize: '14px' }}>
              {uniqueStudents} élève{uniqueStudents > 1 ? 's' : ''} en dette — {totalRemaining.toLocaleString('fr-FR')} CDF restant
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={16} color={COLORS.textMuted} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Rechercher un élève..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                border: `1px solid ${COLORS.border}`,
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: COLORS.textMuted }}>
            Chargement...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: COLORS.textMuted, background: COLORS.card, borderRadius: '12px' }}>
            <AlertTriangle size={48} color={COLORS.success} style={{ marginBottom: '12px' }} />
            <p style={{ fontSize: '16px', fontWeight: '600', color: COLORS.success }}>
              Aucune dette trouvée
            </p>
            <p style={{ fontSize: '14px', marginTop: '4px' }}>
              Tous les paiements sont à jour
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map((group) => (
              <div
                key={group.student.id}
                onClick={() => setSelectedGroup(group)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '16px',
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.danger
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(220,53,69,0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <StudentAvatar firstName={group.student.firstName} lastName={group.student.lastName} photoUrl={group.student.photoUrl} size={48} className="text-white font-bold" style={{ background: COLORS.danger }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', color: COLORS.text }}>
                    {group.student.firstName} {group.student.lastName}
                  </div>
                  <div style={{ fontSize: '13px', color: COLORS.textMuted }}>
                    {group.student.matricule} — {group.student.class?.name || 'N/A'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {group.debts.map((d) => (
                    <span
                      key={d.trimester}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        background: d.status === 'PARTIAL' ? '#fff3cd' : '#f8d7da',
                        color: d.status === 'PARTIAL' ? '#856404' : '#721c24',
                      }}
                    >
                      {d.trimester}
                    </span>
                  ))}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: '700', color: COLORS.danger, fontSize: '16px' }}>
                    {group.totalRemaining.toLocaleString('fr-FR')} CDF
                  </div>
                  <div style={{ fontSize: '12px', color: COLORS.textMuted }}>
                    Payé: {group.totalPaid.toLocaleString('fr-FR')} / {group.totalAmount.toLocaleString('fr-FR')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface TrancheInfo {
  trimester: string
  totalFee: number
  paidAmount: number
  remaining: number
  status: string
}

function StudentDetail({ group, onBack, onPay, schoolId }: { group: GroupedStudent; onBack: () => void; onPay: (debt: DebtStudent) => void; schoolId: string }) {
  const student = group.student
  const parent = student.parent
  const [sommationLoading, setSommationLoading] = useState(false)
  const [allTranches, setAllTranches] = useState<TrancheInfo[]>([])
  const [loadingTranches, setLoadingTranches] = useState(true)

  useEffect(() => {
    if (!student.class?.id) { setLoadingTranches(false); return }
    let cancelled = false
    const load = async () => {
      try {
        const [feesRes, paysRes] = await Promise.all([
          authFetch(`/api/school-fees?schoolId=${schoolId}&classId=${student.class!.id}`),
          authFetch(`/api/payments?studentId=${student.id}&limit=100`),
        ])
        const feesJson = await feesRes.json()
        const paysJson = await paysRes.json()
        const fees: any[] = feesJson.data || []
        const pays: any[] = paysJson.data || []

        const trimesterNames = [...new Set(fees.map((f: any) => f.trimester))].sort()
        const result: TrancheInfo[] = trimesterNames.map(name => {
          const feesForTri = fees.filter((f: any) => f.trimester === name)
          const totalFee = feesForTri.reduce((s: number, f: any) => s + f.amount, 0)
          const paid = pays
            .filter((p: any) => p.trimester === name && (p.status === 'PAID' || p.status === 'PARTIAL'))
            .reduce((s: number, p: any) => s + (p.paidAmount || 0), 0)
          const remaining = Math.max(0, totalFee - paid)
          let status = 'PENDING'
          if (paid >= totalFee && totalFee > 0) status = 'PAID'
          else if (paid > 0) status = 'PARTIAL'
          return { trimester: name, totalFee, paidAmount: paid, remaining, status }
        })
        if (!cancelled) setAllTranches(result)
      } catch {
        if (!cancelled) setAllTranches([])
      } finally {
        if (!cancelled) setLoadingTranches(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [student.id, student.class?.id, schoolId])

  const getTrancheStatus = (status: string) => {
    switch (status) {
      case 'PAID': return { icon: <CheckCircle size={14} />, color: COLORS.success, bg: '#dcfce7', label: 'Payé' }
      case 'PARTIAL': return { icon: <Clock size={14} />, color: '#856404', bg: '#fff3cd', label: 'Partiel' }
      case 'PENDING': return { icon: <XCircle size={14} />, color: COLORS.danger, bg: '#f8d7da', label: 'Impayé' }
      default: return { icon: <Clock size={14} />, color: COLORS.textMuted, bg: '#e9ecef', label: status }
    }
  }

  const getTrancheLabel = (t: string) => {
    const map: Record<string, string> = { T1: '1er Trimestre', T2: '2ème Trimestre', T3: '3ème Trimestre', T4: '4ème Trimestre' }
    return map[t] || t
  }

  const unpaidCount = allTranches.filter(t => t.status !== 'PAID').length
  const totalAll = allTranches.reduce((s, t) => s + t.totalFee, 0)
  const paidAll = allTranches.reduce((s, t) => s + t.paidAmount, 0)
  const remainingAll = allTranches.reduce((s, t) => s + t.remaining, 0)

  const handleSommation = async () => {
    const unpaidDebts = allTranches.filter(t => t.remaining > 0)
    if (unpaidDebts.length === 0) { alert('Aucun impayé'); return }
    try {
      setSommationLoading(true)
      const res = await authFetch(`/api/sommation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          schoolId,
          debts: unpaidDebts.map(d => ({
            trimester: d.trimester,
            amount: d.totalFee,
            paidAmount: d.paidAmount,
            remaining: d.remaining,
            status: d.status,
          })),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error || 'Erreur lors de la génération')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sommation-${student.lastName}-${student.firstName}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      alert('Erreur réseau lors de la génération de la sommation')
    } finally {
      setSommationLoading(false)
    }
  }

  const firstUnpaid = allTranches.find(t => t.status !== 'PAID')

  return (
    <div style={{ background: COLORS.bg, minHeight: '100vh', padding: '24px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: COLORS.textMuted,
            cursor: 'pointer',
            fontSize: '14px',
            marginBottom: '20px',
            padding: 0,
          }}
        >
          <ArrowLeft size={16} /> Retour
        </button>

        {/* Student Info */}
        <div style={{ background: COLORS.card, borderRadius: '16px', padding: '24px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <StudentAvatar firstName={student.firstName} lastName={student.lastName} photoUrl={student.photoUrl} size={80} className="text-white font-bold text-3xl border-4" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.danger})`, borderColor: 'white' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: COLORS.text }}>
                {student.firstName} {student.lastName}
              </h2>
              <div style={{ color: COLORS.textMuted, fontSize: '14px', marginTop: '2px' }}>
                {student.matricule}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ padding: '12px', background: COLORS.bg, borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <GraduationCap size={14} color={COLORS.textMuted} />
                <span style={{ fontSize: '12px', color: COLORS.textMuted }}>Classe</span>
              </div>
              <div style={{ fontWeight: '600', color: COLORS.text }}>
                {student.class?.name || 'N/A'} — {student.class?.section || ''}
              </div>
            </div>
            <div style={{ padding: '12px', background: COLORS.bg, borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Calendar size={14} color={COLORS.textMuted} />
                <span style={{ fontSize: '12px', color: COLORS.textMuted }}>Tranches configurées</span>
              </div>
              <div style={{ fontWeight: '600', color: unpaidCount > 0 ? COLORS.danger : COLORS.success }}>
                {allTranches.length} tranche{allTranches.length > 1 ? 's' : ''} — {unpaidCount > 0 ? `${unpaidCount} impayée${unpaidCount > 1 ? 's' : ''}` : 'Tout payé'}
              </div>
            </div>
          </div>
        </div>

        {/* Parent */}
        {parent && (
          <div style={{ background: COLORS.card, borderRadius: '16px', padding: '24px', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: '600', color: COLORS.text }}>
              Parent
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: '#6366f1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                {parent.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || <User size={16} />}
              </div>
              <div>
                <div style={{ fontWeight: '600', color: COLORS.text }}>{parent.name}</div>
                {parent.phone && (
                  <div style={{ fontSize: '13px', color: COLORS.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Phone size={12} /> {parent.phone}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* All Tranches Status */}
        <div
          style={{
            background: COLORS.card,
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '20px',
            borderLeft: `4px solid ${unpaidCount > 0 ? COLORS.danger : COLORS.success}`,
          }}
        >
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: COLORS.text }}>
            État des tranches
          </h3>

          {loadingTranches ? (
            <div style={{ textAlign: 'center', padding: '30px', color: COLORS.textMuted }}>Chargement des tranches...</div>
          ) : allTranches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: COLORS.textMuted }}>Aucun frais configuré pour cette classe</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {allTranches.map((tranche) => {
                const st = getTrancheStatus(tranche.status)
                const pct = tranche.totalFee > 0 ? Math.round((tranche.paidAmount / tranche.totalFee) * 100) : 0
                const isPaid = tranche.status === 'PAID'
                return (
                  <div
                    key={tranche.trimester}
                    style={{
                      border: `1px solid ${isPaid ? COLORS.success : COLORS.border}`,
                      borderRadius: '12px',
                      padding: '16px',
                      background: isPaid ? '#f0fdf4' : COLORS.bg,
                      opacity: isPaid ? 0.7 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '700', fontSize: '15px', color: COLORS.text }}>
                          {getTrancheLabel(tranche.trimester)}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 10px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: st.bg,
                            color: st.color,
                          }}
                        >
                          {st.icon}
                          {st.label}
                        </span>
                      </div>
                      {!isPaid && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onPay({
                              id: `${student.id}-${tranche.trimester}`,
                              student,
                              amount: tranche.totalFee,
                              paidAmount: tranche.paidAmount,
                              remaining: tranche.remaining,
                              trimester: tranche.trimester,
                              status: tranche.status,
                              paymentMethod: null,
                              createdAt: new Date().toISOString(),
                            })
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            background: COLORS.primary,
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                          }}
                        >
                          <CreditCard size={12} />
                          Payer
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: COLORS.textMuted }}>Montant</div>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: COLORS.text }}>
                          {tranche.totalFee.toLocaleString('fr-FR')} CDF
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: COLORS.textMuted }}>Payé</div>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: COLORS.success }}>
                          {tranche.paidAmount.toLocaleString('fr-FR')} CDF
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: COLORS.textMuted }}>Restant</div>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: isPaid ? COLORS.success : COLORS.danger }}>
                          {tranche.remaining.toLocaleString('fr-FR')} CDF
                        </div>
                      </div>
                    </div>

                    <div style={{ height: '6px', background: '#e9ecef', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: pct >= 100 ? COLORS.success : pct > 0 ? COLORS.warning : COLORS.danger,
                          borderRadius: '3px',
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: '4px', textAlign: 'right' }}>
                      {pct}% payé
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Total summary */}
          {allTranches.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '16px',
                marginTop: '20px',
                padding: '16px',
                background: COLORS.card,
                borderRadius: '12px',
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: COLORS.textMuted, marginBottom: '4px' }}>Total à payer</div>
                <div style={{ fontWeight: '700', fontSize: '16px', color: COLORS.text }}>
                  {totalAll.toLocaleString('fr-FR')} CDF
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: COLORS.textMuted, marginBottom: '4px' }}>Total payé</div>
                <div style={{ fontWeight: '700', fontSize: '16px', color: COLORS.success }}>
                  {paidAll.toLocaleString('fr-FR')} CDF
                </div>
              </div>
              <div style={{ textAlign: 'center', background: remainingAll > 0 ? '#fff3cd' : '#dcfce7', borderRadius: '8px', padding: '8px' }}>
                <div style={{ fontSize: '12px', color: COLORS.textMuted, marginBottom: '4px' }}>Total restant</div>
                <div style={{ fontWeight: '700', fontSize: '16px', color: remainingAll > 0 ? COLORS.danger : COLORS.success }}>
                  {remainingAll.toLocaleString('fr-FR')} CDF
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {remainingAll > 0 && (
            <button
              onClick={handleSommation}
              disabled={sommationLoading}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '14px',
                background: COLORS.card,
                color: COLORS.danger,
                border: `2px solid ${COLORS.danger}`,
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: sommationLoading ? 'not-allowed' : 'pointer',
                opacity: sommationLoading ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { if (!sommationLoading) { e.currentTarget.style.background = COLORS.danger; e.currentTarget.style.color = 'white' } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.card; e.currentTarget.style.color = COLORS.danger }}
            >
              <FileText size={18} />
              {sommationLoading ? 'Génération...' : 'Sommation'}
            </button>
          )}

          {firstUnpaid && (
            <button
              onClick={() => onPay({
                id: `${student.id}-${firstUnpaid.trimester}`,
                student,
                amount: firstUnpaid.totalFee,
                paidAmount: firstUnpaid.paidAmount,
                remaining: firstUnpaid.remaining,
                trimester: firstUnpaid.trimester,
                status: firstUnpaid.status,
                paymentMethod: null,
                createdAt: new Date().toISOString(),
              })}
              style={{
                flex: remainingAll > 0 ? 2 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '14px',
                background: COLORS.primary,
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              <CreditCard size={18} />
              Effectuer un paiement
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
