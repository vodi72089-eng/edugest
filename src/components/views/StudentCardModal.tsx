'use client'

import { useEffect, useRef, useState } from 'react'
import { authFetch } from '@/lib/store'
import { GOLD, GOLD_SOFT } from '@/lib/constants'
import StudentAvatar from '@/components/ui/StudentAvatar'
import QRCode from 'qrcode'
import { X, Download, IdCard } from 'lucide-react'

interface ProfileStudent {
  id: string
  matricule: string
  firstName: string
  lastName: string
  gender?: string | null
  dateOfBirth?: string | null
  address?: string | null
  phone?: string | null
  photoUrl?: string | null
  isExcluded?: boolean
  class?: { id: string; name: string; section?: string | null; level?: string | null } | null
  school?: { id: string; name: string; shortName?: string | null; logo?: string | null } | null
  schoolYear?: { id: string; label: string } | null
}

interface StudentCardModalProps {
  student: ProfileStudent
  onClose: () => void
}

/** Sexe : la base stocke 'M' / 'F'. */
function genderOf(g?: string | null): string {
  if (g === 'M') return 'Masculin'
  if (g === 'F') return 'Féminin'
  return '—'
}

/** Âge révolu à partir de la date de naissance (— si absente/invalide). */
function ageOf(birth?: string | null): string {
  if (!birth) return '—'
  const d = new Date(birth)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age >= 0 ? `${age} ans` : '—'
}

/** « PRIMAIRE » → « Primaire » (libellé présenté sur la carte). */
function titleCase(v: string): string {
  return v.charAt(0) + v.slice(1).toLowerCase()
}

/** Champ libellé de la carte (sexe, âge, classe, année). */
function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-white/40 text-[9px] uppercase tracking-wider leading-none">{label}</div>
      <div className="text-white/85 text-[12px] font-semibold truncate mt-0.5">{value}</div>
    </div>
  )
}

/**
 * Carte d'identité scolaire — format carte de crédit, avec QR code unique
 * menant à la page publique de vérification (/verify/document/[code]).
 * Le QR est enregistré dans le registre officiel (type STUDENT_CARD) :
 * scanner la carte prouve que l'élève est bien inscrit dans l'école.
 */
