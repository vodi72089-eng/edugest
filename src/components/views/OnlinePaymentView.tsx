'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch, getActiveSchoolId } from '@/lib/store'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, SUCCESS, DANGER } from '@/lib/constants'
import { getInitials, formatNumber } from '@/lib/helpers'
import { CreditCard, Smartphone, CheckCircle, ArrowLeft, Loader2, Download, FileText, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import SearchAutocomplete, { AutocompleteItem } from './SearchAutocomplete'
import type { StudentData, PaymentData } from '@/lib/types'
import { SUPPORTED_CURRENCIES } from '@/lib/exchange-rate'

type PaymentStep = 'select' | 'confirm' | 'success'

export default function OnlinePaymentView() {
  const { userData, pendingStudentFocus, setPendingStudentFocus } = useEduGestStore()
  // École active : pour le super admin plateforme, l'école choisie dans la
  // sidebar (sinon activeSchoolId est null → toutes les écoles mélangées).
  const activeSchoolId = getActiveSchoolId() || userData?.schoolId || ''
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
  const [tranche, setTranche] = useState('Tranche 1')
  const [classFees, setClassFees] = useState<any[]>([])
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [payCurrency, setPayCurrency] = useState('CDF')
  const [payConvertedAmount, setPayConvertedAmount] = useState<string>('')
  const [amountConverted, setAmountConverted] = useState<string>('')
  const [currencyConfig, setCurrencyConfig] = useState<any>(null)
  const [allPaid, setAllPaid] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [paidSoFar, setPaidSoFar] = useState(0)

  // Result state
  const [resultRef, setResultRef] = useState('')
  const [resultAmount, setResultAmount] = useState(0)
  const [resultStudent, setResultStudent] = useState('')
  const [resultPaymentId, setResultPaymentId] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  // Orchestration honnête : transaction passerelle + prochaine étape + statuts live
  const [resultTxId, setResultTxId] = useState<string | null>(null)
  const [resultTestMode, setResultTestMode] = useState(false)
  const [resultNextStep, setResultNextStep] = useState<{ action: 'redirect' | 'wait'; url?: string; hint?: string } | null>(null)
  const [txStatus, setTxStatus] = useState('PENDING')
  const [recordStatus, setRecordStatus] = useState('PENDING')
  // Passerelles RÉELLEMENT disponibles (configurées + actives côté école)
  const [availableMethods, setAvailableMethods] = useState<string[] | null>(null)
  const HOSTED_METHODS = ['ORANGE_MONEY', 'MPESA', 'AIRTEL_MONEY', 'FLUTTERWAVE', 'BICTORYS']

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

  // Enfant ciblé depuis le dashboard parent (puce « Paiements ») : présélection
  // directe → les frais, la tranche et le montant se chargent automatiquement.
  useEffect(() => {
    const focus = pendingStudentFocus
    if (!focus) return
    setPendingStudentFocus(null)
    setSelectedStudentId(focus.id)
    setSelectedStudent({
      id: focus.id,
      matricule: focus.matricule,
      firstName: focus.firstName,
      lastName: focus.lastName,
      classId: focus.classId || '',
      schoolId: '',
      schoolYearId: '',
      photoUrl: focus.photoUrl,
    })
    setStudentSuggestions([{
      id: focus.id, label: `${focus.firstName} ${focus.lastName}`, sublabel: focus.matricule, photoUrl: focus.photoUrl
    }])
    setStep('select')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [pendingStudentFocus, setPendingStudentFocus])

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

  // Fetch class fees + student payments + auto-select tranche when student selected
  useEffect(() => {
    if (!selectedStudentId || !activeSchoolId) {
      setClassFees([]); setAllPaid(false); setTranche(''); setAmount(''); setPayCurrency('CDF'); setPayConvertedAmount(''); setAmountConverted(''); setRemaining(null); setPaidSoFar(0); return
    }
    let cancelled = false
    const load = async () => {
      try {
        // Resolve classId: try from selectedStudent first, then fetch from API
        let classId = selectedStudent?.classId
        if (!classId) {
          const sRes = await authFetch(`/api/students/${selectedStudentId}`)
          const sJson = await sRes.json()
          classId = sJson.data?.classId
        }
        if (!classId || cancelled) { setClassFees([]); setAllPaid(false); setTranche(''); setAmount(''); setRemaining(null); setPaidSoFar(0); return }

        const feesRes = await authFetch(`/api/school-fees?schoolId=${activeSchoolId}&classId=${classId}`)
        const feesJson = await feesRes.json()
        const allFees: any[] = feesJson.data || []

        const payRes = await authFetch(`/api/payments?studentId=${selectedStudentId}&limit=100`)
        const payJson = await payRes.json()
        const pays: PaymentData[] = payJson.data || []

        if (cancelled) return

        const trancheNames = [...new Set(allFees.map(f => f.trimester))].sort()
        if (trancheNames.length === 0) { setClassFees([]); setAllPaid(false); setTranche(''); setAmount(''); setRemaining(null); setPaidSoFar(0); return }

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

        const nextUnpaid = trancheStatus.find(t => !t.isFullyPaid)

        if (!nextUnpaid) {
          setAllPaid(true); setTranche(''); setAmount(''); setClassFees([])
          setPayCurrency('CDF'); setPayConvertedAmount(''); setAmountConverted('')
          setRemaining(null); setPaidSoFar(0)
        } else {
          setAllPaid(false)
          setTranche(nextUnpaid.name)
          setClassFees(nextUnpaid.fees)
          setRemaining(nextUnpaid.remaining)
          setPaidSoFar(nextUnpaid.paidForTranche)
          setAmount(String(Math.round(nextUnpaid.remaining)))
          setPayCurrency('CDF'); setPayConvertedAmount(''); setAmountConverted('')
        }
      } catch { setClassFees([]); setAllPaid(false); setTranche(''); setAmount('') }
    }
    load()
    return () => { cancelled = true }
  }, [selectedStudentId, selectedStudent?.classId, activeSchoolId])

  // Fetch school currency config
  useEffect(() => {
    if (activeSchoolId) {
      authFetch(`/api/school-currency?schoolId=${activeSchoolId}`)
        .then(r => r.json())
        .then(j => { if (j.data) setCurrencyConfig(j.data) })
        .catch(() => {})
      // Passerelles réellement configurées + actives (jamais de catalogue statique)
      authFetch(`/api/payment-gateways?schoolId=${activeSchoolId}`)
        .then(r => r.json())
        .then(j => {
          const configured: any[] = j.data?.configured || []
          // Actives + (clés réelles OU mode test explicite — le badge MODE TEST l'indique)
          const active = configured
            .filter(g => g.isActive && (g.hasCredentials || g.isTestMode) && HOSTED_METHODS.includes(g.gatewayType))
            .map(g => g.gatewayType)
          setAvailableMethods(active)
          if (active.length > 0 && !active.includes(paymentMethod)) setPaymentMethod(active[0])
        })
        .catch(() => setAvailableMethods(HOSTED_METHODS))
    }
  }, [activeSchoolId])

  // Fetch exchange rate when pay currency changes
  useEffect(() => {
    if (payCurrency === 'CDF') { setExchangeRate(null); setPayConvertedAmount(''); setAmountConverted(''); return }
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

  // Update converted amounts
  useEffect(() => {
    if (payCurrency !== 'CDF' && exchangeRate) {
      if (amount) {
        const val = parseFloat(amount)
        if (!isNaN(val)) setAmountConverted(String(Math.round(val / exchangeRate)))
      }
    } else { setAmountConverted('') }
  }, [amount, exchangeRate, payCurrency])

  function handleSelectStudent(item: AutocompleteItem) {
    setSelectedStudentId(item.id)
    const found = children.find(s => s.id === item.id) || null
    setSelectedStudent(found)
    setStudentSearch('')
    setAllPaid(false)
    setClassFees([])
    setTranche('')
    setAmount('')
    setPayCurrency('CDF')
    setPayConvertedAmount('')
    setAmountConverted('')
    setRemaining(null)
    setPaidSoFar(0)
  }

  async function handleSubmit() {
    if (!selectedStudentId) { toast.error('Sélectionnez un élève'); return }
    if (!amount || Number(amount) <= 0) { toast.error('Entrez un montant valide'); return }
    if (!phone.trim()) { toast.error('Entrez votre numéro de téléphone'); return }
    if (allPaid) { toast.error('Cet élève a déjà payé toutes ses tranches'); return }

    setSubmitting(true)
    try {
      // Convert paid amount to CDF if non-CDF currency
      let amountInCDF = parseInt(amount)
      if (payCurrency !== 'CDF' && exchangeRate) {
        amountInCDF = Math.round(parseFloat(amount) * exchangeRate)
      }
      // Plafond : jamais plus que le reste à payer de la tranche
      if (remaining !== null && amountInCDF > remaining) {
        toast.error(`Le montant ne peut pas dépasser le reste à payer (${formatNumber(remaining)} CDF)`)
        setSubmitting(false)
        return
      }
      const res = await authFetch('/api/payments/online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudentId,
          amount: amountInCDF,
          paymentMethod,
          phone: phone.trim(),
          trimester: tranche,
        }),
      })
      const json = await res.json()
      if (res.ok || res.status === 202) {
        const d = json.data
        setResultRef(d.referenceNumber)
        setResultAmount(Number(amount))
        setResultStudent(`${d.student.firstName} ${d.student.lastName}`)
        setResultPaymentId(d.id)
        setResultTxId(d.transaction?.id || null)
        setResultTestMode(!!d.testMode)
        setResultNextStep(d.nextStep || null)
        setTxStatus(d.transaction?.status || 'PENDING')
        setRecordStatus('PENDING')
        setStep('success')
        toast.success(d.testMode
          ? 'Demande enregistrée (MODE TEST) — le caissier vérifiera manuellement.'
          : 'Paiement initié — en attente de confirmation.')
      } else {
        toast.error(json.error || "Échec de l'initiation du paiement")
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  // Suivi live de la transaction : la confirmation (webhook vérifié) débloque
  // le reçu. Sans confirmation, JAMAIS de reçu officiel.
  useEffect(() => {
    if (step !== 'success' || !resultTxId) return
    if (txStatus === 'SUCCESS' || txStatus === 'FAILED') return
    let tries = 0
    const id = setInterval(async () => {
      tries++
      try {
        const r = await authFetch(`/api/payment-transactions/${resultTxId}`)
        const j = await r.json()
        const st = j.data?.status as string | undefined
        if (st && st !== 'PENDING') {
          setTxStatus(st)
          if (st === 'SUCCESS' && selectedStudentId) {
            const pr = await authFetch(`/api/payments?studentId=${selectedStudentId}&limit=100`).then(x => x.json())
            const rec = (pr.data || []).find((p: any) => p.id === resultPaymentId)
            if (rec) setRecordStatus(rec.status)
          }
          clearInterval(id)
        } else if (tries >= 36 || st === 'FAILED') {
          if (st === 'FAILED') setTxStatus('FAILED')
          clearInterval(id)
        }
      } catch { /* retry silencieux */ }
    }, 5000)
    return () => clearInterval(id)
  }, [step, resultTxId])

  function handleReset() {
    setStep('select')
    setSelectedStudentId(null)
    setSelectedStudent(null)
    setAmount('')
    setPhone('')
    setResultRef('')
    setResultPaymentId('')
    setResultTxId(null)
    setResultTestMode(false)
    setResultNextStep(null)
    setTxStatus('PENDING')
    setRecordStatus('PENDING')
    setTranche('Tranche 1')
    setClassFees([])
    setAllPaid(false)
    setPayCurrency('CDF')
    setPayConvertedAmount('')
    setAmountConverted('')
    setRemaining(null)
    setPaidSoFar(0)
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

  // Méthodes HONNÊTES : uniquement les flux hébergés réellement initiables.
  // PAS de Visa/Mastercard (redirect-only sans intégration), PAS de MANUAL
  // (le cash se déclare au caissier, pas en « paiement en ligne »).
  // L'affichage est filtré par `availableMethods` (config école réelle).
  const methodLabels: Record<string, { label: string; color: string; icon: string; svg: string }> = {
    FLUTTERWAVE: { label: 'Flutterwave', color: '#FF6D00', icon: '🌊', svg: '/logos/payment/flutterwave.png' },
    BICTORYS: { label: 'Bictorys', color: '#1DC9A0', icon: '⚡', svg: '/logos/payment/bictorys.svg' },
    ORANGE_MONEY: { label: 'Orange Money', color: '#FF6600', icon: '🟠', svg: '/logos/payment/orange_money.svg' },
    MPESA: { label: 'M-Pesa', color: '#00A651', icon: '🟢', svg: '/logos/payment/mpesa.svg' },
    AIRTEL_MONEY: { label: 'Airtel Money', color: '#E40000', icon: '🔴', svg: '/logos/payment/airtel_money.svg' },
  }
  const visibleMethods = (availableMethods || HOSTED_METHODS).filter(k => methodLabels[k])

  if (step === 'success') {
    const paid = recordStatus === 'PAID'
    const failed = txStatus === 'FAILED'
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-8 rounded-full" style={{ background: failed ? DANGER : paid ? SUCCESS : GOLD }} />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>
            {paid ? 'Paiement confirmé' : failed ? 'Paiement échoué' : 'Paiement en attente'}
          </h1>
          {resultTestMode && (
            <span className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: 'oklch(94% 0.06 65)', color: 'oklch(45% 0.13 65)' }}>
              MODE TEST — aucune transaction réelle
            </span>
          )}
        </div>
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-8 shadow-sm text-center max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 grid place-items-center" style={{ background: failed ? 'oklch(95% 0.04 25)' : paid ? 'oklch(94% 0.05 145)' : 'oklch(94% 0.06 65)' }}>
            <CheckCircle size={32} style={{ color: failed ? DANGER : paid ? SUCCESS : GOLD }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: TEXT_PRIMARY }}>
            {paid ? 'Paiement confirmé !' : failed ? 'Le paiement a échoué' : 'Paiement initié — en attente de confirmation'}
          </h2>
          <p className="text-sm mb-6" style={{ color: TEXT_MUTED_LUXE }}>
            {paid
              ? 'Le paiement a été confirmé par la passerelle. Votre reçu officiel est disponible.'
              : failed
                ? "La passerelle n'a pas confirmé ce paiement. Aucun montant n'a été encaissé — réessayez ou contactez l'école."
                : resultTestMode
                  ? "Simulation (MODE TEST) : aucun argent n'a bougé. Le caissier vérifiera manuellement."
                  : resultNextStep?.action === 'redirect'
                    ? 'Finalisez le paiement sur la page sécurisée de la passerelle, puis revenez ici.'
                    : 'Confirmez le paiement sur votre téléphone. Cette page se met à jour automatiquement.'}
          </p>
          {/* Prochaine étape honnête : redirection checkout OU attente STK */}
          {!paid && !failed && resultNextStep?.action === 'redirect' && resultNextStep.url && (
            <a
              href={resultNextStep.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white mb-6 transition hover:opacity-90"
              style={{ background: ACCENT }}
            >
              Continuer vers la passerelle <ArrowRightLeft size={14} />
            </a>
          )}
          {!paid && !failed && txStatus === 'PENDING' && (
            <p className="text-xs mb-6 inline-flex items-center gap-2" style={{ color: TEXT_MUTED_LUXE }}>
              <Loader2 size={12} className="animate-spin" /> Vérification automatique en cours…
            </p>
          )}
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
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium" style={paid ? { background: 'oklch(94% 0.05 145)', color: SUCCESS } : failed ? { background: 'oklch(95% 0.04 25)', color: DANGER } : { background: 'oklch(94% 0.06 65)', color: 'oklch(45% 0.13 65)' }}>
                {paid ? 'Payé' : failed ? 'Échoué' : 'En attente'}
              </span>
            </div>
          </div>
          <p className="text-xs mb-4" style={{ color: TEXT_MUTED_LUXE }}>
            Conservez cette référence pour suivre votre paiement.
          </p>
          <div className="flex gap-3 justify-center">
            {paid ? (
              <button
                onClick={downloadReceipt}
                disabled={pdfLoading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}
              >
                {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                Télécharger le reçu officiel
              </button>
            ) : (
              <span className="text-xs px-4 py-2" style={{ color: TEXT_MUTED_LUXE }}>
                Le reçu officiel sera disponible après confirmation du paiement.
              </span>
            )}
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
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display" style={{ color: TEXT_PRIMARY }}>Payer en ligne</h1>
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
                onClear={() => { setSelectedStudentId(null); setSelectedStudent(null); setStudentSearch(''); setAmount(''); setRemaining(null); setPaidSoFar(0); setTranche(''); setClassFees([]); setAllPaid(false) }}
                searchQuery={studentSearch}
                onSearchChange={(v) => { setStudentSearch(v); setSelectedStudent(null); setSelectedStudentId(null) }}
                loading={studentSearchLoading}
                itemTypeName="élève"
              />

              <div>
                <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Tranche *</label>
                <input
                  value={tranche}
                  readOnly
                  placeholder="Sélectionnez un élève"
                  className="w-full mt-1 px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-[oklch(97%_0.005_175)] outline-none cursor-not-allowed"
                  style={{ color: tranche ? TEXT_PRIMARY : TEXT_MUTED_LUXE }}
                />
              </div>

              <div>
                <label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Montant à payer (CDF) *</label>
                <input
                  placeholder="Entrez le montant (max : reste à payer)"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  type="number"
                  min={1}
                  max={remaining ?? undefined}
                  className="w-full mt-1 px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]"
                  style={{ color: amount ? ACCENT : TEXT_MUTED_LUXE }}
                />
                {remaining !== null && (
                  <div className="mt-1 text-[11px] px-3 py-2 rounded-lg" style={{ background: `${ACCENT}10`, color: TEXT_MUTED_LUXE }}>
                    Reste à payer {tranche ? `${tranche} : ` : ''}<strong style={{ color: ACCENT }}>{formatNumber(remaining)} CDF</strong>
                    {paidSoFar > 0 && <span> (déjà payé : {formatNumber(paidSoFar)} CDF — vous pouvez payer une partie)</span>}
                    {paidSoFar === 0 && <span> — vous pouvez payer tout ou une partie</span>}
                  </div>
                )}
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
                <label className="text-xs font-medium mb-2 block" style={{ color: TEXT_MUTED_LUXE }}>Méthode de paiement *</label>
                {availableMethods !== null && visibleMethods.length === 0 ? (
                  <p className="text-[13px] px-3 py-2.5 rounded-xl" style={{ background: 'oklch(94% 0.06 65)', color: 'oklch(45% 0.13 65)' }}>
                    Aucune passerelle activée pour votre école. Contactez la direction ou payez au caissier.
                  </p>
                ) : (
                <div className="grid grid-cols-3 gap-2">
                  {visibleMethods.map((key) => {
                    const info = methodLabels[key]
                    return (
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
                        <div className="h-8 w-full flex items-center justify-center mb-1 bg-white rounded-lg border border-[oklch(90%_0.01_175)] p-1"><img src={info.svg} alt={info.label} className="max-w-full max-h-full w-auto h-auto object-contain" /></div>
                        <div className="text-[11px] font-semibold" style={{ color: TEXT_PRIMARY }}>{info.label}</div>
                      </button>
                    )
                  })}
                </div>
                )}
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
                disabled={submitting || !selectedStudentId || !amount || !phone || allPaid}
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
                  { step: '1', text: 'Sélectionnez l\'élève et la tranche' },
                  { step: '2', text: 'Choisissez une passerelle activée par votre école' },
                  { step: '3', text: 'Confirmez sur votre téléphone ou la page sécurisée' },
                  { step: '4', text: 'Le reçu officiel se débloque après confirmation réelle' },
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
                {visibleMethods.map((key) => {
                  const info = methodLabels[key]
                  return (
                    <div key={key} className="flex items-center gap-2.5 p-2 rounded-lg" style={{ background: paymentMethod === key ? 'oklch(97% 0.005 175)' : 'transparent' }}>
                      <img src={info.svg} alt={info.label} className="h-7 w-12 rounded-md object-contain shrink-0 bg-white border border-[oklch(90%_0.01_175)] p-0.5" />
                      <span className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{info.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
