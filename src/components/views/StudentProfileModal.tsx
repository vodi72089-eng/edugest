'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/store'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, ACCENT, GOLD_SOFT, DANGER, WARNING, SUCCESS, SUCCESS_SOFT, IVORY } from '@/lib/constants'
import { formatDate } from '@/lib/helpers'
import StudentAvatar from '@/components/ui/StudentAvatar'
import { X, Shield, Megaphone, Calendar, GraduationCap, Users, Phone, Mail, MapPin, AlertTriangle, Ban, Award, RotateCcw, School } from 'lucide-react'

// Priorité « une seule liste par élève » : Blanche < Grise < Noire
// (même règle que celle de DisciplineView).
const LIST_RANK: Record<string, number> = { WHITELIST: 1, GREYLIST: 2, BLACKLIST: 3 }

const LIST_LABEL: Record<string, string> = {
  BLACKLIST: 'Liste Noire',
  GREYLIST: 'Liste Grise',
  WHITELIST: 'Liste Blanche',
}

const TYPE_LABEL: Record<string, string> = {
  RETARD: 'Retard',
  ABSENCE: 'Absence',
  TRICHERIE: 'Tricherie',
  VIOLENCE: 'Violence',
  INCIVILITE: 'Incivilité',
  EXCELLENCE: 'Excellence',
  MERITE: 'Mérite',
  CLEAN: 'Aucune infraction',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmé',
  RESOLVED: 'Résolu',
  ARCHIVED: 'Archivé',
}

interface ProfileRecord {
  id: string; type: string; severity: string; title: string; description: string;
  points: number; listType: string; status: string; createdAt: string
}

interface ProfileStudent {
  id: string; matricule: string; firstName: string; lastName: string
  gender?: string | null; dateOfBirth?: string | null; address?: string | null
  phone?: string | null; photoUrl?: string | null; isExcluded?: boolean
  class?: { id: string; name: string; section?: string | null; level?: string | null } | null
  parent?: { id: string; name: string; email?: string | null; phone?: string | null } | null
  school?: { id: string; name: string; shortName?: string | null } | null
  schoolYear?: { id: string; label: string } | null
  disciplineRecords?: ProfileRecord[]
}

interface ProfileConvocation {
  id: string; motif: string; date: string; status: string
}

function ageFromDate(dateStr: string): number {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return 0
  const diff = Date.now() - d.getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

function ListBadge({ listType }: { listType: string }) {
  const cfg = listType === 'BLACKLIST'
    ? { bg: 'oklch(95% 0.04 25)', color: DANGER, icon: <Ban size={11} /> }
    : listType === 'GREYLIST'
      ? { bg: GOLD_SOFT, color: WARNING, icon: <AlertTriangle size={11} /> }
      : { bg: SUCCESS_SOFT, color: SUCCESS, icon: <Award size={11} /> }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.icon} {LIST_LABEL[listType] || listType}
    </span>
  )
}

function InfoTile({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={{ background: IVORY }}>
      <div className="text-[11px] font-medium uppercase tracking-wider flex items-center gap-1.5 mb-1" style={{ color: TEXT_MUTED_LUXE }}>
        {icon} {label}
      </div>
      <div className="text-sm font-semibold break-words" style={{ color: TEXT_PRIMARY }}>{value}</div>
    </div>
  )
}

interface StudentProfileModalProps {
  studentId: string
  onClose: () => void
  /** Rôles habilités à ouvrir un formulaire d'action depuis la fiche. */
  canAct?: boolean
  onSanction?: (studentId: string) => void
  onConvocation?: (studentId: string) => void
}

/**
 * Fiche élève détaillée — ouverte par simple clic sur un élève (Discipline).
 * Combine identité, contact parent, statistiques disciplinaires, historique
 * complet des incidents et convocations. Une seule requête suffit :
 * GET /api/students/:id renvoie déjà l'élève + disciplineRecords.
 */