export default function StudentCardModal({ student, onClose }: StudentCardModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  // Données enrichies (école, année, sexe, âge, classe) si le contexte ne les
  // fournit pas — ex. ouverture depuis la liste qui ne joint pas l'école.
  const [extra, setExtra] = useState<{
    school?: ProfileStudent['school']
    schoolYear?: ProfileStudent['schoolYear']
    gender?: string | null
    dateOfBirth?: string | null
    class?: ProfileStudent['class']
  }>({})
  // Vrai quand l'enrichissement est terminé (ou sans rien à charger) :
  // le QR n'est enregistré qu'ensuite, pour que sexe/âge/classe/année
  // figurent dans les métadonnées de vérification.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const missing = !student.school || !student.schoolYear || !student.gender || !student.dateOfBirth || !student.class
    if (!missing) { setReady(true); return }
    let cancelled = false
    authFetch(`/api/students/${student.id}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        if (j.data) {
          setExtra({
            school: j.data.school,
            schoolYear: j.data.schoolYear,
            gender: j.data.gender,
            dateOfBirth: j.data.dateOfBirth,
            class: j.data.class,
          })
        }
        setReady(true)
      })
      .catch(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id])

  const school = extra.school || student.school
  const schoolYear = extra.schoolYear || student.schoolYear
  const gender = extra.gender ?? student.gender
  const dateOfBirth = extra.dateOfBirth ?? student.dateOfBirth
  const klass = extra.class || student.class

  const fullName = `${student.firstName} ${student.lastName}`.trim()
  const genderLabel = genderOf(gender)
  const ageLabel = ageOf(dateOfBirth)

  // Enregistre la carte dans le registre de vérification + génère le QR
  // (attend que l'école soit connue, sinon schoolId est absent → 400, et que
  //  l'enrichissement soit fini pour embarquer sexe/âge/classe/année)
  useEffect(() => {
    if (!ready) return
    const schoolId = school?.id
    const schoolName = school?.name
    if (!schoolId) return
    let cancelled = false
    async function setup() {
      try {
        const res = await authFetch('/api/document-verifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'STUDENT_CARD',
            studentId: student.id,
            schoolId,
            metadata: {
              firstName: student.firstName,
              lastName: student.lastName,
              matricule: student.matricule,
              className: klass?.name || null,
              schoolName: schoolName || null,
              gender: genderLabel !== '—' ? genderLabel : null,
              age: ageLabel !== '—' ? ageLabel : null,
              dateOfBirth: dateOfBirth || null,
              schoolYear: schoolYear?.label || null,
            },
          }),
        })
        const json = await res.json()
        if (!cancelled && json.data?.url) {
          const dataUrl = await QRCode.toDataURL(json.data.url, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 240,
            color: { dark: '#0a0f0d', light: '#ffffff' },
          })
          if (!cancelled) setQrDataUrl(dataUrl)
        }
      } catch { /* QR ignoré si échec */ }
    }
    setup()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id, school?.id, ready])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function downloadPng() {
    if (!cardRef.current || downloading) return
    setDownloading(true)
    try {
      const { default: html2canvas } = await import('html2canvas-pro')
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0a0f0d',
        scale: 2,
        useCORS: true,
      })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `carte-${student.matricule || student.id.slice(-6)}.png`
      a.click()
    } catch { /* silencieux */ }
    finally { setDownloading(false) }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Carte d'identité de ${fullName}`}
    >
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md">
        {/* Barre d'actions */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-white/70">
            <IdCard size={16} style={{ color: GOLD }} />
            <span className="text-xs font-semibold uppercase tracking-wider">Carte d'identité scolaire</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadPng}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-50"
              style={{ background: GOLD, color: '#0a0f0d' }}
              title="Télécharger la carte en PNG"
            >
              <Download size={13} />
              {downloading ? 'Génération…' : 'Télécharger'}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg grid place-items-center bg-white/10 hover:bg-white/20 transition text-white/70"
              aria-label="Fermer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── La carte ── */}
        <div
          ref={cardRef}
          className="relative rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: 'linear-gradient(160deg, #0a0f0d 0%, #0d1a14 55%, #0a0f0d 100%)', border: `1px solid ${GOLD}55` }}
        >
          {/* Bandeau or supérieur */}
          <div className="h-1.5" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />

          {/* En-tête : logos école + Look School 360 */}
          <div className="flex items-center justify-between px-5 pt-4">
            <div className="flex items-center gap-2.5">
              {school?.logo ? (
                <img src={school.logo} alt="" className="w-10 h-10 rounded-xl object-cover" style={{ border: `1px solid ${GOLD}44` }} />
              ) : (
                <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: GOLD_SOFT }}>
                  <span className="text-sm font-black" style={{ color: GOLD }}>{(school?.shortName || school?.name || 'EG').slice(0, 2).toUpperCase()}</span>
                </div>
              )}
              <div>
                <div className="text-white font-bold text-sm leading-tight">{school?.name || 'École'}</div>
                <div className="text-white/40 text-[10px] uppercase tracking-wider">{school?.shortName || ''}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-white font-black tracking-tight text-base">Look <span style={{ color: GOLD }}>School 360</span></div>
              <div className="text-white/40 text-[9px] uppercase tracking-widest">Plateforme officielle</div>
            </div>
          </div>

          {/* Corps : photo + infos */}
          <div className="flex gap-4 px-5 py-4">
            <div className="shrink-0">
              <StudentAvatar
                firstName={student.firstName}
                lastName={student.lastName}
                photoUrl={student.photoUrl}
                size={72}
                className="border-2"
                style={{ borderColor: GOLD }}
              />
            </div>
            <div className="flex-1 min-w-0 space-y-2 py-1">
              <div className="text-white font-extrabold text-lg leading-tight truncate">{fullName}</div>
              <div className="font-mono text-[13px] font-bold" style={{ color: GOLD }}>{student.matricule || '—'}</div>

              {/* État civil scolaire : sexe, âge, classe, année */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <InfoField label="Sexe" value={genderLabel} />
                <InfoField label="Âge" value={ageLabel} />
                <InfoField
                  label="Classe"
                  value={klass ? `${klass.name}${klass.section ? ` — ${titleCase(klass.section)}` : ''}` : '—'}
                />
                <InfoField label="Année" value={schoolYear?.label || '—'} />
              </div>
            </div>
          </div>

          {/* QR de vérification */}
          <div className="flex items-center gap-4 px-5 pb-4">
            <div className="shrink-0 p-2 bg-white rounded-xl">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR de vérification" className="w-24 h-24" />
              ) : (
                <div className="w-24 h-24 grid place-items-center text-[10px] text-gray-400">QR…</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white/50 text-[10px] uppercase tracking-wider mb-1">Vérification d'identité</div>
              <p className="text-white/70 text-[11px] leading-snug">
                Scannez ce QR code pour vérifier que cet élève est bien inscrit dans cette école.
              </p>
              <div className="text-white/30 text-[10px] mt-1.5 font-mono">
                {student.matricule ? `EDUGEST-ID:${student.matricule}` : ''}
              </div>
            </div>
          </div>

          {/* Bandeau or inférieur */}
          <div className="h-1.5" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        </div>
      </div>
    </div>
  )
}
