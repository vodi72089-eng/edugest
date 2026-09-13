import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { ScanLine, Search, GraduationCap, School } from "lucide-react";

export default function ParentLookup() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [className, setClassName] = useState("");
  const [name, setName] = useState("");
  const [results, setResults] = useState(null);
  const [manual, setManual] = useState(!token);

  useEffect(() => {
    if (!token) return;
    api.get(`/parent/qr-info/${token}`).then(({data}) => setInfo(data))
      .catch(e => setError(formatApiError(e.response?.data?.detail) || e.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/parent/lookup", {
        token, class_name: className, student_name: name,
      });
      setResults(data.students);
      if (!data.students.length) toast.info("Aucun enfant trouvé — vérifiez l'orthographe");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  if (manual && !token) {
    return (
      <div className="min-h-screen kente-pattern flex items-center justify-center px-4">
        <div className="glass-card gold-border-top rounded-xl p-6 max-w-md w-full text-center">
          <ScanLine className="text-amber-400 mx-auto" size={48}/>
          <h1 className="font-serif text-3xl text-amber-100 mt-3">Portail Parent QR</h1>
          <p className="text-emerald-100/70 mt-2 text-sm">Vous devez scanner le QR code fourni par l'école pour accéder à ce portail.</p>
          <Link to="/" className="btn-gold inline-block mt-5">Retour à l'accueil</Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen kente-pattern flex items-center justify-center px-4">
        <div className="glass-card rounded-xl p-6 max-w-md w-full text-center border border-red-500/40">
          <div className="text-red-400 font-serif text-3xl">QR Invalide</div>
          <div className="text-emerald-100/70 mt-3">{error}</div>
          <Link to="/" className="btn-gold inline-block mt-5">Accueil</Link>
        </div>
      </div>
    );
  }

  if (!info) return <div className="min-h-screen kente-pattern flex items-center justify-center text-amber-300">Vérification du QR…</div>;

  return (
    <div className="min-h-screen kente-pattern">
      <nav className="glass-card gold-border-top px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-serif text-xl text-amber-300 font-bold flex items-center gap-2"><GraduationCap size={22}/> EduGest Destock</Link>
        <div className="text-xs text-emerald-100/60 font-mono">QR expire: {new Date(info.expires_at).toLocaleString("fr-FR")}</div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-6">
          <div className="badge-gold">ACCÈS PARENT AUTORISÉ</div>
          <h1 className="font-serif text-4xl text-amber-100 mt-3">Retrouver mon enfant</h1>
          <div className="flex items-center justify-center gap-2 mt-2 text-emerald-100/70">
            <School size={16} className="text-amber-400"/> <span>{info.school?.name}</span>
          </div>
        </div>

        <form onSubmit={submit} className="glass-card gold-border-top rounded-xl p-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Classe</label>
            <select data-testid="parent-find-child-class-select" required className="input-luxe mt-1" value={className} onChange={(e)=>setClassName(e.target.value)}>
              <option value="">Sélectionner la classe…</option>
              {info.classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Nom ou prénom de l'enfant</label>
            <input data-testid="parent-find-child-name-input" required className="input-luxe mt-1" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Ex: Diallo, Aïcha…"/>
          </div>
          <button data-testid="parent-find-child-submit-button" className="btn-gold w-full flex items-center justify-center gap-2"><Search size={16}/> Rechercher</button>
        </form>

        {results !== null && (
          <div className="mt-6">
            <h2 className="font-serif text-2xl text-amber-200 mb-3">Résultats ({results.length})</h2>
            {results.length === 0 ? (
              <div className="glass-card p-4 rounded-md text-emerald-100/70">Aucun enfant trouvé.</div>
            ) : (
              <div className="space-y-3">
                {results.map(s => (
                  <div key={s.id} data-testid={`parent-result-${s.id}`} className="glass-card gold-glow gold-border-top rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <div className="font-serif text-xl text-amber-100">{s.first_name} {s.last_name}</div>
                      <div className="text-sm text-emerald-100/70">Classe: {s.class_name} · Matricule: <span className="font-mono text-amber-300">{s.matricule||"—"}</span></div>
                      {s.parent_username && <div className="text-xs text-emerald-100/60 mt-1">Identifiant parent: <span className="font-mono">{s.parent_username}</span></div>}
                    </div>
                    <Link to={`/login?role=parent&school=${info.school?.id}`} className="btn-outline-gold text-xs">Se connecter</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
