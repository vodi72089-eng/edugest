import { getVerificationRecord } from '@/lib/document-verify';
import { db } from '@/lib/db';
import { ShieldCheck, ShieldX, School, FileText, CalendarDays } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Vérification de document — EduGest',
};

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d));
}

export default async function VerifyDocumentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let record: Awaited<ReturnType<typeof getVerificationRecord>> = null;
  try {
    record = await getVerificationRecord(code);
  } catch {
    record = null;
  }

  // enrichir l'élève si présent
  let student: { firstName: string; lastName: string; matricule: string } | null = null;
  if (record?.studentId) {
    try {
      student = await db.student.findUnique({
        where: { id: record.studentId },
        select: { firstName: true, lastName: true, matricule: true },
      });
    } catch { student = null; }
  }

  const meta = (() => {
    try { return JSON.parse(record?.metadata || '{}') as Record<string, unknown>; } catch { return {}; }
  })();

  const typeLabel = record?.type === 'RECEIPT' ? 'Reçu de paiement' : record?.type === 'BULLETIN' ? 'Bulletin scolaire' : 'Document';
  const isOfficial = !!record;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #0a0f0d 0%, #0b1613 40%, #0d1f1a 100%)' }}>
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5">
        <div className="flex items-center gap-2.5">
          <img src="/edugest-logo-mark.png" alt="Logo EduGest" className="w-10 h-10 object-contain" />
          <div>
            <div className="text-white font-bold tracking-tight text-lg">Edu<span style={{ color: 'oklch(72% 0.15 65)' }}>Gest</span></div>
            <div className="text-white/40 text-[11px]">Vérification de documents officiels</div>
          </div>
        </div>
        <Link href="/" className="text-white/40 hover:text-white text-xs font-semibold uppercase tracking-widest transition">Accueil</Link>
      </header>

      <main className="relative z-10 flex-1 flex items-start justify-center px-4 py-8 sm:py-14">
        <div className="w-full max-w-xl">
          {/* Bandeau officiel */}
          <div
            className="rounded-2xl p-6 sm:p-8 text-center mb-6 border"
            style={{
              background: isOfficial ? 'rgba(0,135,90,0.12)' : 'rgba(186,26,26,0.12)',
              borderColor: isOfficial ? 'rgba(0,135,90,0.45)' : 'rgba(186,26,26,0.45)',
            }}
          >
            <div
              className="mx-auto w-16 h-16 rounded-full grid place-items-center mb-4"
              style={{ background: isOfficial ? 'rgba(0,135,90,0.25)' : 'rgba(186,26,26,0.25)' }}
            >
              {isOfficial
                ? <ShieldCheck size={32} style={{ color: '#22c55e' }} />
                : <ShieldX size={32} style={{ color: '#ef4444' }} />}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
              {isOfficial ? 'Document officiel' : 'Document non reconnu'}
            </h1>
            <p className="text-white/60 text-sm max-w-md mx-auto">
              {isOfficial
                ? `Ce ${typeLabel.toLowerCase()} a bien été généré par EduGest. Il est authentique et officiel.`
                : 'Aucun document officiel EduGest ne correspond à ce code. Le document pourrait être falsifié ou le lien est incorrect.'}
            </p>
          </div>

          {isOfficial && record && (
            <div className="rounded-2xl border border-white/10 p-6 sm:p-7" style={{ background: 'rgba(26, 37, 32, 0.55)', backdropFilter: 'blur(24px)' }}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-white font-bold text-lg flex items-center gap-2">
                  <FileText size={18} style={{ color: 'oklch(72% 0.15 65)' }} /> Informations du document
                </h2>
                <span
                  className="text-[11px] font-bold px-3 py-1 rounded-full"
                  style={{ background: 'oklch(72% 0.15 65 / 0.15)', color: 'oklch(72% 0.15 65)' }}
                >
                  {typeLabel}
                </span>
              </div>

              <dl className="space-y-3">
                {/* École */}
                <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/5">
                  <dt className="text-white/45 text-[13px] font-medium flex items-center gap-1.5"><School size={13} /> École</dt>
                  <dd className="text-white text-[13px] font-semibold text-right">{record.school?.name || '—'}</dd>
                </div>

                {/* Élève */}
                {!!(student || meta.studentName) && (
                  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/5">
                    <dt className="text-white/45 text-[13px] font-medium">Élève</dt>
                    <dd className="text-white text-[13px] font-semibold text-right">
                      {student ? `${student.firstName} ${student.lastName}` : String(meta.studentName || '—')}
                      {student?.matricule ? <span className="block text-white/40 text-[11px] font-normal">Matricule : {student.matricule}</span> : null}
                      {meta.className ? <span className="block text-white/40 text-[11px] font-normal">Classe : {String(meta.className)}</span> : null}
                    </dd>
                  </div>
                )}

                {/* Trimestre */}
                {record.trimester && (
                  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/5">
                    <dt className="text-white/45 text-[13px] font-medium">Période</dt>
                    <dd className="text-white text-[13px] font-semibold text-right">
                      {record.trimester === 'T1' ? '1er Trimestre' : record.trimester === 'T2' ? '2ème Trimestre' : record.trimester === 'T3' ? '3ème Trimestre' : record.trimester}
                    </dd>
                  </div>
                )}

                {/* Bulletin : moyenne + décision */}
                {record.type === 'BULLETIN' && meta.average !== undefined && (
                  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/5">
                    <dt className="text-white/45 text-[13px] font-medium">Moyenne générale</dt>
                    <dd className="text-[13px] font-semibold text-right" style={{ color: 'oklch(72% 0.15 65)' }}>
                      {Number(meta.average).toFixed(2)}/20
                      {meta.mention ? <span className="block text-white/40 text-[11px] font-normal">{String(meta.mention)}</span> : null}
                    </dd>
                  </div>
                )}

                {/* Reçu : montants */}
                {record.type === 'RECEIPT' && meta.paidAmount !== undefined && (
                  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/5">
                    <dt className="text-white/45 text-[13px] font-medium">Montant payé</dt>
                    <dd className="text-[13px] font-semibold text-right" style={{ color: '#22c55e' }}>
                      {Number(meta.paidAmount).toLocaleString('fr-FR')} CDF
                      {meta.receiptNumber ? <span className="block text-white/40 text-[11px] font-normal">Reçu n° {String(meta.receiptNumber)}</span> : null}
                    </dd>
                  </div>
                )}

                {/* Généré le */}
                <div className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="text-white/45 text-[13px] font-medium flex items-center gap-1.5"><CalendarDays size={13} /> Enregistré le</dt>
                  <dd className="text-white text-[13px] font-semibold text-right">{formatDate(record.createdAt)}</dd>
                </div>
              </dl>

              <div className="mt-6 rounded-xl p-4 text-center" style={{ background: 'rgba(0,135,90,0.1)', border: '1px solid rgba(0,135,90,0.3)' }}>
                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(134,239,172,0.9)' }}>
                  <strong className="font-bold">Authenticité vérifiée.</strong> Ce document est enregistré dans le registre officiel
                  de l&apos;école via EduGest. Toute modification du PDF invaliderait le code de vérification.
                </p>
              </div>
            </div>
          )}

          <p className="text-center text-white/25 text-[11px] mt-8">
            EduGest — La plateforme de gestion scolaire · Code de vérification : <span className="font-mono">{code.slice(0, 12)}…</span>
          </p>
        </div>
      </main>

      <footer className="relative z-10 text-center text-white/25 text-[12px] py-5">
        © 2026 EduGest · Kinshasa · Dakar · Abidjan
      </footer>
    </div>
  );
}
