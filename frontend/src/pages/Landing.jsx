import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Search, GraduationCap, ShieldCheck, ScanLine, ArrowRight } from "lucide-react";

export default function Landing() {
  const [q, setQ] = useState("");
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const search = async (query) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/schools/search?q=${encodeURIComponent(query || "")}`);
      setSchools(data.schools || []);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  useEffect(() => { search(""); }, []);

  return (
    <div className="min-h-screen kente-pattern">
      {/* NAV */}
      <nav className="fixed top-0 inset-x-0 z-40 glass-card gold-border-top px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="text-amber-400" size={28} />
          <div>
            <div className="font-serif text-xl font-bold text-amber-300 leading-none">EduGest</div>
            <div className="text-[10px] tracking-[0.3em] text-emerald-100/70 font-mono">DESTOCK</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" data-testid="nav-login-link" className="btn-outline-gold text-sm">Se connecter</Link>
          <Link to="/register-school" data-testid="nav-register-school-link" className="btn-gold text-sm">Enregistrer une école</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="pt-32 pb-10 px-4 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7">
            <div className="badge-gold mb-4">PLATEFORME SCOLAIRE D'EXCELLENCE</div>
            <h1 className="font-serif text-5xl sm:text-6xl font-bold text-amber-100 leading-[1.05]">
              Trouvez votre école,<br/>
              <span className="text-amber-400">retrouvez vos enfants.</span>
            </h1>
            <p className="mt-5 text-emerald-100/80 max-w-xl text-base leading-relaxed">
              EduGest / Destock relie les écoles, les élèves, les enseignants et les parents grâce à
              un système sécurisé de bulletins, reçus médicaux et QR codes officiels.
            </p>

            <div className="mt-8 glass-card gold-border-top rounded-lg p-4">
              <div className="text-xs uppercase tracking-widest text-amber-400/80 mb-2 font-mono">Trouver mon école</div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400/70" size={18} />
                  <input
                    data-testid="find-school-input"
                    className="input-luxe pl-10"
                    placeholder="Nom, ville, région ou code école (ex: LYD, DAK)…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && search(q)}
                  />
                </div>
                <button data-testid="find-school-button" onClick={() => search(q)} className="btn-gold">Rechercher</button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              <Link to="/login" data-testid="quick-admin-tile" className="glass-card gold-glow p-3 rounded-md flex items-center gap-2 text-sm">
                <ShieldCheck className="text-amber-400" size={18} />
                <span className="text-emerald-100">Espace École</span>
              </Link>
              <Link to="/login?role=parent" data-testid="quick-parent-tile" className="glass-card gold-glow p-3 rounded-md flex items-center gap-2 text-sm">
                <GraduationCap className="text-amber-400" size={18} />
                <span className="text-emerald-100">Portail Parent</span>
              </Link>
              <Link to="/parent-lookup" data-testid="quick-qr-tile" className="glass-card gold-glow p-3 rounded-md flex items-center gap-2 text-sm">
                <ScanLine className="text-amber-400" size={18} />
                <span className="text-emerald-100">QR Access</span>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="glass-card gold-border-top rounded-xl p-6 relative overflow-hidden">
              <div className="absolute inset-0 opacity-30" style={{background: "radial-gradient(circle at 80% 20%, rgba(212,175,55,0.4), transparent 50%)"}} />
              <div className="relative">
                <div className="text-amber-400 text-xs font-mono tracking-[0.25em]">DOCUMENT OFFICIEL</div>
                <div className="font-serif text-3xl text-amber-100 mt-2">Bulletin & Reçu Médical</div>
                <div className="text-emerald-100/80 text-sm mt-2">Chaque PDF généré porte un QR code unique — vérifiable publiquement.</div>
                <div className="grid grid-cols-3 gap-2 mt-6">
                  <div className="col-span-2 rounded-lg bg-emerald-950/60 border border-amber-500/25 p-4">
                    <div className="text-[10px] tracking-widest text-amber-400/80 font-mono">BULLETIN TRIM. 2</div>
                    <div className="font-serif text-lg text-amber-200 mt-1">Moy: 15.75 / 20</div>
                    <div className="text-xs text-emerald-100/70 mt-1">Rang 3 / 32</div>
                  </div>
                  <div className="rounded-lg bg-white flex items-center justify-center p-2">
                    <div className="w-full aspect-square grid grid-cols-8 grid-rows-8 gap-[1px]">
                      {Array.from({length: 64}).map((_,i)=>(
                        <div key={i} style={{background: Math.random()>0.5 ? "#061F17":"#fff"}} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SCHOOL RESULTS */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-3xl text-amber-200">Écoles Connectées</h2>
          <div className="text-xs text-emerald-100/60 font-mono">{schools.length} établissement(s)</div>
        </div>
        {loading ? (
          <div className="text-amber-200/70">Recherche…</div>
        ) : schools.length === 0 ? (
          <div className="glass-card p-6 rounded-lg text-emerald-100/70">Aucune école pour le moment. <Link to="/register-school" className="text-amber-400 underline">Enregistrez la vôtre</Link>.</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {schools.map((s) => (
              <div key={s.id} data-testid={`school-card-${s.id}`} className="glass-card gold-glow gold-border-top rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <div className="badge-gold">{s.code || "SCH"}</div>
                  <span className="text-[10px] text-green-400 font-mono">● ACTIVE</span>
                </div>
                <h3 className="font-serif text-2xl text-amber-100 mt-3">{s.name}</h3>
                <div className="text-sm text-emerald-100/70 mt-1">{[s.city, s.region].filter(Boolean).join(" · ")}</div>
                <button onClick={() => nav(`/login?school=${s.id}`)} className="mt-4 flex items-center gap-2 text-amber-400 hover:text-amber-300 text-sm font-medium">
                  Accéder à l'établissement <ArrowRight size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-amber-500/15 py-6 px-4 text-center text-xs text-emerald-100/50">
        EduGest / Destock — {new Date().getFullYear()} — Plateforme scolaire d'excellence
      </footer>
    </div>
  );
}
