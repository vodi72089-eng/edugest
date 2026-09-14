'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, Users, School as SchoolIcon, CheckCircle2, ArrowRight, QrCode, Clock, Loader2 } from 'lucide-react';

interface SchoolInfo { name: string; shortName: string; logo: string | null; city: string; address: string }
interface ClassInfo { id: string; name: string }
interface StudentInfo { id: string; firstName: string; lastName: string; className: string }

type Step = 'loading' | 'search' | 'register' | 'done' | 'error';

/**
 * Page publique « Retrouver mon enfant ».
 * Le parent scanne le QR code généré par l'admin de l'école → arrive ici →
 * choisit la classe → cherche le nom de son enfant → crée son compte parent
 * (identifiants) → se connecte à l'application.
 */
export default function FindChildPage() {
  const [step, setStep] = useState<Step>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [expired, setExpired] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);

  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<StudentInfo | null>(null);
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentPassword, setParentPassword] = useState('');
  const [parentPassword2, setParentPassword2] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registeredLogin, setRegisteredLogin] = useState('');

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
        setStep('search');
      })
      .catch((e: Error) => {
        setErrorMsg(e.message);
        setStep('error');
      });
  }, []);

  const searchStudents = useCallback(async () => {
    if (!token || !classId || q.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/public/find-child?token=${encodeURIComponent(token)}&classId=${encodeURIComponent(classId)}&q=${encodeURIComponent(q.trim())}`);
      const j = await r.json();
      if (r.ok) {
        setStudents(j.data.students || []);
        setSearched(true);
      }
    } catch { /* ignore */ }
    finally { setSearching(false); }
  }, [token, classId, q]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !selectedStudent) return;
    if (parentPassword.length < 6) { setErrorMsg('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    if (parentPassword !== parentPassword2) { setErrorMsg('Les deux mots de passe ne correspondent pas.'); return; }
    setErrorMsg('');
    setRegistering(true);
    try {
      const r = await fetch('/api/public/parent-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          studentId: selectedStudent.id,
          name: parentName,
          phone: parentPhone,
          password: parentPassword,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErrorMsg(j.error || 'Erreur lors de la création du compte');
        return;
      }
      setRegisteredLogin(j.data.login);
      setStep('done');
    } catch {
      setErrorMsg('Erreur réseau. Réessayez.');
    } finally {
      setRegistering(false);
    }
  }

  const inputCls = 'w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition focus:ring-[3px] focus:ring-[oklch(55%_0.15_175_/_0.2)] focus:border-[oklch(55%_0.15_175_/_0.5)]';
  const inputStyle = { background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)' };

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

          {step === 'search' && school && (
            <>
              {/* École */}
              <div className="rounded-2xl border border-white/10 p-5 mb-5 flex items-center gap-4" style={{ background: 'rgba(26, 37, 32, 0.55)', backdropFilter: 'blur(24px)' }}>
                {school.logo ? (
                   
                  <img src={school.logo} alt={`Logo ${school.name}`} className="w-14 h-14 rounded-xl object-cover border border-white/10" />
                ) : (
                  <div className="w-14 h-14 rounded-xl grid place-items-center" style={{ background: 'oklch(72% 0.15 65 / 0.15)' }}>
                    <SchoolIcon size={24} style={{ color: 'oklch(72% 0.15 65)' }} />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-white font-bold text-lg leading-tight">{school.name}</div>
                  <div className="text-white/40 text-[13px]">{school.city || school.address || 'Bienvenue aux parents'}</div>
                </div>
              </div>

              {/* Recherche */}
              <div className="rounded-2xl border border-white/10 p-6" style={{ background: 'rgba(26, 37, 32, 0.55)', backdropFilter: 'blur(24px)' }}>
                <h1 className="text-xl font-bold text-white tracking-tight mb-1">Retrouver mon enfant</h1>
                <p className="text-white/50 text-sm mb-5">Choisissez la classe puis tapez le nom de votre enfant.</p>

                <label className="block text-[13px] font-medium text-white/70 mb-1.5">Classe de l&apos;enfant</label>
                <select value={classId} onChange={(e) => { setClassId(e.target.value); setStudents([]); setSearched(false); }} className={`${inputCls} mb-4 [&>option]:text-black`} style={inputStyle}>
                  <option value="">— Sélectionnez la classe —</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

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
                    {students.map(s => (
                      <button
                        key={s.id}
                        onClick={() => { setSelectedStudent(s); setErrorMsg(''); }}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition ${selectedStudent?.id === s.id ? 'border-[oklch(72%_0.15_65)] bg-[oklch(72%_0.15_65_/_0.1)]' : 'border-white/10 hover:bg-white/5'}`}
                      >
                        <div className="w-10 h-10 rounded-full grid place-items-center text-white font-bold text-sm shrink-0" style={{ background: 'linear-gradient(135deg, oklch(55% 0.15 175), oklch(72% 0.15 65))' }}>
                          {s.firstName[0]}{s.lastName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-semibold text-sm">{s.firstName} {s.lastName}</div>
                          <div className="text-white/40 text-[12px]">Classe {s.className}</div>
                        </div>
                        {selectedStudent?.id === s.id && <CheckCircle2 size={18} style={{ color: 'oklch(72% 0.15 65)' }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Création du compte parent */}
              {selectedStudent && (
                <form onSubmit={handleRegister} className="rounded-2xl border border-white/10 p-6 mt-5" style={{ background: 'rgba(26, 37, 32, 0.55)', backdropFilter: 'blur(24px)' }}>
                  <h2 className="text-lg font-bold text-white tracking-tight mb-1 flex items-center gap-2">
                    <Users size={17} style={{ color: 'oklch(72% 0.15 65)' }} /> Créer mon compte parent
                  </h2>
                  <p className="text-white/50 text-sm mb-5">
                    Pour <strong className="text-white/80">{selectedStudent.firstName} {selectedStudent.lastName}</strong> (classe {selectedStudent.className}).
                    Ces identifiants vous serviront à vous connecter.
                  </p>

                  {errorMsg && (
                    <div className="mb-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: 'rgba(186,26,26,0.15)', border: '1px solid rgba(186,26,26,0.4)', color: '#fca5a5' }}>
                      {errorMsg}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[13px] font-medium text-white/70 mb-1.5">Votre nom complet</label>
                      <input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="ex. Maman Kabila" className={inputCls} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-white/70 mb-1.5">Numéro de téléphone (identifiant de connexion)</label>
                      <input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="ex. +243 81 234 5678" type="tel" className={inputCls} style={inputStyle} required />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[13px] font-medium text-white/70 mb-1.5">Mot de passe</label>
                        <input value={parentPassword} onChange={(e) => setParentPassword(e.target.value)} type="password" placeholder="••••••••" className={inputCls} style={inputStyle} required />
                      </div>
                      <div>
                        <label className="block text-[13px] font-medium text-white/70 mb-1.5">Confirmer</label>
                        <input value={parentPassword2} onChange={(e) => setParentPassword2(e.target.value)} type="password" placeholder="••••••••" className={inputCls} style={inputStyle} required />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={registering}
                    className="w-full mt-5 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition active:scale-[0.98]"
                    style={{ background: 'oklch(55% 0.15 175)', color: 'oklch(97% 0.005 175)', boxShadow: '0 4px 16px oklch(55% 0.15 175 / 0.25)' }}
                  >
                    {registering ? <Loader2 size={16} className="animate-spin" /> : null}
                    Créer mon compte
                  </button>
                </form>
              )}
            </>
          )}

          {step === 'done' && (
            <div className="rounded-2xl border p-8 text-center" style={{ background: 'rgba(0,135,90,0.12)', borderColor: 'rgba(0,135,90,0.45)' }}>
              <CheckCircle2 size={44} className="mx-auto mb-4" style={{ color: '#22c55e' }} />
              <h1 className="text-2xl font-black text-white tracking-tight mb-2">Compte créé !</h1>
              <p className="text-white/60 text-sm mb-1">Votre compte parent a bien été créé.</p>
              <p className="text-white/40 text-[13px] mb-6">
                Connectez-vous avec le numéro <strong className="text-white/70">{registeredLogin}</strong> et votre mot de passe
                dans l&apos;onglet <strong className="text-white/70">Parent</strong> de la page de connexion.
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
