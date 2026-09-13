import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { GraduationCap, ShieldCheck, Users, LogIn } from "lucide-react";

export default function LoginPage() {
  const [params] = useSearchParams();
  const initialTab = params.get("role") === "parent" ? "PARENT" : "ADMIN";
  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [schoolId, setSchoolId] = useState(params.get("school") || "");
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(false);
  const { login, parentLogin, user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    api.get("/schools/search?q=").then(({ data }) => setSchools(data.schools || []));
  }, []);

  useEffect(() => {
    if (user && (user.role === "SCHOOL_ADMIN" || user.role === "SUPER_ADMIN")) nav("/admin");
  }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "PARENT") {
        if (!schoolId) throw new Error("Sélectionnez une école");
        await parentLogin(schoolId, username, password);
        toast.success("Bienvenue !");
        nav("/parent-lookup?authenticated=1");
      } else {
        const u = await login(email, password);
        toast.success(`Bienvenue ${u.name}`);
        if (u.role === "SCHOOL_ADMIN" || u.role === "SUPER_ADMIN") nav("/admin");
      }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen kente-pattern flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-6 justify-center">
          <GraduationCap className="text-amber-400" size={28} />
          <div className="font-serif text-2xl font-bold text-amber-300">EduGest Destock</div>
        </Link>

        <div className="glass-card gold-border-top rounded-xl p-6">
          <div className="grid grid-cols-3 border-b border-amber-500/20 mb-5">
            <button data-testid="login-role-tab-admin" onClick={() => setTab("ADMIN")} className={`tab-luxe ${tab==="ADMIN"?"active":""}`}>
              <ShieldCheck className="inline mr-1" size={14} /> Admin
            </button>
            <button data-testid="login-role-tab-teacher" onClick={() => setTab("TEACHER")} className={`tab-luxe ${tab==="TEACHER"?"active":""}`}>
              <Users className="inline mr-1" size={14} /> Enseignant
            </button>
            <button data-testid="login-role-tab-parent" onClick={() => setTab("PARENT")} className={`tab-luxe ${tab==="PARENT"?"active":""}`}>
              <GraduationCap className="inline mr-1" size={14} /> Parent
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {tab === "PARENT" ? (
              <>
                <div>
                  <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">École</label>
                  <select data-testid="parent-login-school-select" className="input-luxe mt-1" value={schoolId} onChange={(e)=>setSchoolId(e.target.value)} required>
                    <option value="">Sélectionner…</option>
                    {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Nom d'utilisateur parent</label>
                  <input data-testid="parent-login-username-input" className="input-luxe mt-1" value={username} onChange={(e)=>setUsername(e.target.value)} required />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Mot de passe</label>
                  <input data-testid="parent-login-password-input" type="password" className="input-luxe mt-1" value={password} onChange={(e)=>setPassword(e.target.value)} required />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Email</label>
                  <input data-testid="login-email-input" type="email" className="input-luxe mt-1" value={email} onChange={(e)=>setEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Mot de passe</label>
                  <input data-testid="login-password-input" type="password" className="input-luxe mt-1" value={password} onChange={(e)=>setPassword(e.target.value)} required />
                </div>
              </>
            )}

            <button data-testid="login-submit-button" disabled={loading} className="btn-gold w-full flex items-center justify-center gap-2">
              <LogIn size={16} /> {loading ? "Connexion…" : "Se connecter"}
            </button>
          </form>

          <div className="text-center mt-4 text-sm text-emerald-100/70">
            Pas encore d'école inscrite ?{" "}
            <Link to="/register-school" className="text-amber-400 underline">Enregistrer mon école</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
