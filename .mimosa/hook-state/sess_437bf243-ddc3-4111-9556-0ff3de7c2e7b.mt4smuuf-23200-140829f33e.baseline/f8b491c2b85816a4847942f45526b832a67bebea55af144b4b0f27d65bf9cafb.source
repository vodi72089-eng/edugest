'use client'

import { useState, useEffect, useRef } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import type { PaymentData, StudentData } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY, SUCCESS } from '@/lib/constants'
import { getInitials, formatNumber, getStatusPill, getEffectiveStatus } from '@/lib/helpers'
import StudentAvatar from '@/components/ui/StudentAvatar'
import { CreditCard, FileText, Download, X, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import SearchAutocomplete, { AutocompleteItem } from './SearchAutocomplete'
import { SUPPORTED_CURRENCIES } from '@/lib/exchange-rate'

export default function PaymentsView() {
  const [payments, setPayments] = useState<PaymentData[]>([])
  const [loading, setLoading] = useState(true)
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<{id: string; firstName: string; lastName: string; matricule: string; classId?: string} | null>(null)
  const [studentSuggestions, setStudentSuggestions] = useState<AutocompleteItem[]>([])
  const [studentSearchLoading, setStudentSearchLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [tranche, setTranche] = useState('Tranche 1')
  const [method, setMethod] = useState('CASH')
  const [status, setStatus] = useState('PAID')
  const [submitting, setSubmitting] = useState(false)
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null)
  const [classFees, setClassFees] = useState<any[]>([])
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [payCurrency, setPayCurrency] = useState('CDF')
  const [payConvertedAmount, setPayConvertedAmount] = useState<string>('')
  const [amountConverted, setAmountConverted] = useState<string>('')
  const [currencyConfig, setCurrencyConfig] = useState<any>(null)
  const [allPaid, setAllPaid] = useState(false)
  const [studentPayments, setStudentPayments] = useState<PaymentData[]>([])
  const [modalStudent, setModalStudent] = useState<{id: string; firstName: string; lastName: string; matricule: string; tranche: string; remaining: number; amount: number} | null>(null)
  const { userData, userRole, highlightedId, pendingPaymentStudent, setPendingPaymentStudent } = useEduGestStore()
  const isParent = userRole === 'PARENT'
  const highlightedRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (highlightedId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightedId])

  // Pre-fill form when coming from Dettes or other views
  useEffect(() => {
    if (pendingPaymentStudent) {
      setSelectedStudentId(pendingPaymentStudent.id)
      setSelectedStudent({
        id: pendingPaymentStudent.id,
        firstName: pendingPaymentStudent.firstName,
        lastName: pendingPaymentStudent.lastName,
        matricule: pendingPaymentStudent.matricule,
        classId: pendingPaymentStudent.classId,
      })
      setStudentSuggestions([{
        id: pendingPaymentStudent.id,
        label: `${pendingPaymentStudent.firstName} ${pendingPaymentStudent.lastName}`,
        sublabel: pendingPaymentStudent.matricule,
      }])
      if (pendingPaymentStudent.tranche) setTranche(pendingPaymentStudent.tranche)
      if (pendingPaymentStudent.amount) setAmount(String(pendingPaymentStudent.amount))
      setAllPaid(false)
      setPendingPaymentStudent(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [pendingPaymentStudent, setPendingPaymentStudent])

  useEffect(() => {
    if (isParent && userData?.id) {
      authFetch(`/api/students?parentId=${userData.id}&limit=20`)
        .then(r => r.json())
        .then(async j => {
          const children = j.data || []
          if (children.length > 0) {
            const allPayments: PaymentData[] = []
            for (const child of children) {
              try {
                const pRes = await authFetch(`/api/payments?studentId=${child.id}&limit=30`)
                const pJson = await pRes.json()
                if (pJson.data) allPayments.push(...pJson.data)
              } catch { /* skip */ }
            }
            setPayments(allPayments)
          }
          setLoading(false)
        })
        .catch(() => setLoading(false))
    } else {
      authFetch(`/api/payments?limit=30${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`).then(r => r.json()).then(j => { setPayments(j.data || []); setLoading(false) }).catch(() => setLoading(false))
    }
  }, [isParent, userData?.id, userData?.schoolId])

  useEffect(() => {
    if (studentSearch.length < 2) return
    const timer = setTimeout(() => {
      setStudentSearchLoading(true)
      authFetch(`/api/students?search=${encodeURIComponent(studentSearch)}&limit=8`)
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
  }, [studentSearch])

  // Fetch class fees + student payments + auto-select tranche
  useEffect(() => {
    if (!selectedStudent?.classId || !userData?.schoolId) {
      setClassFees([]); setAllPaid(false); setStudentPayments([]); setTranche(''); setAmount(''); setPaidAmount(''); setPayCurrency('CDF'); setPayConvertedAmount(''); return
    }
    const load = async () => {
      try {
        // 1. Fetch all fees for this class (all trimesters/tranches)
        const feesRes = await authFetch(`/api/school-fees?schoolId=${userData.schoolId}&classId=${selectedStudent.classId}`)
        const feesJson = await feesRes.json()
        const allFees: any[] = feesJson.data || []

        // 2. Fetch student's payment history
        const payRes = await authFetch(`/api/payments?studentId=${selectedStudent.id}&limit=100`)
        const payJson = await payRes.json()
        const pays: PaymentData[] = payJson.data || []
        setStudentPayments(pays)

        // 3. Group fees by trimester (tranche name)
        const trancheNames = [...new Set(allFees.map(f => f.trimester))].sort()
        if (trancheNames.length === 0) { setClassFees([]); setAllPaid(false); setTranche(''); setAmount(''); return }

        // 4. For each tranche, compute total fee and total paid
        const trancheStatus = trancheNames.map(name => {
          const feesForTranche = allFees.filter(f => f.trimester === name)
          const totalFee = feesForTranche.reduce((s: number, f: any) => s + f.amount, 0)
          const paidForTranche = pays
            .filter(p => p.trimester === name && (p.status === 'PAID' || p.status === 'PARTIAL'))
            .reduce((s: number, p: PaymentData) => s + (p.paidAmount || 0), 0)
          const remaining = Math.max(0, totalFee - paidForTranche)
          const isFullyPaid = remaining === 0 && totalFee > 0
          return { name, fees: feesForTranche, totalFee, paidForTranche, remaining, isFullyPaid }
        })

        // 5. If tranche was pre-filled from Dettes, use it; otherwise auto-select first unpaid
        const preFilledTranche = tranche && trancheNames.includes(tranche) ? tranche : null
        const target = preFilledTranche
          ? trancheStatus.find(t => t.name === preFilledTranche)
          : trancheStatus.find(t => !t.isFullyPaid)

        if (!target) {
          // All tranches paid
          setAllPaid(true)
          setTranche('')
          setAmount('')
          setPaidAmount('')
          setClassFees([])
          setPayCurrency('CDF')
          setPayConvertedAmount('')
        } else {
          setAllPaid(target.isFullyPaid)
          setTranche(target.name)
          setClassFees(target.fees)
          setAmount(String(Math.round(target.totalFee)))
          if (!preFilledTranche) { setPaidAmount(''); setPayCurrency('CDF'); setPayConvertedAmount('') }
        }
      } catch { setClassFees([]); setAllPaid(false); setTranche(''); setAmount('') }
    }
    load()
  }, [selectedStudent?.classId, selectedStudent?.id, userData?.schoolId])

  // Fetch school currency config
  useEffect(() => {
    if (userData?.schoolId) {
      authFetch(`/api/school-currency?schoolId=${userData.schoolId}`)
        .then(r => r.json())
        .then(j => { if (j.data) setCurrencyConfig(j.data) })
        .catch(() => {})
    }
  }, [userData?.schoolId])

  // Fetch exchange rate when pay currency changes
  useEffect(() => {
    if (payCurrency === 'CDF') { setExchangeRate(null); setPayConvertedAmount(''); return }
    const rateSource = currencyConfig?.useManualRates && currencyConfig?.manualRates
      ? (() => { try { return JSON.parse(currencyConfig.manualRates)[payCurrency] } catch { return null } })()
      : null
    if (rateSource) { setExchangeRate(rateSource) }
    else {
      authFetch(`/api/exchange-rate?from=${payCurrency}&to=CDF&amount=1`)
        .then(r => r.json())
        .then(j => { if (j.data?.rate) setExchangeRate(j.data.rate) })
        .catch(() => {})
    }
  }, [payCurrency, currencyConfig])

  // Update converted amounts when rate changes
  useEffect(() => {
    if (payCurrency !== 'CDF' && exchangeRate) {
      if (paidAmount) {
        const val = parseFloat(paidAmount)
        if (!isNaN(val)) setPayConvertedAmount(String(Math.round(val * exchangeRate)))
      }
      if (amount) {
        const val = parseFloat(amount)
        if (!isNaN(val)) setAmountConverted(String(Math.round(val / exchangeRate)))
      }
    } else {
      setPayConvertedAmount('')
      setAmountConverted('')
    }
  }, [paidAmount, amount, exchangeRate, payCurrency])

  async function handlePayment() {
    if (!selectedStudent && !studentSearch) { toast.error('Veuillez sélectionner un élève'); return }
    if (!amount) { toast.error('Veuillez entrer le montant'); return }
    if (allPaid) { toast.error('Cet élève a déjà payé toutes ses tranches'); return }
    setSubmitting(true)
    try {
      // Amount is always in base currency (CDF). Convert paidAmount if non-CDF.
      const amountInBase = parseInt(amount)
      let paidAmountInBase = parseInt(paidAmount || '0')
      if (payCurrency !== 'CDF' && exchangeRate && paidAmount) {
        paidAmountInBase = Math.round(parseFloat(paidAmount) * exchangeRate)
      }
      const body: Record<string, unknown> = {
        schoolId: userData?.schoolId || '',
        amount: amountInBase,
        paidAmount: paidAmountInBase,
        trimester: tranche,
        paymentMethod: method,
        status,
      }
      if (selectedStudent) {
        body.studentId = selectedStudent.id
      } else {
        body.studentName = studentSearch
      }
      const res = await authFetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Paiement enregistré avec succès!')
        const paymentId = json.data?.id
        if (!paymentId) { toast.error('Réponse serveur invalide'); return }
        setLastPaymentId(paymentId)
        const listRes = await authFetch(`/api/payments?limit=30${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`)
        const listJson = await listRes.json()
        setPayments(listJson.data || [])
        setStudentSearch(''); setSelectedStudent(null); setAmount(''); setPaidAmount(''); setAllPaid(false); setTranche(''); setClassFees([]); setPayCurrency('CDF')
        downloadReceipt(paymentId)
      } else {
        toast.error(json.error || 'Erreur lors de l\'enregistrement')
        if (json.suggestions) {
          setStudentSuggestions(json.suggestions.map((s: {id: string; name: string; matricule: string}) => ({
            id: s.id, label: s.name, sublabel: s.matricule
          })))
        }
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSubmitting(false) }
  }

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  async function downloadReceipt(paymentId: string) {
    setPdfLoading(true)
    try {
      const res = await authFetch(`/api/payments/receipt/${paymentId}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
      const a = document.createElement('a')
      a.href = url
      const payment = payments.find(p => p.id === paymentId)
      const receiptName = payment?.receiptNumber || paymentId.slice(-8)
      a.download = `recu-${receiptName}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch { toast.error('Erreur lors du téléchargement du reçu') }
    finally { setPdfLoading(false) }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Paiements</h1>
      </div>

      {userRole !== 'PARENT' && userRole !== 'SECRETARY' && (
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 mb-6 shadow-sm" style={{ borderLeft: `4px solid ${GOLD}` }}>
        <h3 className="font-semibold mb-4" style={{ color: TEXT_PRIMARY }}>Enregistrer un paiement</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <SearchAutocomplete
            label="Rechercher un élève *"
            placeholder="Tapez le nom de l'élève..."
            items={studentSuggestions}
            selectedId={selectedStudentId}
            onSelect={async (item) => { setSelectedStudentId(item.id); setSelectedStudent({ id: item.id, firstName: item.label.split(' ')[0], lastName: item.label.split(' ').slice(1).join(' ') || '', matricule: item.sublabel || '' }); setStudentSearch(''); try { const r = await authFetch(`/api/students/${item.id}`); const j = await r.json(); if (j.data?.classId) setSelectedStudent(prev => prev ? { ...prev, classId: j.data.classId } : prev); } catch {} }}
            onClear={() => { setSelectedStudentId(null); setSelectedStudent(null); setStudentSearch(''); setAllPaid(false); setTranche(''); setAmount(''); setClassFees([]) }}
            searchQuery={studentSearch}
            onSearchChange={(v) => { setStudentSearch(v); setSelectedStudent(null); setSelectedStudentId(null) }}
            loading={studentSearchLoading}
            itemTypeName="élève"
            className="sm:col-span-2 lg:col-span-1"
          />
          <div>
            <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Montant à payer (CDF)</label>
            <input
              placeholder="Montant"
              value={amount}
              readOnly
              type="number"
              className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-[oklch(97%_0.005_175)] outline-none cursor-not-allowed"
              style={{ color: amount ? ACCENT : TEXT_MUTED_LUXE }}
            />
            {payCurrency !== 'CDF' && exchangeRate && amount && (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg" style={{ background: `${ACCENT}10`, color: TEXT_MUTED_LUXE }}>
                <ArrowRightLeft size={11} />
                <span>≈ {formatNumber(parseInt(amountConverted))} {payCurrency}</span>
              </div>
            )}
            {classFees.length > 0 && (
              <div className="mt-1 text-[11px] px-3 py-2 rounded-lg" style={{ background: `${ACCENT}10`, color: TEXT_MUTED_LUXE }}>
                {classFees.map((f: any) => `${f.name}: ${formatNumber(f.amount)}`).join(' + ')} = <strong style={{ color: ACCENT }}>{formatNumber(classFees.reduce((s: number, f: any) => s + f.amount, 0))} CDF</strong>
              </div>
            )}
            {allPaid && (
              <div className="mt-2 px-3 py-2 rounded-lg text-[12px] font-medium" style={{ background: `${SUCCESS}18`, color: SUCCESS }}>
                Cet élève a déjà payé toutes ses tranches. Aucun paiement à enregistrer.
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Montant payé ({payCurrency})</label>
            <div className="flex gap-2 mt-1">
              <input
                placeholder="Payé"
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value)}
                type="number"
                disabled={allPaid}
                className="flex-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <select value={payCurrency} onChange={e => setPayCurrency(e.target.value)} disabled={allPaid} className="px-2 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] w-20 disabled:opacity-50 disabled:cursor-not-allowed">
                {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
            {payCurrency !== 'CDF' && exchangeRate && paidAmount && (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg" style={{ background: `${ACCENT}10`, color: TEXT_MUTED_LUXE }}>
                <ArrowRightLeft size={11} />
                <span>1 {payCurrency} = {formatNumber(exchangeRate)} CDF{payConvertedAmount ? <> → <strong style={{ color: ACCENT }}>{formatNumber(parseInt(payConvertedAmount))} CDF</strong></> : ''}</span>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Tranche</label>
            <input
              value={tranche}
              readOnly
              placeholder="Sélectionnez un élève"
              className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-[oklch(97%_0.005_175)] outline-none cursor-not-allowed"
              style={{ color: tranche ? TEXT_PRIMARY : TEXT_MUTED_LUXE }}
            />
          </div>
          <div><label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Méthode</label><select value={method} onChange={e => setMethod(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
            <option value="CASH">Espèces</option><option value="ORANGE_MONEY">Orange Money</option><option value="MPESA">M-Pesa</option><option value="AIRTEL_MONEY">Airtel Money</option>
          </select></div>
          <div><label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Statut</label><select value={status} onChange={e => setStatus(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
            <option value="PAID">Payé</option><option value="PARTIAL">Partiel</option><option value="PENDING">En attente</option><option value="OVERDUE">En retard</option>
          </select></div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handlePayment} disabled={submitting || allPaid} className="edu-gold-cta px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {submitting ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <CreditCard size={14} />}
            Enregistrer le paiement
          </button>
          {lastPaymentId && (
            <button onClick={() => downloadReceipt(lastPaymentId)} disabled={pdfLoading} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition disabled:opacity-50" style={{ color: TEXT_PRIMARY }}>
              {pdfLoading ? <div className="h-4 w-4 border-2 border-[oklch(52%_0.015_250)] border-t-transparent rounded-full animate-spin" /> : <FileText size={14} />} Voir le reçu PDF
            </button>
          )}
        </div>
      </div>
      )}

      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: IVORY }}>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Élève</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Tranche</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Montant</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Payé</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Reste</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
              ) : (() => {
                // Group payments by student+tranche
                const groups = new Map<string, { payments: PaymentData[]; student: PaymentData['student']; tranche: string; totalAmount: number; totalPaid: number }>()
                for (const p of payments.slice(0, 50)) {
                  const key = `${p.studentId}-${p.trimester}`
                  if (!groups.has(key)) {
                    groups.set(key, { payments: [], student: p.student, tranche: p.trimester, totalAmount: 0, totalPaid: 0 })
                  }
                  const g = groups.get(key)!
                  g.payments.push(p)
                  g.totalAmount = Math.max(g.totalAmount, p.amount)
                  g.totalPaid += p.paidAmount
                }
                return Array.from(groups.values()).slice(0, 20).map(g => {
                  const remaining = Math.max(0, g.totalAmount - g.totalPaid)
                  const isPaid = remaining === 0
                  return (
                <tr
                  key={`${g.student?.id}-${g.tranche}`}
                  className={`hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0 ${!isPaid ? 'cursor-pointer' : ''}`}
                  onClick={() => {
                    if (g.student) {
                      setModalStudent({ id: g.student.id, firstName: g.student.firstName, lastName: g.student.lastName, matricule: g.student.matricule || '', tranche: g.tranche, remaining, amount: g.totalAmount })
                    }
                  }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {g.student ? (
                        <StudentAvatar firstName={g.student.firstName} lastName={g.student.lastName} photoUrl={g.student.photoUrl} size={32} className="text-white font-semibold" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
                      ) : (
                        <div className="w-8 h-8 rounded-full grid place-items-center text-white text-[11px] font-semibold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>??</div>
                      )}
                      <div>
                        <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{g.student ? `${g.student.firstName} ${g.student.lastName}` : '—'}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{g.student?.matricule || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{g.tranche}</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums font-medium" style={{ color: TEXT_PRIMARY }}>{formatNumber(g.totalAmount)} CDF</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums font-medium" style={{ color: SUCCESS }}>{formatNumber(g.totalPaid)} CDF</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums font-medium" style={{ color: isPaid ? SUCCESS : ACCENT }}>{formatNumber(remaining)} CDF</td>
                  <td className="px-4 py-3">
                    {isPaid ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ background: `${SUCCESS}18`, color: SUCCESS }}>✓ En ordre</span>
                    ) : (
                      userRole !== 'SECRETARY' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (g.student) {
                            setModalStudent({ id: g.student.id, firstName: g.student.firstName, lastName: g.student.lastName, matricule: g.student.matricule || '', tranche: g.tranche, remaining, amount: g.totalAmount })
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition hover:opacity-80"
                        style={{ background: `${ACCENT}18`, color: ACCENT }}
                      >
                        <CreditCard size={11} /> Payer
                      </button>
                      )
                    )}
                  </td>
                </tr>
              )})})()}
            </tbody>
          </table>
        </div>
      </div>

      {pdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { URL.revokeObjectURL(pdfUrl); setPdfUrl(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center text-white" style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
                  <FileText size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Reçu de Paiement</h2>
                  <p className="text-xs text-gray-500">Le PDF a été téléchargé automatiquement</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={pdfUrl}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}
                >
                  <Download size={14} /> Télécharger
                </a>
                <button onClick={() => { URL.revokeObjectURL(pdfUrl); setPdfUrl(null) }} className="w-9 h-9 rounded-lg grid place-items-center hover:bg-gray-100 transition">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl">
              <iframe src={pdfUrl} className="w-full h-[70vh] border-0" title="Reçu PDF" />
            </div>
          </div>
        </div>
      )}

      {modalStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalStudent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[oklch(90%_0.01_175)]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>Fiche de l'élève</h3>
                <button onClick={() => setModalStudent(null)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.005_175)] transition">
                  <X size={16} style={{ color: TEXT_MUTED_LUXE }} />
                </button>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full grid place-items-center text-white text-sm font-bold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                  {getInitials(`${modalStudent.firstName} ${modalStudent.lastName}`)}
                </div>
                <div>
                  <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>{modalStudent.firstName} {modalStudent.lastName}</div>
                  <div className="text-[12px]" style={{ color: TEXT_MUTED_LUXE }}>{modalStudent.matricule}</div>
                </div>
              </div>
              <div className="space-y-3 mb-5">
                <div className="flex justify-between items-center py-2 border-b border-[oklch(92%_0.005_250)]">
                  <span className="text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>Tranche</span>
                  <span className="text-[13px] font-semibold" style={{ color: TEXT_PRIMARY }}>{modalStudent.tranche}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[oklch(92%_0.005_250)]">
                  <span className="text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>Montant total</span>
                  <span className="text-[13px] font-semibold" style={{ color: TEXT_PRIMARY }}>{formatNumber(modalStudent.amount)} CDF</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>Reste à payer</span>
                  <span className="text-[15px] font-bold" style={{ color: modalStudent.remaining > 0 ? ACCENT : SUCCESS }}>{formatNumber(modalStudent.remaining)} CDF</span>
                </div>
              </div>
              {modalStudent.remaining > 0 ? (
                <button
                  onClick={() => {
                    setSelectedStudentId(modalStudent.id)
                    setSelectedStudent({ id: modalStudent.id, firstName: modalStudent.firstName, lastName: modalStudent.lastName, matricule: modalStudent.matricule, classId: undefined })
                    setStudentSuggestions([{ id: modalStudent.id, label: `${modalStudent.firstName} ${modalStudent.lastName}`, sublabel: modalStudent.matricule }])
                    setStudentSearch('')
                    setTranche(modalStudent.tranche)
                    setAmount(String(modalStudent.amount))
                    setPaidAmount(String(modalStudent.remaining))
                    setAllPaid(false)
                    setModalStudent(null)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="w-full edu-gold-cta px-5 py-3 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2"
                >
                  <CreditCard size={14} /> Effectuer le paiement
                </button>
              ) : (
                <div className="w-full px-5 py-3 rounded-xl text-sm font-semibold text-center" style={{ background: `${SUCCESS}18`, color: SUCCESS }}>
                  ✓ Cet élève est en ordre
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
