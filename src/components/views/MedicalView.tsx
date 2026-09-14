'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useEduGestStore } from '@/lib/store';
import { authFetch } from '@/lib/store';
import { hasFeatureAccess } from '@/lib/subscription';
import {
  HeartPulse, Activity, AlertCircle, Plus, Search, User, ShieldAlert,
  Clock, CheckCircle, FileText, Send, Phone, Lock, Calendar, Filter, X
} from 'lucide-react';
import { toast } from 'sonner';
import MedicalDropdown from '@/components/ui/MedicalDropdown';

// Valeur sentinelle "Autre (préciser)" commune aux dropdowns médicaux
const AUTRE = '__AUTRE__';

const MOTIFS_CONSULTATION = [
  'Fièvre', 'Céphalées / maux de tête', 'Douleurs abdominales', 'Plaie / coupure',
  'Vomissements / nausées', 'Toux / rhume', 'Douleur dentaire', 'Malaise / vertiges',
  'Douleur musculaire / articulaire', 'Trouble vue / audition', 'Vaccination / rappel',
];

const TRAITEMENTS_COURANTS = [
  'Paracétamol', 'Pansement / désinfection', 'Repos en infirmerie',
  'Application de froid / chaud', 'Sérum physiologique', 'Observation sans traitement',
];

const ALLERGIES_COURANTES = [
  'Aucune connue', 'Arachides', 'Pénicilline / antibiotiques', 'Aspirine',
  'Latex', 'Piqûres d\'insectes',
];

const MALADIES_CHRONIQUES = [
  'Aucune', 'Asthme', 'Drépanocytose', 'Diabète', 'Épilepsie', 'Cardiopathie',
];

const MOTIFS_DISPENSE = [
  'Entorse', 'Fracture / plâtre', 'Asthme à l\'effort', 'Convalescence post-maladie',
  'Certificat médical (sans précision)',
];

