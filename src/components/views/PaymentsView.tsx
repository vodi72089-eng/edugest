'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch } from '@/lib/store'
import type { PaymentData, StudentData } from '@/lib/types'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, IVORY, SUCCESS } from '@/lib/constants'
import { getInitials, formatNumber, getStatusPill } from '@/lib/helpers'
import { CreditCard, FileText, Download, X } from 'lucide-react'
import { toast } from 'sonner'
import SearchAutocomplete, { AutocompleteItem } from './SearchAutocomplete'

export default function PaymentsView() {
  const [payments, setPayments] = useState<PaymentData[]>([])
  const [loading, setLoading] = useState(true)
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<{id: string; firstName: string; lastName: string; matricule: string} | null>(null)
  const [studentSuggestions, setStudentSuggestions] = useState<AutocompleteItem[]>([])
  const [studentSearchLoading, setStudentSearchLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [trimester, setTrimester] = useState('T1')
  const [method, setMethod] = useState('CASH')
  const [status, setStatus] = useState('PAID')
  const [submitting, setSubmitting] = useState(false)
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null)
  const { userData, userRole } = useEduGestStore()
  const isParent = userRole === 'PARENT'

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
  }, [])

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

  async function handlePayment() {
    if (!selectedStudent && !studentSearch) { toast.error('Veuillez sélectionner un élève'); return }
    if (!amount) { toast.error('Veuillez entrer le montant'); return }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        schoolId: userData?.schoolId || '',
        amount: parseInt(amount),
        paidAmount: parseInt(paidAmount || '0'),
        trimester,
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
        setStudentSearch(''); setSelectedStudent(null); setAmount(''); setPaidAmount('')
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

      {!isParent && (
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 mb-6 shadow-sm" style={{ borderLeft: `4px solid ${GOLD}` }}>
        <h3 className="font-semibold mb-4" style={{ color: TEXT_PRIMARY }}>Enregistrer un paiement</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <SearchAutocomplete
            label="Rechercher un élève *"
            placeholder="Tapez le nom de l'élève..."
            items={studentSuggestions}
            selectedId={selectedStudentId}
            onSelect={(item) => { setSelectedStudentId(item.id); setSelectedStudent({ id: item.id, firstName: item.label.split(' ')[0], lastName: item.label.split(' ').slice(1).join(' ') || '', matricule: item.sublabel || '' }); setStudentSearch('') }}
            onClear={() => { setSelectedStudentId(null); setSelectedStudent(null); setStudentSearch('') }}
            searchQuery={studentSearch}
            onSearchChange={(v) => { setStudentSearch(v); setSelectedStudent(null); setSelectedStudentId(null) }}
            loading={studentSearchLoading}
            itemTypeName="élève"
            className="sm:col-span-2 lg:col-span-1"
          />
          <div><label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Montant total (CDF)</label><input placeholder="Montant" value={amount} onChange={e => setAmount(e.target.value)} type="number" className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
          <div><label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Montant payé (CDF)</label><input placeholder="Payé" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} type="number" className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
          <div><label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Trimestre</label><select value={trimester} onChange={e => setTrimester(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
            <option value="T1">Trimestre 1</option><option value="T2">Trimestre 2</option><option value="T3">Trimestre 3</option>
          </select></div>
          <div><label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Méthode</label><select value={method} onChange={e => setMethod(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
            <option value="CASH">Espèces</option><option value="ORANGE_MONEY">Orange Money</option><option value="MPESA">M-Pesa</option><option value="AIRTEL_MONEY">Airtel Money</option>
          </select></div>
          <div><label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Statut</label><select value={status} onChange={e => setStatus(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
            <option value="PAID">Payé</option><option value="PARTIAL">Partiel</option><option value="PENDING">En attente</option><option value="OVERDUE">En retard</option>
          </select></div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handlePayment} disabled={submitting} className="edu-gold-cta px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
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
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Trimestre</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Montant</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Payé</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Statut</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Reçu</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
              ) : payments.slice(0, 20).map(p => (
                <tr key={p.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full grid place-items-center text-white text-[11px] font-semibold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                        {p.student ? getInitials(`${p.student.firstName} ${p.student.lastName}`) : '??'}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{p.student ? `${p.student.firstName} ${p.student.lastName}` : '—'}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{p.student?.matricule || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{p.trimester}</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums font-medium" style={{ color: TEXT_PRIMARY }}>{formatNumber(p.amount)} CDF</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums font-medium" style={{ color: SUCCESS }}>{formatNumber(p.paidAmount)} CDF</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${getStatusPill(p.status)}`}>
                      {p.status === 'PAID' ? '✓ Payé' : p.status === 'PARTIAL' ? '◐ Partiel' : p.status === 'OVERDUE' ? '⚠ En retard' : '○ En attente'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => downloadReceipt(p.id)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: GOLD }} title="Télécharger le reçu PDF">
                      <FileText size={14} />
                    </button>
                  </td>
                </tr>
              ))}
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
    </div>
  )
}
