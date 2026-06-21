'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Search, CreditCard, ArrowLeft, User, Phone, GraduationCap, Calendar } from 'lucide-react'

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

interface DettesViewProps {
  onNavigate: (view: string) => void
  schoolId: string
}

export default function DettesView({ onNavigate, schoolId }: DettesViewProps) {
  const [debts, setDebts] = useState<DebtStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedDebt, setSelectedDebt] = useState<DebtStudent | null>(null)

  const fetchDebts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/debts?schoolId=${schoolId}`)
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

  const filtered = debts.filter((d) => {
    const q = search.toLowerCase()
    return (
      d.student.firstName.toLowerCase().includes(q) ||
      d.student.lastName.toLowerCase().includes(q) ||
      d.student.matricule.toLowerCase().includes(q) ||
      d.student.class?.name.toLowerCase().includes(q)
    )
  })

  const totalRemaining = debts.reduce((sum, d) => sum + d.remaining, 0)
  const uniqueStudents = [...new Set(debts.map((d) => d.student.id))].length

  if (selectedDebt) {
    return (
      <StudentDetail
        debt={selectedDebt}
        onBack={() => setSelectedDebt(null)}
        onPay={() => {
          setSelectedDebt(null)
          onNavigate('payments')
        }}
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
            {filtered.map((debt) => (
              <div
                key={debt.id}
                onClick={() => setSelectedDebt(debt)}
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
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: debt.student.photoUrl ? 'transparent' : COLORS.danger,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {debt.student.photoUrl ? (
                    <img src={debt.student.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    `${debt.student.firstName[0]}${debt.student.lastName[0]}`
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', color: COLORS.text }}>
                    {debt.student.firstName} {debt.student.lastName}
                  </div>
                  <div style={{ fontSize: '13px', color: COLORS.textMuted }}>
                    {debt.student.matricule} — {debt.student.class?.name || 'N/A'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: '700', color: COLORS.danger, fontSize: '16px' }}>
                    {debt.remaining.toLocaleString('fr-FR')} CDF
                  </div>
                  <div style={{ fontSize: '12px', color: COLORS.textMuted }}>
                    Payé: {debt.paidAmount.toLocaleString('fr-FR')} / {debt.amount.toLocaleString('fr-FR')}
                  </div>
                </div>
                <div
                  style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: debt.status === 'PENDING' ? '#fff3cd' : '#f8d7da',
                    color: debt.status === 'PENDING' ? '#856404' : '#721c24',
                  }}
                >
                  {debt.trimester}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StudentDetail({ debt, onBack, onPay }: { debt: DebtStudent; onBack: () => void; onPay: () => void }) {
  const student = debt.student
  const parent = student.parent

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

        <div style={{ background: COLORS.card, borderRadius: '16px', padding: '24px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: student.photoUrl ? 'transparent' : COLORS.danger,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '20px',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {student.photoUrl ? (
                <img src={student.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                `${student.firstName[0]}${student.lastName[0]}`
              )}
            </div>
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
                <span style={{ fontSize: '12px', color: COLORS.textMuted }}>Trimestre</span>
              </div>
              <div style={{ fontWeight: '600', color: COLORS.text }}>{debt.trimester}</div>
            </div>
          </div>
        </div>

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

        <div
          style={{
            background: COLORS.card,
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '20px',
            borderLeft: `4px solid ${COLORS.danger}`,
          }}
        >
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: COLORS.text }}>
            Détail de la dette
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div style={{ textAlign: 'center', padding: '12px', background: '#f8f9fa', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: COLORS.textMuted, marginBottom: '4px' }}>Montant total</div>
              <div style={{ fontWeight: '700', fontSize: '16px', color: COLORS.text }}>
                {debt.amount.toLocaleString('fr-FR')} CDF
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', background: '#f8f9fa', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: COLORS.textMuted, marginBottom: '4px' }}>Payé</div>
              <div style={{ fontWeight: '700', fontSize: '16px', color: COLORS.success }}>
                {debt.paidAmount.toLocaleString('fr-FR')} CDF
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', background: '#fff3cd', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: COLORS.textMuted, marginBottom: '4px' }}>Restant</div>
              <div style={{ fontWeight: '700', fontSize: '16px', color: COLORS.danger }}>
                {debt.remaining.toLocaleString('fr-FR')} CDF
              </div>
            </div>
          </div>
          <div style={{ height: '8px', background: '#e9ecef', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min((debt.paidAmount / debt.amount) * 100, 100)}%`,
                background: COLORS.success,
                borderRadius: '4px',
              }}
            />
          </div>
        </div>

        <button
          onClick={onPay}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
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
      </div>
    </div>
  )
}
