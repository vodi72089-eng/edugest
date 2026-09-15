'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useEduGestStore, authFetch } from '@/lib/store';
import { hasFeatureAccess } from '@/lib/subscription';
import {
  FileText, Plus, Search, Download, HeartPulse, FileHeart, ClipboardList,
  Lock, X, RefreshCw, Hash, User as UserIcon, Stethoscope
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Gestion des fiches médicales — stockage des documents médicaux officiels
 * (dispenses, fiches de santé, registres) avec PDF au design gianelli.
 *
 * Accès : SUPER_ADMIN_GLOBAL, SCHOOL_ADMIN et MEDICAL — et seulement pour les
 * écoles dont l'abonnement supporte le module médical (PREMIUM et plus).
 */

const AUTRE = '__AUTRE__';

const MOTIFS_DISPENSE = [
  'Entorse', 'Fracture / plâtre', 'Asthme à l\'effort', 'Convalescence post-maladie',
  'Certificat médical (sans précision)',
];

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  DISPENSE_MEDICALE: { label: 'Dispense', icon: <FileHeart size={14} />, color: 'oklch(45% 0.15 145)', bg: 'oklch(95% 0.05 145)' },
  FICHE_SANTE: { label: 'Fiche de santé', icon: <HeartPulse size={14} />, color: 'oklch(50% 0.18 25)', bg: 'oklch(95% 0.04 25)' },
  REGISTRE_SANTE: { label: 'Registre', icon: <ClipboardList size={14} />, color: 'oklch(45% 0.12 250)', bg: 'oklch(94% 0.03 250)' },
};

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