export default function StudentProfileModal({ studentId, onClose, canAct = false, onSanction, onConvocation }: StudentProfileModalProps) {
  // L'état initial est celui du CHARGEMENT : le parent monte la modale avec
  // `key={studentId}`, donc chaque nouvel élève crée un composant neuf — pas
  // de remise à zéro synchrone dans l'effet (règle react-hooks/set-state-in-effect).
  const [student, setStudent] = useState<ProfileStudent | null>(null)
  const [convocations, setConvocations] = useState<ProfileConvocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    authFetch(`/api/students/${studentId}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        if (!j.data) { setError(j.error || 'Élève introuvable'); return }
        setStudent(j.data)
      })
      .catch(() => { if (!cancelled) setError('Erreur réseau : le serveur ne répond pas. Rechargez la page (F5) puis réessayez.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    // Convocation facultative : la feature peut être absente du forfait (403)
    // — on masque simplement la section dans ce cas.
    authFetch(`/api/convocations?studentId=${studentId}&limit=20`)
      .then(r => { if (r.ok) return r.json(); return null })
      .then(j => { if (!cancelled && j && Array.isArray(j.data)) setConvocations(j.data) })
      .catch(() => { /* silencieux */ })

    return () => { cancelled = true }
  }, [studentId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const records = student?.disciplineRecords || []
  const stats = (() => {
    let list: 'BLACKLIST' | 'GREYLIST' | 'WHITELIST' = 'WHITELIST'
    let points = 0
    for (const r of records) {
      points += r.points || 0
      const lt = r.listType as 'BLACKLIST' | 'GREYLIST' | 'WHITELIST'
      if ((LIST_RANK[r.listType] || 0) > LIST_RANK[list]) list = lt
    }
    return { list, points, count: records.length, last: records[0]?.createdAt }
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={student ? `Fiche de ${student.firstName} ${student.lastName}` : 'Fiche élève'}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
        onClick={e => e.stopPropagation()}
      >
        {/* ── En-tête ──────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-[oklch(90%_0.01_175)] flex items-start gap-4 sticky top-0 bg-white z-10 rounded-t-2xl">
          {student ? (
            <StudentAvatar
              firstName={student.firstName}
              lastName={student.lastName}
              photoUrl={student.photoUrl}
              size={56}
              className="border-2 shrink-0"
              style={{ borderColor: ACCENT, background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}
            />
          ) : (
            <div className="w-14 h-14 rounded-full shrink-0 animate-pulse" style={{ background: IVORY }} />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold truncate" style={{ color: TEXT_PRIMARY }}>
              {student ? `${student.firstName} ${student.lastName}` : 'Fiche élève'}
            </h3>
            <div className="text-xs flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: TEXT_MUTED_LUXE }}>
              <span>{student?.matricule || '—'}</span>
              {student?.class && (
                <span style={{ color: ACCENT }}>
                  · Classe {student.class.name}{student.class.section ? ` — ${student.class.section}` : ''}
                </span>
              )}
              {student?.isExcluded && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'oklch(95% 0.04 25)', color: DANGER }}>
                  Exclu
                </span>
              )}
            </div>
            {student && (
              <div className="mt-2"><ListBadge listType={stats.list} /></div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canAct && student && (onSanction || onConvocation) && (
              <div className="hidden sm:flex items-center gap-2">
                {onSanction && (
                  <button
                    onClick={() => onSanction(student.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
                    style={{ background: DANGER }}
                  >
                    <Shield size={13} /> Sanctionner
                  </button>
                )}
                {onConvocation && (
                  <button
                    onClick={() => onConvocation(student.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
                    style={{ background: WARNING }}
                  >
                    <Megaphone size={13} /> Convocation
                  </button>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition"
              style={{ color: TEXT_MUTED_LUXE }}
              title="Fermer (Échap)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Corps ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="px-6 py-10 text-center text-sm" style={{ color: TEXT_MUTED_LUXE }}>
            <div className="h-6 w-6 border-2 border-[oklch(85%_0.05_65)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Chargement de la fiche…
          </div>
        ) : error ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm" style={{ color: DANGER }}>{error}</p>
            <button
              onClick={() => { setError(''); setLoading(true); setStudent(null); authFetch(`/api/students/${studentId}`).then(r => r.json()).then(j => { if (j.data) setStudent(j.data); else setError(j.error || 'Élève introuvable') }).catch(() => setError('Erreur réseau : le serveur ne répond pas. Rechargez la page (F5) puis réessayez.')).finally(() => setLoading(false)) }}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)]"
              style={{ color: TEXT_PRIMARY }}
            >
              <RotateCcw size={13} /> Réessayer
            </button>
          </div>
        ) : student ? (
          <div className="px-6 py-5 space-y-5">
            {/* Statistiques disciplinaires */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl p-3" style={{ background: IVORY }}>
                <div className="text-[11px] uppercase tracking-wider font-medium" style={{ color: TEXT_MUTED_LUXE }}>Points</div>
                <div className="text-xl font-extrabold" style={{ color: stats.points > 0 ? SUCCESS : stats.points < 0 ? DANGER : TEXT_PRIMARY }}>
                  {stats.points > 0 ? '+' : ''}{stats.points}
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: IVORY }}>
                <div className="text-[11px] uppercase tracking-wider font-medium" style={{ color: TEXT_MUTED_LUXE }}>Incidents</div>
                <div className="text-xl font-extrabold" style={{ color: TEXT_PRIMARY }}>{stats.count}</div>
              </div>
              <div className="rounded-xl p-3" style={{ background: IVORY }}>
                <div className="text-[11px] uppercase tracking-wider font-medium" style={{ color: TEXT_MUTED_LUXE }}>Dernier</div>
                <div className="text-sm font-bold pt-1" style={{ color: TEXT_PRIMARY }}>{stats.last ? formatDate(stats.last) : '—'}</div>
              </div>
              <div className="rounded-xl p-3" style={{ background: IVORY }}>
                <div className="text-[11px] uppercase tracking-wider font-medium" style={{ color: TEXT_MUTED_LUXE }}>Statut</div>
                <div className="text-sm font-bold pt-1" style={{ color: stats.list === 'BLACKLIST' ? DANGER : stats.list === 'GREYLIST' ? WARNING : SUCCESS }}>
                  {student.isExcluded ? 'Exclu' : 'Actif'}
                </div>
              </div>
            </div>

            {/* Identité */}
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: GOLD }}>
                <Users size={13} /> Identité
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <InfoTile label="Sexe" value={student.gender === 'M' ? 'Masculin' : student.gender === 'F' ? 'Féminin' : '—'} />
                <InfoTile
                  label="Naissance"
                  icon={<Calendar size={11} />}
                  value={student.dateOfBirth
                    ? <>{new Date(student.dateOfBirth).toLocaleDateString('fr-FR')}{ageFromDate(student.dateOfBirth) ? <span className="font-normal" style={{ color: TEXT_MUTED_LUXE }}> · {ageFromDate(student.dateOfBirth)} ans</span> : null}</>
                    : '—'}
                />
                <InfoTile label="Classe" icon={<GraduationCap size={11} />} value={student.class ? `${student.class.name}${student.class.section ? ` — ${student.class.section}` : ''}` : '—'} />
                <InfoTile label="Année scolaire" value={student.schoolYear?.label || '—'} />
                <InfoTile label="École" icon={<School size={11} />} value={student.school?.name || '—'} />
                <InfoTile label="Téléphone" icon={<Phone size={11} />} value={student.phone || '—'} />
              </div>
              {student.address && (
                <div className="mt-3 rounded-xl p-3 flex items-start gap-2" style={{ background: IVORY }}>
                  <MapPin size={14} className="shrink-0 mt-0.5" style={{ color: GOLD }} />
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-medium" style={{ color: TEXT_MUTED_LUXE }}>Adresse</div>
                    <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{student.address}</div>
                  </div>
                </div>
              )}
            </section>

            {/* Parent / tuteur */}
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: GOLD }}>
                <Users size={13} /> Parent / tuteur
              </h4>
              {student.parent ? (
                <div className="rounded-xl border border-[oklch(90%_0.01_175)] p-3">
                  <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{student.parent.name}</div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                    <span className="inline-flex items-center gap-1"><Phone size={12} /> {student.parent.phone || '—'}</span>
                    <span className="inline-flex items-center gap-1"><Mail size={12} /> {student.parent.email || '—'}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[oklch(90%_0.01_175)] p-3 text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                  Aucun parent lié à cet élève.
                </div>
              )}
            </section>

            {/* Historique disciplinaire */}
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: GOLD }}>
                <Shield size={13} /> Historique disciplinaire ({records.length})
              </h4>
              {records.length === 0 ? (
                <div className="rounded-xl p-4 text-sm flex items-center gap-2" style={{ background: SUCCESS_SOFT, color: SUCCESS }}>
                  <Award size={15} /> Aucun incident enregistré — élève en Liste Blanche.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {records.map(r => (
                    <div key={r.id} className="rounded-xl border border-[oklch(90%_0.01_175)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: TEXT_PRIMARY }}>{r.title}</div>
                          <div className="text-[11px] mt-0.5 flex flex-wrap items-center gap-x-2" style={{ color: TEXT_MUTED_LUXE }}>
                            <span>{TYPE_LABEL[r.type] || r.type}</span>
                            <span>·</span>
                            <span>{formatDate(r.createdAt)}</span>
                            <span>·</span>
                            <span>{STATUS_LABEL[r.status] || r.status}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={
                              r.severity === 'HIGH' ? { background: 'oklch(95% 0.04 25)', color: DANGER }
                                : r.severity === 'MEDIUM' ? { background: 'oklch(95% 0.04 85)', color: WARNING }
                                  : r.severity === 'LOW' ? { background: GOLD_SOFT, color: GOLD }
                                    : { background: IVORY, color: TEXT_MUTED_LUXE }
                            }
                          >
                            {r.severity === 'HIGH' ? 'Grave' : r.severity === 'MEDIUM' ? 'Moyen' : r.severity === 'LOW' ? 'Faible' : '—'}
                          </span>
                          <span className="text-[13px] font-bold" style={{ color: r.points > 0 ? SUCCESS : r.points < 0 ? DANGER : TEXT_MUTED_LUXE }}>
                            {r.points > 0 ? '+' : ''}{r.points}
                          </span>
                        </div>
                      </div>
                      {r.description && (
                        <p className="text-xs mt-1.5" style={{ color: TEXT_MUTED_LUXE }}>{r.description}</p>
                      )}
                      <div className="mt-2"><ListBadge listType={r.listType} /></div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Convocations (facultatif) */}
            {convocations.length > 0 && (
              <section>
                <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: WARNING }}>
                  <Megaphone size={13} /> Convocations ({convocations.length})
                </h4>
                <div className="space-y-2">
                  {convocations.map(c => (
                    <div key={c.id} className="rounded-xl border border-[oklch(90%_0.01_175)] p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: TEXT_PRIMARY }}>{c.motif}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{formatDate(c.date)}</div>
                      </div>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                        style={
                          c.status === 'CONFIRMED' ? { background: SUCCESS_SOFT, color: SUCCESS }
                            : c.status === 'PENDING' ? { background: GOLD_SOFT, color: GOLD }
                              : { background: IVORY, color: TEXT_MUTED_LUXE }
                        }
                      >
                        {STATUS_LABEL[c.status] || c.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
