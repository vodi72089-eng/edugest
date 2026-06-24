'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, SUCCESS, DANGER } from '@/lib/constants'
import { getInitials, formatNumber } from '@/lib/helpers'
import { CreditCard, Smartphone, CheckCircle, ArrowLeft, Loader2, Download, FileText } from 'lucide-react'
import { toast } from 'sonner'
import SearchAutocomplete, { AutocompleteItem } from './SearchAutocomplete'
import type { StudentData } from '@/lib/types'

type PaymentStep = 'select' | 'confirm' | 'success'

export default function OnlinePaymentView() {
  const { userData } = useEduGestStore()
  const [step, setStep] = useState<PaymentStep>('select')
  const [children, setChildren] = useState<StudentData[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [studentSuggestions, setStudentSuggestions] = useState<AutocompleteItem[]>([])
  const [studentSearchLoading, setStudentSearchLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('ORANGE_MONEY')
  const [phone, setPhone] = useState('')
  const [trimester, setTrimester] = useState('T1')

  // Result state
  const [resultRef, setResultRef] = useState('')
  const [resultAmount, setResultAmount] = useState(0)
  const [resultStudent, setResultStudent] = useState('')
  const [resultPaymentId, setResultPaymentId] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)

  // Fetch children
  useEffect(() => {
    if (!userData?.id) return
    authFetch(`/api/students?parentId=${userData.id}&limit=20`)
      .then(r => r.json())
      .then(j => {
        const data = j.data || []
        setChildren(data)
        setStudentSuggestions(data.map((s: StudentData) => ({
          id: s.id, label: `${s.firstName} ${s.lastName}`, sublabel: s.matricule, photoUrl: s.photoUrl
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [userData?.id])

  // Search students
  useEffect(() => {
    if (studentSearch.length < 2) return
    const timer = setTimeout(() => {
      setStudentSearchLoading(true)
      authFetch(`/api/students?search=${encodeURIComponent(studentSearch)}&parentId=${userData?.id}&limit=8`)
        .then(r => r.json())
        .then(j => {
          const data = j.data || []
          setStudentSuggestions(data.map((s: StudentData) => ({
            id: s.id, label: `${s.firstName} ${s.lastName}`, sublabel: s.matricule, photoUrl: s.photoUrl
          })))
          setStudentSearchLoading(false)
        })
        .catch(() => setStudentSearchLoading(false))
    }, 300)
    return () => { clearTimeout(timer); setStudentSearchLoading(false) }
  }, [studentSearch, userData?.id])

  function handleSelectStudent(item: AutocompleteItem) {
    setSelectedStudentId(item.id)
    const found = children.find(s => s.id === item.id) || null
    setSelectedStudent(found)
    setStudentSearch('')
  }

  async function handleSubmit() {
    if (!selectedStudentId) { toast.error('Sélectionnez un élève'); return }
    if (!amount || Number(amount) <= 0) { toast.error('Entrez un montant valide'); return }
    if (!phone.trim()) { toast.error('Entrez votre numéro de téléphone'); return }

    setSubmitting(true)
    try {
      const res = await authFetch('/api/payments/online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudentId,
          amount: Number(amount),
          paymentMethod,
          phone: phone.trim(),
          trimester,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setResultRef(json.data.referenceNumber)
        setResultAmount(Number(amount))
        setResultStudent(`${json.data.student.firstName} ${json.data.student.lastName}`)
        setResultPaymentId(json.data.id)
        setStep('success')
        toast.success('Paiement enregistré avec succès!')
      } else {
        toast.error(json.error || 'Erreur lors de l\'enregistrement')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  function handleReset() {
    setStep('select')
    setSelectedStudentId(null)
    setSelectedStudent(null)
    setAmount('')
    setPhone('')
    setResultRef('')
    setResultPaymentId('')
  }

  async function downloadReceipt() {
    if (!resultPaymentId) return
    setPdfLoading(true)
    try {
      const res = await authFetch(`/api/payments/receipt/${resultPaymentId}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recu-${resultRef || resultPaymentId.slice(-8)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Reçu téléchargé avec succès!')
    } catch {
      toast.error('Erreur lors du téléchargement du reçu')
    } finally {
      setPdfLoading(false)
    }
  }

  const methodLabels: Record<string, { label: string; color: string; icon: string; svg: string }> = {
    ORANGE_MONEY: { label: 'Orange Money', color: '#FF6600', icon: '🟠', svg: '/logos/orange-money.svg' },
    MPESA: { label: 'M-Pesa', color: '#00A651', icon: '🟢', svg: '/logos/m-pesa.svg' },
    AIRTEL_MONEY: { label: 'Airtel Money', color: '#E40000', icon: '🔴', svg: '/logos/airtel-money.svg' },
  }

  if (step === 'success') {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-8 rounded-full" style={{ background: SUCCESS }} />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Paiement enregistré</h1>
        </div>
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-8 shadow-sm text-center max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 grid place-items-center" style={{ background: 'oklch(94% 0.05 145)' }}>
            <CheckCircle size={32} style={{ color: SUCCESS }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: TEXT_PRIMARY }}>Demande de paiement envoyée</h2>
          <p className="text-sm mb-6" style={{ color: TEXT_MUTED_LUXE }}>
            Votre paiement est en attente de confirmation par le caissier de l&apos;école.
          </p>
          <div className="bg-[oklch(97%_0.005_175)] rounded-xl p-4 mb-6 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: TEXT_MUTED_LUXE }}>Élève</span>
              <span className="font-medium" style={{ color: TEXT_PRIMARY }}>{resultStudent}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: TEXT_MUTED_LUXE }}>Montant</span>
              <span className="font-semibold" style={{ color: GOLD }}>{formatNumber(resultAmount)} CDF</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: TEXT_MUTED_LUXE }}>Référence</span>
              <span className="font-mono text-xs font-medium" style={{ color: ACCENT }}>{resultRef}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: TEXT_MUTED_LUXE }}>Statut</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[oklch(94%_0.06_65)] text-[oklch(45%_0.13_65)]">
                En attente
              </span>
            </div>
          </div>
          <p className="text-xs mb-4" style={{ color: TEXT_MUTED_LUXE }}>
            Conservez cette référence pour suivre votre paiement. Le caissier vérifiera et confirmera le paiement.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={downloadReceipt}
              disabled={pdfLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}
            >
              {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Télécharger le reçu
            </button>
            <button onClick={handleReset} className="edu-gold-cta px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
              <CreditCard size={14} /> Effectuer un autre paiement
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Payer en ligne</h1>
      </div>

      {loading ? (
        <div className="text-center py-12" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div>
      ) : children.length === 0 ? (
        <div className="text-center py-12 bg-white border border-[oklch(90%_0.01_175)] rounded-2xl">
          <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Aucun enfant associé à votre compte.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payment Form */}
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid ${GOLD}` }}>
            <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
              <CreditCard size={16} style={{ color: GOLD }} /> Informations de paiement
            </h3>
            <div className="space-y-4">
              <SearchAutocomplete
                label="Élève *"
                placeholder="Tapez le nom de l'élève..."
                items={studentSuggestions}
                selectedId={selectedStudentId}
                onSelect={handleSelectStudent}
                onClear={() => { setSelectedStudentId(null); setSelectedStudent(null); setStudentSearch('') }}
                searchQuery={studentSearch}
                onSearchChange={(v) => { setStudentSearch(v); setSelectedStudent(null); setSelectedStudentId(null) }}
                loading={studentSearchLoading}
                itemTypeName="élève"
              />

              <div>
                <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Trimestre *</label>
                <select value={trimester} onChange={e => setTrimester(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                  <option value="T1">Trimestre 1</option>
                  <option value="T2">Trimestre 2</option>
                  <option value="T3">Trimestre 3</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Montant (CDF) *</label>
                <input
                  placeholder="Entrez le montant à payer"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  type="number"
                  min="1"
                  className="w-full mt-1 px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]"
                />
              </div>

              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: TEXT_MUTED_LUXE }}>Méthode de paiement *</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(methodLabels).map(([key, info]) => (
                    <button
                      key={key}
                      onClick={() => setPaymentMethod(key)}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        paymentMethod === key
                          ? 'border-[oklch(72%_0.15_65)] shadow-md'
                          : 'border-[oklch(90%_0.01_175)] hover:border-[oklch(72%_0.15_65_/_0.4)]'
                      }`}
                      style={{ background: paymentMethod === key ? 'oklch(97% 0.005 175)' : 'white' }}
                    >
                      <img src={info.svg} alt={info.label} className="w-8 h-8 mx-auto mb-1 rounded-lg object-cover" />
                      <div className="text-[11px] font-semibold" style={{ color: TEXT_PRIMARY }}>{info.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Numéro de téléphone *</label>
                <div className="flex items-center gap-2 mt-1">
                  <Smartphone size={16} style={{ color: TEXT_MUTED_LUXE }} />
                  <input
                    placeholder="+243 ..."
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    type="tel"
                    className="flex-1 px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]"
                  />
                </div>
                <p className="text-[11px] mt-1" style={{ color: TEXT_MUTED_LUXE }}>
                  Le numéro associé à votre compte {methodLabels[paymentMethod]?.label}
                </p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || !selectedStudentId || !amount || !phone}
                className="w-full edu-gold-cta px-6 py-3 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <><Loader2 size={16} className="animate-spin" /> Traitement en cours...</>
                ) : (
                  <><CreditCard size={16} /> Payer {amount ? `${formatNumber(Number(amount))} CDF` : ''}</>
                )}
              </button>
            </div>
          </div>

          {/* Info Panel */}
          <div className="space-y-4">
            <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
              <h3 className="font-semibold mb-3" style={{ color: TEXT_PRIMARY }}>Comment ça marche ?</h3>
              <div className="space-y-3">
                {[
                  { step: '1', text: 'Sélectionnez l\'élève et le trimestre' },
                  { step: '2', text: 'Entrez le montant et choisissez la méthode' },
                  { step: '3', text: 'Le caissier reçoit la demande et vérifie le paiement' },
                  { step: '4', text: 'Une fois confirmé, le reçu est généré automatiquement' },
                ].map(s => (
                  <div key={s.step} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0" style={{ background: GOLD }}>
                      {s.step}
                    </div>
                    <p className="text-[13px] pt-0.5" style={{ color: TEXT_PRIMARY }}>{s.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
              <h3 className="font-semibold mb-3" style={{ color: TEXT_PRIMARY }}>Méthodes acceptées</h3>
              <div className="space-y-2">
                {Object.entries(methodLabels).map(([key, info]) => (
                  <div key={key} className="flex items-center gap-2.5 p-2 rounded-lg" style={{ background: paymentMethod === key ? 'oklch(97% 0.005 175)' : 'transparent' }}>
                    <img src={info.svg} alt={info.label} className="w-6 h-6 rounded-md object-cover shrink-0" />
                    <span className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{info.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