export default function MedicalRecordsView() {
  const { userData, userRole } = useEduGestStore();
  const tier = userData?.subscriptionTier || 'FREEMIUM';
  const hasAccess = hasFeatureAccess(tier, 'medical') || userRole === 'SUPER_ADMIN_GLOBAL';
  const roleAllowed = userRole === 'SUPER_ADMIN_GLOBAL' || userRole === 'SCHOOL_ADMIN' || userRole === 'MEDICAL';

  const [docs, setDocs] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<'DISPENSE_MEDICALE' | 'FICHE_SANTE' | 'REGISTRE_SANTE'>('DISPENSE_MEDICALE');
  const [creating, setCreating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // ── Formulaire générique ──
  const [form, setForm] = useState<any>({
    studentId: '',
    // dispense
    dispensationType: 'EPS',
    startDate: '',
    endDate: '',
    motif: '',
    motifAutre: '',
    doctorName: '',
    recommendations: '',
    // fiche de santé
    bloodGroup: '', allergies: '', chronicConditions: '', regularMedication: '',
    emergencyContactName: '', emergencyContactPhone: '', doctorPhone: '', notes: '',
    // registre
    classId: '', regFrom: '', regTo: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [docsRes, studentsRes, classesRes] = await Promise.all([
        authFetch('/api/medical/documents?limit=300'),
        authFetch('/api/students?limit=1000'),
        authFetch('/api/classes?limit=200'),
      ]);
      if (docsRes.ok) setDocs((await docsRes.json()).data || []);
      if (studentsRes.ok) setStudents((await studentsRes.json()).data || []);
      if (classesRes.ok) setClasses((await classesRes.json()).data || []);
    } catch {
      toast.error('Erreur de chargement des documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasAccess && roleAllowed) load();
  }, [hasAccess, roleAllowed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (typeFilter !== 'ALL' && d.type !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        d.docCode, d.title,
        d.student ? `${d.student.firstName} ${d.student.lastName}` : '',
        d.student?.matricule || '',
        d.student?.class?.name || '',
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [docs, search, typeFilter]);

  const stats = useMemo(() => ({
    total: docs.length,
    dispenses: docs.filter((d) => d.type === 'DISPENSE_MEDICALE').length,
    fiches: docs.filter((d) => d.type === 'FICHE_SANTE').length,
    registres: docs.filter((d) => d.type === 'REGISTRE_SANTE').length,
  }), [docs]);

  async function downloadPdf(doc: any) {
    setDownloadingId(doc.id);
    try {
      const res = await authFetch(`/api/medical/documents/${doc.id}/pdf`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.docCode.toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`PDF ${doc.docCode} téléchargé`);
    } catch {
      toast.error('Erreur lors du téléchargement du PDF');
    } finally {
      setDownloadingId(null);
    }
  }

  async function openCreate(type: typeof createType) {
    setCreateType(type);
    setForm((f: any) => ({ ...f, studentId: '', dispensationType: 'EPS', startDate: '', endDate: '', motif: '', motifAutre: '', doctorName: '', recommendations: '' }));
    setShowCreate(true);
  }

  // Fiche de santé : pré-remplir depuis la fiche existante de l'élève
  useEffect(() => {
    if (!showCreate || createType !== 'FICHE_SANTE' || !form.studentId) return;
    (async () => {
      try {
        const res = await authFetch(`/api/medical/records?studentId=${form.studentId}`);
        if (res.ok) {
          const json = await res.json();
          const rec = json.data?.[0] || json.data || null;
          if (rec && rec.id) {
            setForm((f: any) => ({
              ...f,
              bloodGroup: rec.bloodGroup || '', allergies: rec.allergies || '',
              chronicConditions: rec.chronicConditions || '', regularMedication: rec.regularMedication || '',
              emergencyContactName: rec.emergencyContactName || '', emergencyContactPhone: rec.emergencyContactPhone || '',
              doctorName: rec.doctorName || '', doctorPhone: rec.doctorPhone || '', notes: rec.notes || '',
            }));
          }
        }
      } catch { /* pré-remplissage best-effort */ }
    })();
  }, [showCreate, createType, form.studentId]);

  async function handleCreate() {
    setCreating(true);
    try {
      if (createType === 'DISPENSE_MEDICALE') {
        if (!form.studentId || !form.startDate || !form.endDate) {
          toast.error('Élève et dates requis'); setCreating(false); return;
        }
        const reason = form.motif === AUTRE ? (form.motifAutre || 'Motif non précisé') : (form.motif || 'Motif non précisé');
        const res = await authFetch('/api/medical/documents', {
          method: 'POST',
          body: JSON.stringify({
            type: 'DISPENSE_MEDICALE',
            studentId: form.studentId,
            title: `Dispense ${form.dispensationType} - ${studentLabel(form.studentId)}`,
            content: {
              dispensationType: form.dispensationType,
              startDate: form.startDate,
              endDate: form.endDate,
              reason,
              doctorName: form.doctorName || null,
              recommendations: form.recommendations || null,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        toast.success(`Dispense créée — code ${json.data.docCode}`);
      } else if (createType === 'FICHE_SANTE') {
        if (!form.studentId) { toast.error('Sélectionnez un élève'); setCreating(false); return; }
        // Derniers passages à l'infirmerie de l'élève (figés dans le PDF)
        let lastVisits: any[] = [];
        try {
          const resV = await authFetch(`/api/medical/visits?studentId=${form.studentId}`);
          if (resV.ok) {
            const jsonV = await resV.json();
            lastVisits = (jsonV.data || []).slice(0, 4).map((v: any) => ({
              visitDate: v.visitDate, reason: v.reason || '—',
              decision: v.decision || '—', temperature: v.temperature ?? null,
            }));
          }
        } catch { /* best effort */ }
        const res = await authFetch('/api/medical/documents', {
          method: 'POST',
          body: JSON.stringify({
            type: 'FICHE_SANTE',
            studentId: form.studentId,
            title: `Fiche de santé - ${studentLabel(form.studentId)}`,
            content: {
              bloodGroup: form.bloodGroup, allergies: form.allergies,
              chronicConditions: form.chronicConditions, regularMedication: form.regularMedication,
              emergencyContactName: form.emergencyContactName, emergencyContactPhone: form.emergencyContactPhone,
              doctorName: form.doctorName, doctorPhone: form.doctorPhone, notes: form.notes,
              lastVisits,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        toast.success(`Fiche de santé créée — code ${json.data.docCode}`);
      } else {
        // REGISTRE : filtrer les visites de la période/classe et figer le contenu
        const resV = await authFetch(`/api/medical/visits?schoolId=${userData?.schoolId || ''}`);
        if (!resV.ok) throw new Error('Impossible de charger les visites');
        const jsonV = await resV.json();
        const allVisits: any[] = jsonV.data || [];
        const from = form.regFrom ? new Date(form.regFrom) : null;
        const to = form.regTo ? new Date(form.regTo + 'T23:59:59') : null;
        const cls = classes.find((c) => c.id === form.classId);
        const visits = allVisits
          .filter((v) => {
            const d = new Date(v.visitDate);
            if (from && d < from) return false;
            if (to && d > to) return false;
            if (form.classId && v.student?.classId !== form.classId) return false;
            return true;
          })
          .map((v) => ({
            visitDate: v.visitDate,
            studentName: v.student ? `${v.student.firstName} ${v.student.lastName}` : '—',
            className: v.student?.class?.name || '—',
            reason: v.reason || '—',
            decision: v.decision || '—',
            temperature: v.temperature ?? null,
            parentNotified: !!v.parentNotified,
          }));
        const res = await authFetch('/api/medical/documents', {
          method: 'POST',
          body: JSON.stringify({
            type: 'REGISTRE_SANTE',
            studentId: null,
            title: `Registre de santé ${cls ? cls.name : 'toutes classes'}${from || to ? ' — ' + (from ? fmtDate(from) : '…') + ' → ' + (to ? fmtDate(to) : '…') : ''}`,
            content: {
              periodFrom: form.regFrom || null,
              periodTo: form.regTo || null,
              className: cls ? cls.name : 'Toutes les classes',
              visits,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        toast.success(`Registre créé (${visits.length} passages) — code ${json.data.docCode}`);
      }
      setShowCreate(false);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  }

  function studentLabel(id: string): string {
    const s = students.find((x) => x.id === id);
    return s ? `${s.lastName} ${s.firstName}` : 'élève';
  }

  // ── Accès refusé ──
  if (!roleAllowed) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md mx-auto p-8">
          <Lock className="w-12 h-12 mx-auto mb-4" style={{ color: 'oklch(55% 0.05 25)' }} />
          <h3 className="text-xl font-bold mb-2" style={{ color: 'oklch(25% 0.02 175)' }}>Accès réservé</h3>
          <p className="text-sm" style={{ color: 'oklch(45% 0.02 175)' }}>
            La gestion des fiches médicales est réservée à l&apos;administration de l&apos;école et au service médical.
          </p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md mx-auto p-8 rounded-3xl" style={{ background: 'oklch(97% 0.01 65)', border: '1px solid oklch(88% 0.06 75)' }}>
          <Lock className="w-12 h-12 mx-auto mb-4" style={{ color: 'oklch(70% 0.13 75)' }} />
          <h3 className="text-xl font-bold mb-2" style={{ color: 'oklch(35% 0.08 75)' }}>Module médical Premium</h3>
          <p className="text-sm mb-4" style={{ color: 'oklch(45% 0.05 75)' }}>
            La gestion des fiches médicales est disponible à partir de l&apos;offre <strong>Professionnel</strong>.
            Votre forfait actuel : <strong>{getTierLabel(tier)}</strong>.
          </p>
          <button
            onClick={() => useEduGestStore.getState().setCurrentView('my-subscription' as any)}
            className="px-5 py-2.5 rounded-xl font-semibold text-white text-sm transition-transform hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, oklch(60% 0.16 75), oklch(52% 0.14 60))' }}
          >
            Découvrir les offres
          </button>
        </div>
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all';
  const inputStyle = { background: 'oklch(98% 0.005 175)', border: '1px solid oklch(90% 0.01 175)', color: 'oklch(25% 0.02 175)' };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête + stats */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: 'oklch(25% 0.02 175)' }}>
            <Stethoscope size={22} style={{ color: 'oklch(55% 0.18 25)' }} />
            Gestion des fiches médicales
          </h2>
          <p className="text-sm mt-1" style={{ color: 'oklch(45% 0.02 175)' }}>
            Documents officiels générés en PDF — codes uniques vérifiables dans « Vérification »
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2.5 rounded-xl transition hover:bg-white" style={{ background: 'oklch(96% 0.008 175)' }} title="Rafraîchir">
            <RefreshCw size={16} style={{ color: 'oklch(40% 0.02 175)' }} />
          </button>
          <button
            onClick={() => openCreate('DISPENSE_MEDICALE')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-white text-sm transition-transform hover:scale-[1.02] shadow-lg"
            style={{ background: 'linear-gradient(135deg, oklch(55% 0.18 25), oklch(48% 0.15 20))' }}
          >
            <Plus size={16} /> Nouveau document
          </button>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total documents', value: stats.total, icon: <FileText size={18} />, color: 'oklch(45% 0.05 250)' },
          { label: 'Dispenses', value: stats.dispenses, icon: <FileHeart size={18} />, color: 'oklch(50% 0.15 145)' },
          { label: 'Fiches de santé', value: stats.fiches, icon: <HeartPulse size={18} />, color: 'oklch(55% 0.18 25)' },
          { label: 'Registres', value: stats.registres, icon: <ClipboardList size={18} />, color: 'oklch(48% 0.12 250)' },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'oklch(98% 0.005 175)', border: '1px solid oklch(91% 0.01 175)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'oklch(95% 0.02 175)' }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <div className="text-2xl font-black" style={{ color: 'oklch(25% 0.02 175)' }}>{s.value}</div>
              <div className="text-xs font-medium" style={{ color: 'oklch(50% 0.02 175)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'oklch(55% 0.02 175)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par code (DIS-26-0001), élève, matricule..."
            className={`${inputCls} pl-9`}
            style={inputStyle}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'ALL', label: `Toutes (${stats.total})` },
            { key: 'DISPENSE_MEDICALE', label: `Dispenses (${stats.dispenses})` },
            { key: 'FICHE_SANTE', label: `Fiches (${stats.fiches})` },
            { key: 'REGISTRE_SANTE', label: `Registres (${stats.registres})` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold transition-all"
              style={typeFilter === t.key
                ? { background: 'oklch(35% 0.05 175)', color: '#fff' }
                : { background: 'oklch(96% 0.008 175)', color: 'oklch(45% 0.02 175)' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste des documents */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid oklch(91% 0.01 175)' }}>
        <div className="max-h-[62vh] overflow-y-auto">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw size={24} className="animate-spin mx-auto mb-3" style={{ color: 'oklch(55% 0.02 175)' }} />
              <p className="text-sm" style={{ color: 'oklch(50% 0.02 175)' }}>Chargement des documents...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <FileText size={40} className="mx-auto mb-3" style={{ color: 'oklch(80% 0.02 175)' }} />
              <p className="font-semibold mb-1" style={{ color: 'oklch(35% 0.02 175)' }}>Aucun document</p>
              <p className="text-sm mb-4" style={{ color: 'oklch(50% 0.02 175)' }}>
                Créez une dispense, une fiche de santé ou un registre — chaque document reçoit un code unique et son PDF.
              </p>
              <button
                onClick={() => openCreate('DISPENSE_MEDICALE')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'oklch(55% 0.18 25)' }}
              >
                <Plus size={14} /> Créer le premier document
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ background: 'oklch(97% 0.008 175)' }}>
                <tr>
                  {['Code', 'Type', 'Titre', 'Élève', 'Date', 'Créé par', 'PDF'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: 'oklch(45% 0.02 175)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const meta = TYPE_META[d.type] || TYPE_META.FICHE_SANTE;
                  return (
                    <tr key={d.id} className="border-t transition-colors hover:bg-[oklch(98%_0.005_175)]" style={{ borderColor: 'oklch(93% 0.008 175)' }}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg font-mono text-xs font-bold" style={{ background: 'oklch(95% 0.03 75)', color: 'oklch(45% 0.1 70)' }}>
                          <Hash size={11} /> {d.docCode}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ color: meta.color, background: meta.bg }}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="font-medium truncate" style={{ color: 'oklch(28% 0.02 175)' }}>{d.title}</div>
                      </td>
                      <td className="px-4 py-3">
                        {d.student ? (
                          <div>
                            <div className="font-medium" style={{ color: 'oklch(28% 0.02 175)' }}>{d.student.lastName} {d.student.firstName}</div>
                            <div className="text-xs" style={{ color: 'oklch(55% 0.02 175)' }}>{d.student.matricule} · {d.student.class?.name || '—'}</div>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: 'oklch(60% 0.02 175)' }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'oklch(45% 0.02 175)' }}>{fmtDate(d.createdAt)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'oklch(45% 0.02 175)' }}>{d.createdBy?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => downloadPdf(d)}
                          disabled={downloadingId === d.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-transform hover:scale-[1.03] disabled:opacity-50"
                          style={{ background: 'oklch(45% 0.12 145)' }}
                          title="Télécharger le PDF"
                        >
                          <Download size={12} /> PDF
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Dialog création ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15, 23, 20, 0.55)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl" style={{ background: '#fff', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'oklch(91% 0.01 175)' }}>
              <h3 className="font-bold text-lg" style={{ color: 'oklch(25% 0.02 175)' }}>Nouveau document médical</h3>
              <button onClick={() => setShowCreate(false)} className="p-2 rounded-lg hover:bg-[oklch(96%_0.01_175)]"><X size={16} /></button>
            </div>

            <div className="px-6 py-4 overflow-y-auto space-y-4">
              {/* Choix du type */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'DISPENSE_MEDICALE', label: 'Dispense', icon: <FileHeart size={16} /> },
                  { key: 'FICHE_SANTE', label: 'Fiche de santé', icon: <HeartPulse size={16} /> },
                  { key: 'REGISTRE_SANTE', label: 'Registre', icon: <ClipboardList size={16} /> },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setCreateType(t.key as typeof createType)}
                    className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-2xl text-xs font-semibold transition-all"
                    style={createType === t.key
                      ? { background: 'oklch(40% 0.1 175)', color: '#fff' }
                      : { background: 'oklch(96% 0.008 175)', color: 'oklch(40% 0.02 175)' }}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              {/* Sélecteur d'élève (pas pour le registre) */}
              {createType !== 'REGISTRE_SANTE' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Élève *</label>
                  <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} className={inputCls} style={inputStyle}>
                    <option value="">Sélectionner un élève...</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>{s.lastName} {s.firstName} — {s.matricule} {s.class ? `(${s.class.name})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ── Dispense ── */}
              {createType === 'DISPENSE_MEDICALE' && (
                <>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Activité concernée</label>
                    <select value={form.dispensationType} onChange={(e) => setForm({ ...form, dispensationType: e.target.value })} className={inputCls} style={inputStyle}>
                      <option value="EPS">EPS (Éducation Physique)</option>
                      <option value="SPORT">Activité sportive</option>
                      <option value="AUTRE">Autre</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Du *</label>
                      <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputCls} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Au *</label>
                      <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inputCls} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Motif</label>
                    <select value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} className={inputCls} style={inputStyle}>
                      <option value="">Sélectionner...</option>
                      {MOTIFS_DISPENSE.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value={AUTRE}>Autre (préciser)</option>
                    </select>
                    {form.motif === AUTRE && (
                      <input value={form.motifAutre} onChange={(e) => setForm({ ...form, motifAutre: e.target.value })} placeholder="Préciser le motif..." className={`${inputCls} mt-2`} style={inputStyle} />
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Médecin</label>
                    <input value={form.doctorName} onChange={(e) => setForm({ ...form, doctorName: e.target.value })} placeholder="Nom du médecin" className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Recommandations</label>
                    <textarea value={form.recommendations} onChange={(e) => setForm({ ...form, recommendations: e.target.value })} rows={2} placeholder="Recommandations particulières..." className={inputCls} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                </>
              )}

              {/* ── Fiche de santé ── */}
              {createType === 'FICHE_SANTE' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Groupe sanguin</label>
                      <select value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })} className={inputCls} style={inputStyle}>
                        <option value="">—</option>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Tél. médecin</label>
                      <input value={form.doctorPhone} onChange={(e) => setForm({ ...form, doctorPhone: e.target.value })} className={inputCls} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Allergies</label>
                    <input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="Aucune connue" className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Maladies chroniques</label>
                    <input value={form.chronicConditions} onChange={(e) => setForm({ ...form, chronicConditions: e.target.value })} placeholder="Aucune connue" className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Médicaments réguliers</label>
                    <input value={form.regularMedication} onChange={(e) => setForm({ ...form, regularMedication: e.target.value })} placeholder="Aucun" className={inputCls} style={inputStyle} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Contact urgence</label>
                      <input value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} className={inputCls} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Tél. urgence</label>
                      <input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} className={inputCls} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Observations</label>
                    <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <p className="text-xs" style={{ color: 'oklch(55% 0.02 175)' }}>
                    La fiche se pré-remplit automatiquement avec les données médicales existantes de l&apos;élève, et le PDF inclut ses derniers passages à l&apos;infirmerie.
                  </p>
                </>
              )}

              {/* ── Registre ── */}
              {createType === 'REGISTRE_SANTE' && (
                <>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Classe</label>
                    <select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} className={inputCls} style={inputStyle}>
                      <option value="">Toutes les classes</option>
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Du</label>
                      <input type="date" value={form.regFrom} onChange={(e) => setForm({ ...form, regFrom: e.target.value })} className={inputCls} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide mb-1.5 block" style={{ color: 'oklch(45% 0.02 175)' }}>Au</label>
                      <input type="date" value={form.regTo} onChange={(e) => setForm({ ...form, regTo: e.target.value })} className={inputCls} style={inputStyle} />
                    </div>
                  </div>
                  <p className="text-xs" style={{ color: 'oklch(55% 0.02 175)' }}>
                    Le registre fige les passages à l&apos;infirmerie de la période choisie dans un PDF officiel avec code unique.
                  </p>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: 'oklch(91% 0.01 175)', background: 'oklch(98% 0.005 175)' }}>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'oklch(94% 0.01 175)', color: 'oklch(40% 0.02 175)' }}>
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, oklch(55% 0.18 25), oklch(48% 0.15 20))' }}
              >
                {creating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                {creating ? 'Création...' : 'Créer + générer le code'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getTierLabel(tier: string): string {
  const map: Record<string, string> = {
    FREEMIUM: 'Freemium', ESSENTIEL: 'Essentiel', STANDARD: 'Standard',
    PREMIUM: 'Professionnel', ENTERPRISE: 'Enterprise', CORPORATE: 'Corporate',
  };
  return map[tier] || tier;
}
