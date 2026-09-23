'use client'

import { useRef, useState, useEffect } from 'react'
import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'
import { X, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────
interface ReceiptPayment {
  id: string
  amount: number
  paidAmount: number
  trimester: string
  paymentMethod: string | null
  referenceNumber: string | null
  status: string
  paidAt: string | null
  receiptNumber: string | null
  createdAt: string
}

interface ReceiptStudent {
  firstName: string
  lastName: string
  matricule: string
}

interface ReceiptSchool {
  name: string
  shortName: string
  email: string
  phone: string
  address: string
  city: string
  province: string
  country: string
}

interface ReceiptPreviewProps {
  payment: ReceiptPayment
  student: ReceiptStudent
  school: ReceiptSchool
  onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'CDF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}

function getSchoolInitials(shortName: string): string {
  return shortName
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4)
}

function getStatusInfo(status: string): { bg: string; text: string; label: string; desc: string } {
  switch (status.toUpperCase()) {
    case 'PAID':
      return { bg: '#dcfce7', text: '#166534', label: 'PAYÉ', desc: 'Le paiement a été intégralement réglé.' }
    case 'PARTIAL':
      return { bg: '#fef9c3', text: '#854d0e', label: 'PARTIEL', desc: 'Le paiement est partiellement réglé. Un solde reste dû.' }
    case 'PENDING':
      return { bg: '#fee2e2', text: '#991b1b', label: 'EN ATTENTE', desc: 'Le paiement est en attente de règlement.' }
    case 'OVERDUE':
      return { bg: '#fecaca', text: '#7f1d1d', label: 'EN RETARD', desc: 'Le paiement est en retard. Veuillez régler dès que possible.' }
    case 'CANCELLED':
      return { bg: '#f3f4f6', text: '#374151', label: 'ANNULÉ', desc: 'Ce paiement a été annulé.' }
    default:
      return { bg: '#e5e7eb', text: '#374151', label: status.toUpperCase(), desc: '' }
  }
}

function getPaymentMethodLabel(method: string | null): string {
  if (!method) return '—'
  const map: Record<string, string> = {
    CASH: 'Espèces',
    MOBILE_MONEY: 'Mobile Money',
    ORANGE_MONEY: 'Orange Money',
    MPESA: 'M-Pesa',
    AIRTEL_MONEY: 'Airtel Money',
    BANK_TRANSFER: 'Virement bancaire',
    CARD: 'Carte bancaire',
    CHECK: 'Chèque',
    OTHER: 'Autre',
  }
  return map[method.toUpperCase()] || method
}

function getTrimesterLabel(trimester: string): string {
  const map: Record<string, string> = {
    T1: '1er Trimestre',
    T2: '2ème Trimestre',
    T3: '3ème Trimestre',
  }
  return map[trimester] || trimester
}

// ─── Component ────────────────────────────────────────────────────────────
export default function ReceiptPreview({ payment, student, school, onClose }: ReceiptPreviewProps) {
  const receiptRef = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)
  const statusInfo = getStatusInfo(payment.status)
  const remaining = payment.amount - payment.paidAmount
  const receiptNo = payment.receiptNumber || `REC-${payment.id.slice(-8).toUpperCase()}`

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleDownloadPDF() {
    if (!receiptRef.current) return
    setGenerating(true)

    try {
      // 1. Capture the receipt element at high resolution
      const canvas = await html2canvas(receiptRef.current, {
        scale: 3,                       // High resolution (~300 dpi)
        useCORS: true,                  // Allow cross-origin images
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        width: receiptRef.current.offsetWidth,
        height: receiptRef.current.offsetHeight,
      })

      // 2. Create the PDF
      const A4_W = 210  // mm
      const A4_H = 297  // mm
      const imgWidth = A4_W
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const imgData = canvas.toDataURL('image/png', 1.0)
      const finalHeight = Math.min(imgHeight, A4_H)

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, finalHeight)
      pdf.save(`recu-${receiptNo}.pdf`)

      toast.success('Reçu PDF téléchargé avec succès !')
    } catch (error) {
      console.error('PDF generation error:', error)
      toast.error('Erreur lors de la génération du PDF')
    } finally {
      setGenerating(false)
    }
  }

  const addressParts = [school.address, school.city, school.province, school.country].filter(Boolean)
  const contactParts = [school.email, school.phone].filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* ── Header Bar ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Aperçu du Reçu</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadPDF}
              disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {generating ? 'Génération…' : 'Télécharger PDF'}
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-lg grid place-items-center hover:bg-gray-100 transition">
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* ── Receipt Card ─────────────────────────────────────────────── */}
        <div className="p-6">
          <div
            ref={receiptRef}
            style={{
              width: '794px',
              minHeight: '1123px',
              background: '#ffffff',
              borderRadius: '12px',
              overflow: 'hidden',
              fontFamily: "'Noto Sans', 'Segoe UI', Arial, sans-serif",
              position: 'relative',
              margin: '0 auto',
              boxShadow: '0 1px 8px rgba(0,0,0,.06)',
            }}
          >
            {/* ── Receipt Header ──────────────────────────────────────────── */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '36px 48px 28px', display: 'flex', alignItems: 'center', gap: '20px' }}>
              {/* School Badge */}
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'linear-gradient(135deg, #b8860b, #d4a843)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 700, color: '#0f172a', flexShrink: 0, letterSpacing: 1,
              }}>
                {getSchoolInitials(school.shortName)}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>{school.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 4, lineHeight: 1.5 }}>{addressParts.join(', ')}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>{contactParts.join('  |  ')}</div>
              </div>
            </div>

            {/* ── Receipt Body ────────────────────────────────────────────── */}
            <div style={{ padding: '32px 48px 20px' }}>
              {/* Title */}
              <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 700, color: '#0f172a', letterSpacing: 2, textTransform: 'uppercase' }}>
                Reçu de Paiement
              </div>

              {/* Meta */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12, color: '#64748b' }}>
                <span>N° du reçu : <strong style={{ color: '#0f172a' }}>{receiptNo}</strong></span>
                <span>Date d&apos;émission : <strong style={{ color: '#0f172a' }}>{formatDate(payment.paidAt || payment.createdAt)}</strong></span>
              </div>

              {/* Status Bar */}
              <div style={{ margin: '20px 0', padding: '14px 18px', background: '#f1f5f9', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{
                  padding: '5px 18px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: .5, whiteSpace: 'nowrap',
                  background: statusInfo.bg, color: statusInfo.text,
                }}>
                  {statusInfo.label}
                </span>
                <span style={{ fontSize: 12, color: '#475569' }}>{statusInfo.desc}</span>
              </div>

              {/* Student Info */}
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 12, paddingLeft: 10, borderLeft: '3px solid #b8860b' }}>
                Informations de l&apos;élève
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 32px', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Nom complet</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{student.lastName.toUpperCase()} {student.firstName}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Matricule</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{student.matricule}</div>
                </div>
              </div>

              {/* Divider */}
              <hr style={{ border: 'none', borderTop: '1px solid #cbd5e1', margin: '20px 0' }} />

              {/* Payment Details */}
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 12, paddingLeft: 10, borderLeft: '3px solid #b8860b' }}>
                Détails du paiement
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 32px', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Trimestre</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{getTrimesterLabel(payment.trimester)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Montant dû</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{formatCurrency(payment.amount)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Montant payé</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{formatCurrency(payment.paidAmount)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Reste à payer</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: remaining > 0 ? '#dc2626' : '#16a34a' }}>
                    {remaining > 0 ? formatCurrency(remaining) : '0 CDF'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Mode de paiement</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{getPaymentMethodLabel(payment.paymentMethod)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: .4 }}>Référence</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{payment.referenceNumber || '—'}</div>
                </div>
              </div>

              {/* Divider */}
              <hr style={{ border: 'none', borderTop: '1px solid #cbd5e1', margin: '20px 0' }} />

              {/* Summary Box */}
              <div style={{
                background: '#0f172a', borderRadius: 10, padding: '22px 28px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '24px 0',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .6 }}>Montant total payé</div>
                </div>
                <div>
                  <span style={{ fontSize: 32, fontWeight: 700, color: '#ffffff', letterSpacing: .5 }}>
                    {new Intl.NumberFormat('fr-FR').format(payment.paidAmount)}
                  </span>
                  <span style={{ fontSize: 14, color: '#d4a843', fontWeight: 500, marginLeft: 6 }}>CDF</span>
                </div>
              </div>
            </div>

            {/* ── Receipt Footer ──────────────────────────────────────────── */}
            <div style={{ padding: '16px 48px 28px', textAlign: 'center' }}>
              <hr style={{ border: 'none', borderTop: '1px solid #cbd5e1', marginBottom: 14 }} />
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Généré par <strong style={{ color: '#b8860b' }}>EduGest</strong> — La plateforme de gestion scolaire
              </div>
              <div style={{ fontSize: 9, color: '#cbd5e1', marginTop: 6 }}>
                Document généré automatiquement le {formatDate(new Date().toISOString())} — Ce reçu fait foi de paiement.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
