'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Search, Users, School as SchoolIcon, CheckCircle2, ArrowRight, ArrowLeft,
  QrCode, Clock, Loader2, X, Minus, Plus, Lock, Phone, UserRound,
} from 'lucide-react';
import AppSelect from '@/components/ui/AppSelect';

interface SchoolInfo { name: string; shortName: string; logo: string | null; city: string; address: string }
interface ClassInfo { id: string; name: string }
interface StudentInfo { id: string; firstName: string; lastName: string; className: string }

type Step = 'loading' | 'welcome' | 'search' | 'register' | 'done' | 'error';

const MAX_CHILDREN = 5;

/**
 * Page publique « Retrouver mon enfant » (vue uniquement par scan du QR code).
 * Flux multi-enfants :
 *  1. Bienvenue chez [École] → « Combien d'enfants avez-vous ? » (1..5)
 *  2. Pour chaque enfant : classe → nom → sélection d'UN élève (anti-doublon strict)
 *  3. Formulaire parent (nom, prénom, téléphone WhatsApp) + récapitulatif
 *  4. Succès : tous les enfants sont liés à UN seul compte parent.
 */
export default function FindChildPage() {
  const [step, setStep] = useState<Step>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [expired, setExpired] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);

  // Étape 1 : combien d'enfants ?
  const [countDraft, setCountDraft] = useState(1);

  // Étape 2 : un passe de recherche par enfant
  const [selectedChildren, setSelectedChildren] = useState<StudentInfo[]>([]);
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [picked, setPicked] = useState<StudentInfo | null>(null);

  // Étape 3 : formulaire du parent
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [registering, setRegistering] = useState(false);

  // Étape 4 : succès
  const [registeredLogin, setRegisteredLogin] = useState('');
  const [registeredChildren, setRegisteredChildren] = useState<StudentInfo[]>([]);

  // Lecture du token depuis l'URL (?token=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) {
      setErrorMsg('Lien invalide : aucun QR code détecté.');
      setStep('error');
      return;
    }
    setToken(t);
    fetch(`/api/public/find-child?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) {
          setExpired(!!j.expired);
          throw new Error(j.error || 'QR code invalide');
        }
        setSchool(j.data.school);
        setClasses(j.data.classes);
        setStep('welcome');
      })
      .catch((e: Error) => {
        setErrorMsg(e.message);
        setStep('error');
      });
  }, []);

  // Remonter en haut à chaque changement d'étape (parcours mobile)
  useEffect(() => {
    try { window.scrollTo({ top: 0 }); } catch { /* ignore */ }
  }, [step]);

  const searchStudents = useCallback(async () => {
    if (!token || !classId || q.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/public/find-child?token=${encodeURIComponent(token)}&classId=${encodeURIComponent(classId)}&q=${encodeURIComponent(q.trim())}`);
      const j = await r.json();
      if (r.ok) {
        setStudents(j.data.students || []);
        setSearched(true);
        setPicked(null);
      }
    } catch { /* ignore */ }
    finally { setSearching(false); }
  }, [token, classId, q]);

  function resetSearch() {
    setClassId('');
    setQ('');
    setStudents([]);
    setSearched(false);
    setPicked(null);
    setErrorMsg('');
  }

  // ── Étape 1 → 2 : démarrer avec N enfants ───────────────────────────
  function startWithCount(n: number) {
    const count = Math.min(Math.max(1, n), MAX_CHILDREN);
    setCountDraft(count);
    setSelectedChildren([]);
    resetSearch();
    setStep('search');
  }

  // ── Étape 2 : valider l'enfant du passe courant ─────────────────────
  const takenIds = new Set(selectedChildren.map((c) => c.id));

  function confirmChild() {
    if (!picked || takenIds.has(picked.id)) return; // garde-fou anti-doublon
    const next = [...selectedChildren, picked];
    setSelectedChildren(next);
    resetSearch();
    if (next.length >= countDraft) setStep('register');
  }

  // Retirer un enfant déjà confirmé (le passe correspondant est refait)
  function removeChild(index: number) {
    const next = selectedChildren.filter((_, i) => i !== index);
    setSelectedChildren(next);
    resetSearch();
    setStep('search');
  }

  // ── Étape 3 : création du compte parent (tous les enfants d'un coup) ─
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!token || selectedChildren.length === 0) return;
    if (!lastName.trim() || !firstName.trim() || !parentPhone.trim()) {
      setErrorMsg('Veuillez remplir votre nom, votre prénom et votre numéro de téléphone.');
      return;
    }
    if (parentPhone.replace(/\D/g, '').length < 8) {
      setErrorMsg('Le numéro de téléphone semble trop court. Vérifiez-le (ex. +243 81 234 5678).');
      return;
    }
    setErrorMsg('');
    setRegistering(true);
    try {
      const r = await fetch('/api/public/parent-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          studentIds: selectedChildren.map((c) => c.id),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: parentPhone,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErrorMsg(j.error || 'Erreur lors de la création du compte');
        return;
      }
      setRegisteredLogin(j.data.login);
      setRegisteredChildren(selectedChildren);
      setStep('done');
    } catch {
      setErrorMsg('Erreur réseau. Réessayez.');
    } finally {
      setRegistering(false);
    }
  }

  const inputCls = 'w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition focus:ring-[3px] focus:ring-[oklch(55%_0.15_175_/_0.2)] focus:border-[oklch(55%_0.15_175_/_0.5)]';
  const inputStyle = { background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)' };
  const cardStyle = { background: 'rgba(26, 37, 32, 0.55)', backdropFilter: 'blur(24px)' } as React.CSSProperties;
  const currentPass = selectedChildren.length; // passe courant = enfants déjà confirmés

  const initials = (s: StudentInfo) => `${s.firstName[0] || ''}${s.lastName[0] || ''}`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #0a0f0d 0%, #0b1613 40%, #0d1f1a 100%)' }}>
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5">
        <div className="flex items-center gap-2.5">
          <img src="/edugest-logo-mark.png" alt="Logo EduGest" className="w-10 h-10 object-contain" />
          <div>
            <div className="text-white font-bold tracking-tight text-lg">Edu<span style={{ color: 'oklch(72% 0.15 65)' }}>Gest</span></div>
            <div className="text-white/40 text-[11px]">Retrouver mon enfant</div>
          </div>
        </div>
        <Link href="/" className="text-white/40 hover:text-white text-xs font-semibold uppercase tracking-widest transition">Accueil</Link>
      </header>

      <main className="relative z-10 flex-1 flex items-start justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-lg">
          {step === 'loading' && (
            <div className="text-center py-20">
              <Loader2 size={36} className="animate-spin mx-auto text-white/40" />
              <p className="text-white/50 text-sm mt-4">Vérification du QR code…</p>
            </div>
          )}

          {step === 'error' && (
            <div className="rounded-2xl border p-8 text-center" style={{ background: 'rgba(186,26,26,0.1)', borderColor: 'rgba(186,26,26,0.4)' }}>
              <QrCode size={40} className="mx-auto text-white/40 mb-4" />
              <h1 className="text-xl font-bold text-white mb-2">{expired ? 'QR code expiré' : 'QR code invalide'}</h1>
              <p className="text-white/60 text-sm mb-6">{errorMsg}</p>
              <Link href="/" className="edu-gold-cta inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold">
                Aller à la page de connexion <ArrowRight size={14} />
              </Link>
            </div>
          )}

          {(step === 'welcome' || step === 'search' || step === 'register' || step === 'done') && school && (
            <>
              {/* École */}
              <div className="rounded-2xl border border-white/10 p-5 mb-5 flex items-center gap-4" style={cardStyle}>
                {school.logo ? (
                  <img src={school.logo} alt={`Logo ${school.name}`} className="w-14 h-14 rounded-xl object-cover border border-white/10" />
                ) : (
                  <div className="w-14 h-14 rounded-xl grid place-items-center shrink-0" style={{ background: 'oklch(72% 0.15 65 / 0.15)' }}>
                    <SchoolIcon size={24} style={{ color: 'oklch(72% 0.15 65)' }} />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-white font-bold text-lg leading-tight">{school.name}</div>
                  <div className="text-white/40 text-[13px]">{school.city || school.address || 'Bienvenue aux parents'}</div>
                </div>
              </div>
            </>
          )}

          {/* ── ÉTAPE 1 : Combien d'enfants avez-vous ? ─────────────────── */}
          {step === 'welcome' && school && (
            <div className="rounded-2xl border border-white/10 p-6 sm:p-8" style={cardStyle}>
              <p className="text-[13px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'oklch(72% 0.15 65)' }}>
                Bienvenue chez {school.name}
              </p>
              <h1 className="text-2xl font-black text-white tracking-tight mb-2">Retrouver mon enfant</h1>
              <p className="text-white/50 text-sm mb-7">
                Ce lien sécurisé vous connecte à la base de données de l&apos;école pour lier vos enfants à votre compte parent.
              </p>

              <h2 className="text-white font-bold text-lg mb-1">Combien d&apos;enfants avez-vous ?</h2>
              <p className="text-white/40 text-[13px] mb-5">Chaque enfant sera retrouvé l&apos;un après l&apos;autre, puis tous liés à votre compte.</p>

              {/* Sélecteur − / nombre / + */}
              <div className="flex items-center justify-center gap-5 mb-6">
                <button
                  type="button"
                  onClick={() => setCountDraft((c) => Math.max(1, c - 1))}
                  disabled={countDraft <= 1}
                  aria-label="Un enfant de moins"
                  className="w-12 h-12 rounded-full grid place-items-center text-white transition disabled:opacity-30"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  <Minus size={18} />
                </button>
                <div
                  className="w-20 h-20 rounded-2xl grid place-items-center text-4xl font-black"
                  style={{ background: 'oklch(72% 0.15 65 / 0.15)', border: '1px solid oklch(72% 0.15 65 / 0.4)', color: 'oklch(80% 0.14 70)' }}
                >
                  {countDraft}
                </div>
                <button
                  type="button"
                  onClick={() => setCountDraft((c) => Math.min(MAX_CHILDREN, c + 1))}
                  disabled={countDraft >= MAX_CHILDREN}
                  aria-label="Un enfant de plus"
                  className="w-12 h-12 rounded-full grid place-items-center text-white transition disabled:opacity-30"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  <Plus size={18} />
                </button>
              </div>

              {/* Raccourci 1..5 */}
              <div className="flex items-center justify-center gap-2 mb-6">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => startWithCount(n)}
                    className={`w-11 h-11 rounded-xl text-sm font-bold transition ${countDraft === n ? 'text-white' : 'text-white/50 hover:text-white'}`}
                    style={
                      countDraft === n
                        ? { background: 'oklch(55% 0.15 175)', color: 'oklch(97% 0.005 175)' }
                        : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => startWithCount(countDraft)}
                className="edu-gold-cta w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition active:scale-[0.98]"
              >
                Continuer <ArrowRight size={15} />
              </button>

              <p className="text-white/30 text-[12px] text-center mt-4 flex items-center justify-center gap-1.5">
                <Users size={13} /> Tous vos enfants seront liés à un seul et même compte parent.
              </p>
            </div>
          )}

          {/* ── ÉTAPE 2 : recherche enfant par enfant ───────────────────── */}
          {step === 'search' && school && (
            <>
              {/* Enfants déjà confirmés (chips) */}
              {selectedChildren.length > 0 && (
                <div className="rounded-2xl border border-white/10 p-4 mb-4" style={cardStyle}>
                  <p className="text-[11px] uppercase tracking-wider text-white/40 font-semibold mb-2.5">Enfants confirmés</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedChildren.map((c, i) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-[12px] font-medium"
                        style={{ background: 'oklch(55% 0.15 175 / 0.18)', border: '1px solid oklch(55% 0.15 175 / 0.45)', color: 'oklch(85% 0.08 175)' }}
                      >
                        Enfant {i + 1} : {c.firstName} {c.lastName}
                        <CheckCircle2 size={13} className="shrink-0" />
                        <button
                          type="button"
                          onClick={() => removeChild(i)}
                          aria-label={`Retirer ${c.firstName}`}
                          className="w-5 h-5 rounded-full grid place-items-center hover:bg-white/10 transition shrink-0"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-white/10 p-6" style={cardStyle}>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h1 className="text-xl font-bold text-white tracking-tight">
                    Enfant {Math.min(currentPass + 1, countDraft)} sur {countDraft}
                  </h1>
                  {currentPass === 0 && (
                    <button onClick={() => setStep('welcome')} className="text-white/40 hover:text-white text-[12px] font-semibold inline-flex items-center gap-1 transition shrink-0">
                      <ArrowLeft size={13} /> Modifier le nombre
                    </button>
                  )}
                </div>
                <p className="text-white/50 text-sm mb-5">Choisissez la classe puis tapez le nom de votre enfant.</p>

                {classes.length === 0 ? (
                  <p className="text-white/40 text-sm text-center py-4">
                    Aucune classe n&apos;est disponible pour le moment. Contactez l&apos;école.
                  </p>
                ) : (
                  <>
                    <label className="block text-[13px] font-medium text-white/70 mb-1.5">Classe de l&apos;enfant</label>
                    <AppSelect
                      value={classId}
                      onChange={(val) => { setClassId(val); setStudents([]); setSearched(false); setPicked(null); }}
                      placeholder="— Sélectionnez la classe —"
                      options={[{ value: '', label: '— Sélectionnez la classe —' }, ...classes.map(c => ({ value: c.id, label: c.name }))]}
                      dark
                      className={`${inputCls} mb-4`}
                      triggerClassName="-mx-4 -my-3"
                      style={inputStyle}
                    />

                    <label className="block text-[13px] font-medium text-white/70 mb-1.5">Nom de l&apos;enfant</label>
                    <div className="flex gap-2 mb-4">
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') searchStudents(); }}
                        placeholder="ex. Kabila Jean"
                        className={inputCls}
                        style={inputStyle}
                      />
                      <button
                        onClick={searchStudents}
                        disabled={searching || !classId || q.trim().length < 2}
                        className="px-5 rounded-xl font-semibold text-sm disabled:opacity-40 flex items-center gap-2 shrink-0"
                        style={{ background: 'oklch(55% 0.15 175)', color: 'oklch(97% 0.005 175)' }}
                      >
                        {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                        <span className="hidden sm:inline">Chercher</span>
                      </button>
                    </div>

                    {searched && students.length === 0 && (
                      <p className="text-white/40 text-sm text-center py-4">Aucun enfant trouvé pour cette recherche.</p>
                    )}

                    {students.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">{students.length} résultat(s)</p>
                        {students.map(s => {
                          const isTaken = takenIds.has(s.id);
                          const isPicked = picked?.id === s.id;
                          return (
                            <button
                              key={s.id}
                              onClick={() => { if (!isTaken) { setPicked(s); setErrorMsg(''); } }}
                              disabled={isTaken}
                              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition ${
                                isTaken ? 'opacity-40 cursor-not-allowed border-white/5'
                                  : isPicked ? 'border-[oklch(72%_0.15_65)] bg-[oklch(72%_0.15_65_/_0.1)]'
                                  : 'border-white/10 hover:bg-white/5'
                              }`}
                            >
                              <div className="w-10 h-10 rounded-full grid place-items-center text-white font-bold text-sm shrink-0" style={{ background: 'linear-gradient(135deg, oklch(55% 0.15 175), oklch(72% 0.15 65))' }}>
                                {initials(s)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-white font-semibold text-sm">{s.firstName} {s.lastName}</div>
                                <div className="text-white/40 text-[12px]">Classe {s.className}</div>
                              </div>
                              {isTaken ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/40 shrink-0">
                                  <Lock size={11} /> Déjà sélectionné
                                </span>
                              ) : isPicked ? (
                                <CheckCircle2 size={18} style={{ color: 'oklch(72% 0.15 65)' }} />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {picked && (
                      <button
                        onClick={confirmChild}
                        className="w-full mt-5 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
                        style={{ background: 'oklch(55% 0.15 175)', color: 'oklch(97% 0.005 175)', boxShadow: '0 4px 16px oklch(55% 0.15 175 / 0.25)' }}
                      >
                        <CheckCircle2 size={16} />
                        Confirmer {picked.firstName} {picked.lastName} {currentPass + 1 < countDraft ? '— enfant suivant' : '— terminer'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* ── ÉTAPE 3 : formulaire du parent + récapitulatif ──────────── */}
          {step === 'register' && school && (
            <form onSubmit={handleRegister} className="rounded-2xl border border-white/10 p-6" style={cardStyle}>
              <h1 className="text-xl font-bold text-white tracking-tight mb-1 flex items-center gap-2">
                <UserRound size={18} style={{ color: 'oklch(72% 0.15 65)' }} /> Vos informations de parent
              </h1>
              <p className="text-white/50 text-sm mb-5">
                Un seul compte pour toute la famille : vos {selectedChildren.length} enfant{selectedChildren.length > 1 ? 's' : ''} seront lié{selectedChildren.length > 1 ? 's' : ''} à ce compte.
              </p>

              {/* Récapitulatif des enfants */}
              <div className="space-y-2 mb-6">
                <p className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Vos enfants ({selectedChildren.length})</p>
                {selectedChildren.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.04]">
                    <div className="w-9 h-9 rounded-full grid place-items-center text-white font-bold text-[12px] shrink-0" style={{ background: 'linear-gradient(135deg, oklch(55% 0.15 175), oklch(72% 0.15 65))' }}>
                      {initials(c)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-semibold">Enfant {i + 1} : {c.firstName} {c.lastName}</div>
                      <div className="text-white/40 text-[12px]">Classe {c.className}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeChild(i)}
                      aria-label={`Retirer ${c.firstName}`}
                      className="w-7 h-7 rounded-full grid place-items-center text-white/40 hover:text-white hover:bg-white/10 transition shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {errorMsg && (
                <div className="mb-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: 'rgba(186,26,26,0.15)', border: '1px solid rgba(186,26,26,0.4)', color: '#fca5a5' }}>
                  {errorMsg}
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-medium text-white/70 mb-1.5">Votre nom</label>
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="ex. Kabongo" className={inputCls} style={inputStyle} required />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-white/70 mb-1.5">Votre prénom</label>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="ex. Mwamba" className={inputCls} style={inputStyle} required />
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-white/70 mb-1.5 flex items-center gap-1.5">
                    <Phone size={13} /> Numéro de téléphone WhatsApp
                  </label>
                  <input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="ex. +243 81 234 5678" type="tel" className={inputCls} style={inputStyle} required />
                  <p className="text-white/35 text-[12px] mt-1.5">Ce numéro sera votre identifiant de connexion à l&apos;application.</p>
                </div>
              </div>

              <button
                type="submit"
                disabled={registering}
                className="w-full mt-5 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition active:scale-[0.98]"
                style={{ background: 'oklch(55% 0.15 175)', color: 'oklch(97% 0.005 175)', boxShadow: '0 4px 16px oklch(55% 0.15 175 / 0.25)' }}
              >
                {registering ? <Loader2 size={16} className="animate-spin" /> : null}
                Créer mon compte et lier mes {selectedChildren.length} enfant{selectedChildren.length > 1 ? 's' : ''}
              </button>
            </form>
          )}

          {/* ── ÉTAPE 4 : succès ────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="rounded-2xl border p-8 text-center" style={{ background: 'rgba(0,135,90,0.12)', borderColor: 'rgba(0,135,90,0.45)' }}>
              <CheckCircle2 size={44} className="mx-auto mb-4" style={{ color: '#22c55e' }} />
              <h1 className="text-2xl font-black text-white tracking-tight mb-2">Compte créé ✓</h1>
              <p className="text-white/70 text-sm mb-3">
                {registeredChildren.length > 1
                  ? `Vos ${registeredChildren.length} enfants sont liés.`
                  : 'Votre enfant est lié.'}
              </p>
              <div className="flex flex-wrap justify-center gap-2 mb-5">
                {registeredChildren.map((c, i) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)', color: '#86efac' }}>
                    Enfant {i + 1} : {c.firstName} {c.lastName} <CheckCircle2 size={12} />
                  </span>
                ))}
              </div>
              <p className="text-white/60 text-sm mb-1">
                Connectez-vous dans l&apos;app EduGest avec votre numéro de téléphone <strong className="text-white/80">{registeredLogin}</strong>.
              </p>
              <p className="text-white/40 text-[12px] mb-6">
                À la première connexion, définissez votre mot de passe via « Mot de passe oublié » : un code vous sera envoyé sur WhatsApp.
              </p>
              <Link href="/" className="edu-gold-cta inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold">
                Se connecter maintenant <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
      </main>

      <footer className="relative z-10 text-center text-white/25 text-[12px] py-5 flex items-center justify-center gap-2">
        <Clock size={12} /> Les QR codes d'inscription sont limités dans le temps par l'école pour votre sécurité
      </footer>
    </div>
  );
}
