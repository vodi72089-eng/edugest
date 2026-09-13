import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { GraduationCap, School } from "lucide-react";

export default function RegisterSchool() {
  const { registerSchool } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    school_name: "",
    admin_name: "",
    email: "",
    password: "",
    city: "",
    region: "",
  });
  const [loading, setLoading] = useState(false);

  const change = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await registerSchool(form);
      toast.success("École enregistrée avec succès !");
      nav("/admin");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen kente-pattern flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <Link to="/" className="flex items-center gap-2 mb-6 justify-center">
          <GraduationCap className="text-amber-400" size={28} />
          <div className="font-serif text-2xl font-bold text-amber-300">EduGest Destock</div>
        </Link>
        <div className="glass-card gold-border-top rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <School className="text-amber-400" size={22} />
            <h1 className="font-serif text-2xl text-amber-100">Enregistrer votre école</h1>
          </div>
          <p className="text-sm text-emerald-100/70 mb-5">Créez un compte administrateur et commencez à importer votre base d'élèves.</p>

          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Nom de l'école</label>
              <input data-testid="register-school-name" className="input-luxe mt-1" value={form.school_name} onChange={change("school_name")} required />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Ville</label>
              <input data-testid="register-school-city" className="input-luxe mt-1" value={form.city} onChange={change("city")} />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Région / Pays</label>
              <input data-testid="register-school-region" className="input-luxe mt-1" value={form.region} onChange={change("region")} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Nom du responsable</label>
              <input data-testid="register-admin-name" className="input-luxe mt-1" value={form.admin_name} onChange={change("admin_name")} required />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Email admin</label>
              <input data-testid="register-admin-email" type="email" className="input-luxe mt-1" value={form.email} onChange={change("email")} required />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Mot de passe</label>
              <input data-testid="register-admin-password" type="password" className="input-luxe mt-1" value={form.password} onChange={change("password")} required minLength={6} />
            </div>
            <button data-testid="register-school-submit" disabled={loading} className="btn-gold md:col-span-2 mt-2">
              {loading ? "Enregistrement…" : "Créer mon école"}
            </button>
          </form>
          <div className="text-center mt-4 text-sm text-emerald-100/70">
            Déjà inscrit ? <Link to="/login" className="text-amber-400 underline">Se connecter</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