export default function MedicalView() {
  const { userData, userRole, setCurrentView } = useEduGestStore();
  const tier = userData?.subscriptionTier || 'FREEMIUM';
  const hasAccess = hasFeatureAccess(tier, 'medical') || userRole === 'SUPER_ADMIN_GLOBAL';

  const [activeTab, setActiveTab] = useState<'visits' | 'records' | 'dispensations'>('visits');
  const [visits, setVisits] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [dispensations, setDispensations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showDispensationModal, setShowDispensationModal] = useState(false);

  // Formulaire visite
  const [visitForm, setVisitForm] = useState({
    studentId: '',
    reason: '',
    symptoms: '',
    treatment: '',
    decision: 'RETURN_TO_CLASS',
    temperature: '',
    notes: '',
    notifyParent: true,
  });

  // Formulaire fiche santé
  const [recordForm, setRecordForm] = useState({
    studentId: '',
    bloodGroup: '',
    allergies: '',
    chronicConditions: '',
    regularMedication: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    doctorName: '',
    doctorPhone: '',
    notes: '',
  });

  // Formulaire dispense
  const [dispensationForm, setDispensationForm] = useState({
    studentId: '',
    type: 'EPS',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    reason: '',
    doctorName: '',
  });

  // Textes libres quand "Autre (préciser)" est choisi dans un dropdown
  const [visitReasonOther, setVisitReasonOther] = useState('');
  const [visitTreatmentOther, setVisitTreatmentOther] = useState('');
  const [recordAllergiesOther, setRecordAllergiesOther] = useState('');
  const [recordChronicOther, setRecordChronicOther] = useState('');
  const [dispensationReasonOther, setDispensationReasonOther] = useState('');

  // Autocomplete recherche élèves
  const [searchQuery, setSearchQuery] = useState('');
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  // Filtre par classe pour retrouver vite un élève dans les 3 modals
  const [studentClassFilter, setStudentClassFilter] = useState('');

  const studentClasses = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of studentsList) {
      const id = s.class?.id || s.classId;
      const name = s.class?.name || '';
      if (id && !map.has(id)) map.set(id, name || id);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [studentsList]);

  const filteredStudents = useMemo(() => {
    if (!studentClassFilter) return studentsList;
    return studentsList.filter((s) => (s.class?.id || s.classId) === studentClassFilter);
  }, [studentsList, studentClassFilter]);

  function studentInClass(studentId: string, classId: string) {
    if (!classId) return true;
    const s = studentsList.find((x) => x.id === studentId);
    return !!s && (s.class?.id || s.classId) === classId;
  }

  function handleClassFilterChange(classId: string) {
    setStudentClassFilter(classId);
    if (visitForm.studentId && !studentInClass(visitForm.studentId, classId)) {
      setVisitForm((f) => ({ ...f, studentId: '' }));
    }
    if (recordForm.studentId && !studentInClass(recordForm.studentId, classId)) {
      setRecordForm((f) => ({ ...f, studentId: '' }));
    }
    if (dispensationForm.studentId && !studentInClass(dispensationForm.studentId, classId)) {
      setDispensationForm((f) => ({ ...f, studentId: '' }));
    }
  }

  useEffect(() => {
    if (!hasAccess || !userData?.schoolId) {
      setLoading(false);
      return;
    }
    loadData();
    loadStudents();
  }, [userData?.schoolId, hasAccess, activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      if (activeTab === 'visits') {
        const res = await authFetch(`/api/medical/visits?schoolId=${userData?.schoolId}`);
        const json = await res.json();
        setVisits(json.data || []);
      } else if (activeTab === 'records') {
        const res = await authFetch(`/api/medical/records?schoolId=${userData?.schoolId}`);
        const json = await res.json();
        setRecords(json.data || []);
      } else if (activeTab === 'dispensations') {
        const res = await authFetch(`/api/medical/dispensations?schoolId=${userData?.schoolId}`);
        const json = await res.json();
        setDispensations(json.data || []);
      }
    } catch (e) {
      console.error('Erreur chargement données médicales:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadStudents() {
    try {
      const res = await authFetch(`/api/students?schoolId=${userData?.schoolId}&limit=500`);
      const json = await res.json();
      setStudentsList(json.data || []);
    } catch (e) {
      console.error('Erreur chargement élèves:', e);
    }
  }

  async function handleSaveVisit(e: React.FormEvent) {
    e.preventDefault();
    const reason = visitForm.reason === AUTRE ? visitReasonOther.trim() : visitForm.reason;
    const treatment = visitForm.treatment === AUTRE ? visitTreatmentOther.trim() : visitForm.treatment;
    if (!visitForm.studentId || !reason) {
      toast.error('Veuillez sélectionner un élève et indiquer le motif.');
      return;
    }

    try {
      const res = await authFetch('/api/medical/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...visitForm, reason, treatment }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur lors de l\'enregistrement');

      toast.success(json.message || 'Consultation enregistrée avec succès');
      setShowVisitModal(false);
      setVisitForm({
        studentId: '',
        reason: '',
        symptoms: '',
        treatment: '',
        decision: 'RETURN_TO_CLASS',
        temperature: '',
        notes: '',
        notifyParent: true,
      });
      setVisitReasonOther('');
      setVisitTreatmentOther('');
      setSelectedStudent(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erreur enregistrement');
    }
  }

  async function handleSaveRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!recordForm.studentId) {
      toast.error('Veuillez sélectionner un élève.');
      return;
    }

    const allergies = recordForm.allergies === AUTRE ? recordAllergiesOther.trim() : recordForm.allergies;
    const chronicConditions = recordForm.chronicConditions === AUTRE ? recordChronicOther.trim() : recordForm.chronicConditions;

    try {
      const res = await authFetch('/api/medical/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...recordForm, allergies, chronicConditions }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur enregistrement');

      toast.success('Fiche de santé sauvegardée');
      setShowRecordModal(false);
      setRecordAllergiesOther('');
      setRecordChronicOther('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erreur enregistrement');
    }
  }

  async function handleSaveDispensation(e: React.FormEvent) {
    e.preventDefault();
    const reason = dispensationForm.reason === AUTRE ? dispensationReasonOther.trim() : dispensationForm.reason;
    if (!dispensationForm.studentId || !dispensationForm.startDate || !dispensationForm.endDate || !reason) {
      toast.error('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    try {
      const res = await authFetch('/api/medical/dispensations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dispensationForm, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur enregistrement');

      toast.success('Dispense médicale enregistrée');
      setShowDispensationModal(false);
      setDispensationReasonOther('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erreur enregistrement');
    }
  }

  // Écran de verrouillage si forfait inférieur à Professionnel
  if (!hasAccess) {
    return (
      <div className="max-w-4xl mx-auto my-12 p-8 bg-white border border-slate-200 rounded-3xl text-center shadow-lg">
        <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100">
          <Lock size={32} />
        </div>
        <span className="text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-3 py-1 rounded-full">
          Réservé aux offres Professionnel, Enterprise & Corporate
        </span>
        <h2 className="text-2xl font-black text-slate-900 mt-4 mb-2">
          Service Médical & Santé Scolaire
        </h2>
        <p className="text-slate-600 max-w-lg mx-auto text-sm mb-6">
          Votre établissement est actuellement souscrit à l'offre <strong className="text-slate-900">{tier}</strong>.
          Le module Médical comprend la gestion de l'infirmerie, les fiches d'allergies/traitements, les dispenses d'EPS et les alertes WhatsApp instantanées aux parents en cas d'urgence.
        </p>
        <button
          onClick={() => setCurrentView('my-subscription')}
          className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-md transition"
        >
          Passer à l'offre Professionnel →
        </button>
      </div>
    );
  }

  const decisionBadges: Record<string, { label: string; color: string }> = {
    RETURN_TO_CLASS: { label: 'Retour en classe', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    RESTING: { label: 'En observation', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    SENT_HOME: { label: 'Retour domicile', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    EMERGENCY_EVACUATION: { label: 'Évacuation d\'urgence', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
            Service Médical
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm">
            Suivi des consultations de l'infirmerie, fiches de santé, allergies et dispenses sportives.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'visits' && (
            <button
              onClick={() => setShowVisitModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition"
            >
              <Plus size={15} />
              Nouvelle Consultation
            </button>
          )}
          {activeTab === 'records' && (
            <button
              onClick={() => setShowRecordModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition"
            >
              <Plus size={15} />
              + Fiche Santé
            </button>
          )}
          {activeTab === 'dispensations' && (
            <button
              onClick={() => setShowDispensationModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition"
            >
              <Plus size={15} />
              + Dispense Médicale
            </button>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('visits')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === 'visits'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Activity size={16} />
          Registre des Visites
        </button>
        <button
          onClick={() => setActiveTab('records')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === 'records'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <User size={16} />
          Fiches de Santé & Allergies
        </button>
        <button
          onClick={() => setActiveTab('dispensations')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === 'dispensations'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText size={16} />
          Dispenses d'EPS
        </button>
      </div>

      {/* Contenu principal */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">
          <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Chargement des données de santé...
        </div>
      ) : activeTab === 'visits' ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {visits.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <HeartPulse size={36} className="mx-auto text-slate-300 mb-2" />
              Aucun passage enregistré à l'infirmerie pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Date & Heure</th>
                    <th className="py-3 px-4">Élève</th>
                    <th className="py-3 px-4">Classe</th>
                    <th className="py-3 px-4">Motif & Soins</th>
                    <th className="py-3 px-4">Température</th>
                    <th className="py-3 px-4">Décision</th>
                    <th className="py-3 px-4">WhatsApp Parent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visits.map((v) => {
                    const badge = decisionBadges[v.decision] || { label: v.decision, color: 'bg-slate-100 text-slate-700' };
                    return (
                      <tr key={v.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(v.visitDate).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {v.student?.firstName} {v.student?.lastName}
                          <span className="block text-[11px] font-normal text-slate-400">{v.student?.matricule}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-xs">
                          {v.student?.class?.name || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800">{v.reason}</div>
                          {v.treatment && <div className="text-xs text-slate-500">Soins : {v.treatment}</div>}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold">
                          {v.temperature ? `${v.temperature}°C` : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.color}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {v.parentNotified ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                              <CheckCircle size={13} />
                              Notifié
                            </span>
                          ) : (
                            <span className="text-slate-400">Non notifié</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === 'records' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {records.length === 0 ? (
            <div className="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              Aucune fiche de santé enregistrée.
            </div>
          ) : (
            records.map((r) => (
              <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900">{r.student?.firstName} {r.student?.lastName}</h3>
                    <p className="text-xs text-slate-400">{r.student?.matricule} • {r.student?.class?.name}</p>
                  </div>
                  {r.bloodGroup && (
                    <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 font-extrabold text-xs border border-rose-200">
                      {r.bloodGroup}
                    </span>
                  )}
                </div>

                {r.allergies && (
                  <div className="text-xs bg-amber-50 text-amber-900 p-2.5 rounded-xl border border-amber-200">
                    <span className="font-bold flex items-center gap-1 mb-0.5">
                      <AlertCircle size={12} className="text-amber-700" /> Allergies signalées :
                    </span>
                    {r.allergies}
                  </div>
                )}

                {r.chronicConditions && (
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">Affections chroniques :</span> {r.chronicConditions}
                  </div>
                )}

                {r.emergencyContactName && (
                  <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span>Urgence : {r.emergencyContactName}</span>
                    {r.emergencyContactPhone && (
                      <span className="font-semibold text-slate-700">{r.emergencyContactPhone}</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {dispensations.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              Aucune dispense de sport/EPS active.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Élève</th>
                  <th className="py-3 px-4">Classe</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Période</th>
                  <th className="py-3 px-4">Motif</th>
                  <th className="py-3 px-4">Médecin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dispensations.map((d) => (
                  <tr key={d.id}>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {d.student?.firstName} {d.student?.lastName}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{d.student?.class?.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700">
                        {d.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {new Date(d.startDate).toLocaleDateString('fr-FR')} au {new Date(d.endDate).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-800">{d.reason}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{d.doctorName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal Consultation Infirmerie */}
      {showVisitModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <HeartPulse className="text-rose-600" size={20} />
                Nouvelle Consultation à l'Infirmerie
              </h3>
              <button onClick={() => setShowVisitModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveVisit} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Filtrer par classe</label>
                <MedicalDropdown
                  value={studentClassFilter}
                  onChange={handleClassFilterChange}
                  placeholder="Toutes les classes"
                  options={studentClasses.map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Sélectionner l'Élève *</label>
                <select
                  value={visitForm.studentId}
                  onChange={(e) => setVisitForm({ ...visitForm, studentId: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500"
                  required
                >
                  <option value="">-- Choisir un élève --</option>
                  {filteredStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.matricule}) - {s.class?.name || ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Motif de consultation *</label>
                  <MedicalDropdown
                    value={visitForm.reason}
                    onChange={(v) => setVisitForm({ ...visitForm, reason: v })}
                    placeholder="-- Choisir un motif --"
                    options={[...MOTIFS_CONSULTATION, { value: AUTRE, label: 'Autre (préciser)' }]}
                  />
                  {visitForm.reason === AUTRE && (
                    <input
                      type="text"
                      placeholder="Précisez le motif..."
                      value={visitReasonOther}
                      onChange={(e) => setVisitReasonOther(e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500 mt-2"
                      required
                    />
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Température (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 38.2"
                    value={visitForm.temperature}
                    onChange={(e) => setVisitForm({ ...visitForm, temperature: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Soins / Traitement administré</label>
                <MedicalDropdown
                  value={visitForm.treatment}
                  onChange={(v) => setVisitForm({ ...visitForm, treatment: v })}
                  placeholder="-- Sélectionner (optionnel) --"
                  options={[...TRAITEMENTS_COURANTS, { value: AUTRE, label: 'Autre (préciser)' }]}
                />
                {visitForm.treatment === AUTRE && (
                  <input
                    type="text"
                    placeholder="Précisez le traitement..."
                    value={visitTreatmentOther}
                    onChange={(e) => setVisitTreatmentOther(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500 mt-2"
                  />
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Décision médicale</label>
                <MedicalDropdown
                  value={visitForm.decision}
                  onChange={(v) => setVisitForm({ ...visitForm, decision: v })}
                  options={[
                    { value: 'RETURN_TO_CLASS', label: 'Retour en classe après soins' },
                    { value: 'RESTING', label: "Repos en observation à l'infirmerie" },
                    { value: 'SENT_HOME', label: 'Retour au domicile recommandé' },
                    { value: 'EMERGENCY_EVACUATION', label: "Évacuation médicale d'urgence" },
                  ]}
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="notifyParent"
                  checked={visitForm.notifyParent}
                  onChange={(e) => setVisitForm({ ...visitForm, notifyParent: e.target.checked })}
                  className="rounded text-rose-600 focus:ring-rose-500"
                />
                <label htmlFor="notifyParent" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Alerter immédiatement le parent via <strong>WhatsApp</strong>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowVisitModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-md"
                >
                  Enregistrer & Notifier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Fiche Santé */}
      {showRecordModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Enregistrer une Fiche de Santé</h3>
              <button onClick={() => setShowRecordModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Filtrer par classe</label>
                <MedicalDropdown
                  value={studentClassFilter}
                  onChange={handleClassFilterChange}
                  placeholder="Toutes les classes"
                  options={studentClasses.map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Élève *</label>
                <select
                  value={recordForm.studentId}
                  onChange={(e) => setRecordForm({ ...recordForm, studentId: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500"
                  required
                >
                  <option value="">-- Choisir un élève --</option>
                  {filteredStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.matricule})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Groupe Sanguin</label>
                  <MedicalDropdown
                    value={recordForm.bloodGroup}
                    onChange={(v) => setRecordForm({ ...recordForm, bloodGroup: v })}
                    options={[
                      { value: '', label: 'Inconnu' },
                      'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-',
                    ]}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Allergies</label>
                  <MedicalDropdown
                    value={recordForm.allergies}
                    onChange={(v) => setRecordForm({ ...recordForm, allergies: v })}
                    placeholder="-- Sélectionner --"
                    options={[...ALLERGIES_COURANTES, { value: AUTRE, label: 'Autre (préciser)' }]}
                  />
                  {recordForm.allergies === AUTRE && (
                    <input
                      type="text"
                      placeholder="Précisez l'allergie..."
                      value={recordAllergiesOther}
                      onChange={(e) => setRecordAllergiesOther(e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500 mt-2"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Maladies chroniques / Antécédents</label>
                <MedicalDropdown
                  value={recordForm.chronicConditions}
                  onChange={(v) => setRecordForm({ ...recordForm, chronicConditions: v })}
                  placeholder="-- Sélectionner --"
                  options={[...MALADIES_CHRONIQUES, { value: AUTRE, label: 'Autre (préciser)' }]}
                />
                {recordForm.chronicConditions === AUTRE && (
                  <input
                    type="text"
                    placeholder="Précisez la maladie..."
                    value={recordChronicOther}
                    onChange={(e) => setRecordChronicOther(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500 mt-2"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Nom contact urgence</label>
                  <input
                    type="text"
                    value={recordForm.emergencyContactName}
                    onChange={(e) => setRecordForm({ ...recordForm, emergencyContactName: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Tél contact urgence</label>
                  <input
                    type="text"
                    value={recordForm.emergencyContactPhone}
                    onChange={(e) => setRecordForm({ ...recordForm, emergencyContactPhone: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRecordModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-md"
                >
                  Sauvegarder Fiche
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Dispense */}
      {showDispensationModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Enregistrer une Dispense EPS / Sport</h3>
              <button onClick={() => setShowDispensationModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDispensation} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Filtrer par classe</label>
                <MedicalDropdown
                  value={studentClassFilter}
                  onChange={handleClassFilterChange}
                  placeholder="Toutes les classes"
                  options={studentClasses.map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Élève *</label>
                <select
                  value={dispensationForm.studentId}
                  onChange={(e) => setDispensationForm({ ...dispensationForm, studentId: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500"
                  required
                >
                  <option value="">-- Choisir un élève --</option>
                  {filteredStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.matricule})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Date Début *</label>
                  <input
                    type="date"
                    value={dispensationForm.startDate}
                    onChange={(e) => setDispensationForm({ ...dispensationForm, startDate: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Date Fin *</label>
                  <input
                    type="date"
                    value={dispensationForm.endDate}
                    onChange={(e) => setDispensationForm({ ...dispensationForm, endDate: e.target.value })}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Motif de la dispense *</label>
                <MedicalDropdown
                  value={dispensationForm.reason}
                  onChange={(v) => setDispensationForm({ ...dispensationForm, reason: v })}
                  placeholder="-- Choisir un motif --"
                  options={[...MOTIFS_DISPENSE, { value: AUTRE, label: 'Autre (préciser)' }]}
                />
                {dispensationForm.reason === AUTRE && (
                  <input
                    type="text"
                    placeholder="Précisez le motif..."
                    value={dispensationReasonOther}
                    onChange={(e) => setDispensationReasonOther(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500 mt-2"
                    required
                  />
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Nom du Médecin traitant</label>
                <input
                  type="text"
                  placeholder="Dr. ..."
                  value={dispensationForm.doctorName}
                  onChange={(e) => setDispensationForm({ ...dispensationForm, doctorName: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDispensationModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md"
                >
                  Enregistrer la Dispense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
