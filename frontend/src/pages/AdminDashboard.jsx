import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Database, Users, ScanLine, FileText, Stethoscope, LogOut,
  UploadCloud, Plus, Trash2, KeyRound, Download, Search, Copy
} from "lucide-react";
import { generateBulletinPDF, generateMedicalReceiptPDF } from "@/lib/pdfUtils";

const TABS = [
  { id: "overview", label: "Vue d'ensemble", icon: Users },
  { id: "import", label: "Import Base", icon: Database },
  { id: "students", label: "Élèves & Parents", icon: Users },
  { id: "qr", label: "QR Parent", icon: ScanLine },
  { id: "bulletin", label: "Bulletin PDF", icon: FileText },
  { id: "medical", label: "Reçu Médical", icon: Stethoscope },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("overview");
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [qrTokens, setQrTokens] = useState([]);
  const [school, setSchool] = useState(null);
  const nav = useNavigate();

  const refreshAll = async () => {
    try {
      const [s, c, q, sc] = await Promise.all([
        api.get("/admin/students"),
        api.get("/admin/classes"),
        api.get("/admin/qr-tokens"),
        api.get(`/schools/${user.school_id}`),
      ]);
      setStudents(s.data.students || []);
      setClasses(c.data.classes || []);
      setQrTokens(q.data.tokens || []);
      setSchool(sc.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  useEffect(() => { refreshAll(); /* eslint-disable-next-line */ }, []);

  const handleLogout = async () => { await logout(); nav("/"); };

  return (
    <div className="min-h-screen kente-pattern">
      <nav className="glass-card gold-border-top px-6 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-serif text-xl text-amber-300 font-bold">EduGest Destock</Link>
          <span className="badge-gold">{school?.code || "..."}</span>
          <span className="text-emerald-100/80 text-sm">{school?.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-emerald-100/80">{user?.name} · <span className="text-amber-400 font-mono text-xs">{user?.role}</span></span>
          <button data-testid="admin-logout-button" onClick={handleLogout} className="btn-outline-gold text-sm flex items-center gap-1"><LogOut size={14}/> Déconnexion</button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-2 border-b border-amber-500/20 mb-6">
          {TABS.map((t) => {
            const Ic = t.icon;
            return (
              <button key={t.id} data-testid={`admin-tab-${t.id}`} onClick={() => setTab(t.id)} className={`tab-luxe ${tab===t.id?"active":""} flex items-center gap-2`}>
                <Ic size={16}/> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "overview" && <Overview students={students} classes={classes} qrTokens={qrTokens} school={school}/>}
        {tab === "import" && <ImportTab onDone={refreshAll} />}
        {tab === "students" && <StudentsTab students={students} classes={classes} refresh={refreshAll}/>}
        {tab === "qr" && <QRTab qrTokens={qrTokens} refresh={refreshAll}/>}
        {tab === "bulletin" && <BulletinTab students={students} school={school}/>}
        {tab === "medical" && <MedicalTab students={students} school={school}/>}
      </div>
    </div>
  );
}

function Overview({ students, classes, qrTokens, school }) {
  const activeQR = qrTokens.filter(t => t.active && new Date(t.expires_at) > new Date()).length;
  return (
    <div className="grid md:grid-cols-4 gap-4">
      <Stat label="Élèves" value={students.length} icon={Users}/>
      <Stat label="Classes" value={classes.length} icon={FileText}/>
      <Stat label="QR Codes actifs" value={activeQR} icon={ScanLine}/>
      <Stat label="Code École" value={school?.code || "-"} icon={KeyRound}/>
      <div className="glass-card gold-border-top rounded-lg p-5 md:col-span-4">
        <div className="text-amber-400 text-xs tracking-widest font-mono">BIENVENUE</div>
        <h2 className="font-serif text-3xl text-amber-100 mt-2">{school?.name}</h2>
        <p className="text-emerald-100/70 text-sm mt-2">Utilisez l'onglet <b className="text-amber-300">Import Base</b> pour injecter vos données d'école, puis générez des QR codes parents avec durée personnalisée.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }) {
  return (
    <div data-testid={`stat-${label}`} className="glass-card gold-border-top rounded-lg p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">{label}</div>
        <Icon className="text-amber-400/70" size={18}/>
      </div>
      <div className="font-serif text-4xl text-amber-100 mt-2">{value}</div>
    </div>
  );
}

function ImportTab({ onDone }) {
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const parseCsvToStudents = (text) => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    return lines.slice(1).map(l => {
      const cols = l.split(",");
      const obj = {};
      headers.forEach((h, i) => obj[h] = (cols[i]||"").trim());
      return obj;
    });
  };

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    try {
      if (f.name.endsWith(".json")) {
        const data = JSON.parse(text);
        setJson(JSON.stringify(data, null, 2));
        setPreview({
          students: data.students || (Array.isArray(data) ? data : []),
          classes: data.classes || [],
        });
      } else {
        const students = parseCsvToStudents(text);
        setPreview({ students, classes: [] });
        setJson(JSON.stringify({ students, classes: [] }, null, 2));
      }
    } catch (err) {
      toast.error("Fichier invalide: " + err.message);
    }
  };

  const submit = async () => {
    if (!preview) return toast.error("Aucune donnée à importer");
    setBusy(true);
    try {
      const { data } = await api.post("/admin/import", preview);
      toast.success(`${data.inserted_students} élève(s), ${data.inserted_classes} classe(s) importée(s)`);
      setPreview(null); setJson("");
      onDone();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setBusy(false); }
  };

  const sampleJson = () => setJson(JSON.stringify({
    classes: [{name:"6ème A", level:"COLLEGE"},{name:"3ème B", level:"COLLEGE"}],
    students: [
      { first_name:"Aïcha", last_name:"Diallo", class_name:"6ème A", matricule:"S001", parent_username:"diallo.p", parent_password:"Parent123!" },
      { first_name:"Mamadou", last_name:"Ndiaye", class_name:"3ème B", matricule:"S002", parent_username:"ndiaye.p", parent_password:"Parent123!" },
    ]
  }, null, 2));

  return (
    <div className="glass-card gold-border-top rounded-xl p-6">
      <h2 className="font-serif text-2xl text-amber-100">Importer la base de données</h2>
      <p className="text-sm text-emerald-100/70 mt-1">Chargez un fichier <b>CSV</b> ou <b>JSON</b> avec colonnes: <span className="font-mono text-amber-300">first_name, last_name, class_name, matricule, parent_username, parent_password</span></p>

      <label data-testid="admin-db-import-dropzone" className="mt-5 flex flex-col items-center justify-center border-2 border-dashed border-amber-500/40 rounded-lg p-8 cursor-pointer hover:bg-amber-500/5">
        <UploadCloud className="text-amber-400 mb-2" size={32}/>
        <div className="text-amber-200">Déposer un fichier CSV ou JSON</div>
        <input data-testid="admin-db-import-file" type="file" accept=".csv,.json" onChange={handleFile} className="hidden"/>
      </label>

      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">JSON éditable</div>
            <button onClick={sampleJson} className="text-xs text-amber-400 underline">Exemple</button>
          </div>
          <textarea
            data-testid="admin-db-import-json"
            className="input-luxe font-mono text-xs h-64"
            value={json}
            onChange={(e) => {
              setJson(e.target.value);
              try { setPreview(JSON.parse(e.target.value)); } catch { setPreview(null); }
            }}
            placeholder='{"students":[...],"classes":[...]}'
          />
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-amber-400/80 font-mono mb-1">Aperçu</div>
          <div className="rounded-md border border-amber-500/20 max-h-64 overflow-auto">
            <table className="luxe-table">
              <thead><tr><th>Nom</th><th>Classe</th><th>Matricule</th><th>Parent</th></tr></thead>
              <tbody>
                {(preview?.students || []).slice(0, 20).map((s, i) => (
                  <tr key={i}><td>{s.first_name} {s.last_name}</td><td>{s.class_name}</td><td>{s.matricule}</td><td>{s.parent_username}</td></tr>
                ))}
              </tbody>
            </table>
            {(!preview || !preview.students?.length) && <div className="p-4 text-emerald-100/50 text-sm">Aucun aperçu</div>}
          </div>
        </div>
      </div>

      <button data-testid="admin-db-import-submit-button" disabled={busy || !preview} onClick={submit} className="btn-gold mt-5">
        {busy ? "Synchronisation…" : "Synchroniser avec la Base de Données Destock"}
      </button>
    </div>
  );
}

function StudentsTab({ students, classes, refresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ first_name:"", last_name:"", class_name:"", matricule:"", parent_username:"", parent_password:"" });
  const [editParent, setEditParent] = useState(null);
  const [pcreds, setPcreds] = useState({ username:"", password:"" });
  const [filter, setFilter] = useState("");

  const submit = async () => {
    try {
      await api.post("/admin/students", form);
      toast.success("Élève ajouté");
      setForm({ first_name:"", last_name:"", class_name:"", matricule:"", parent_username:"", parent_password:"" });
      setShowAdd(false);
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const saveCreds = async () => {
    try {
      await api.patch(`/admin/students/${editParent.id}/parent-credentials`, pcreds);
      toast.success("Identifiants parent enregistrés");
      setEditParent(null); setPcreds({ username:"", password:"" });
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const del = async (id) => {
    if (!window.confirm("Supprimer cet élève ?")) return;
    await api.delete(`/admin/students/${id}`); refresh();
  };

  const filtered = students.filter(s => {
    const q = filter.toLowerCase();
    return !q || `${s.first_name} ${s.last_name} ${s.class_name}`.toLowerCase().includes(q);
  });

  return (
    <div className="glass-card gold-border-top rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-2xl text-amber-100">Élèves & Comptes Parents</h2>
        <button data-testid="admin-add-student-button" onClick={() => setShowAdd(!showAdd)} className="btn-gold flex items-center gap-2"><Plus size={16}/> Ajouter</button>
      </div>

      {showAdd && (
        <div className="grid md:grid-cols-3 gap-3 p-4 rounded-md bg-emerald-950/50 border border-amber-500/20 mb-5">
          <input data-testid="student-first-name" className="input-luxe" placeholder="Prénom" value={form.first_name} onChange={(e)=>setForm({...form, first_name:e.target.value})}/>
          <input data-testid="student-last-name" className="input-luxe" placeholder="Nom" value={form.last_name} onChange={(e)=>setForm({...form, last_name:e.target.value})}/>
          <select className="input-luxe" value={form.class_name} onChange={(e)=>setForm({...form, class_name:e.target.value})}>
            <option value="">Classe…</option>
            {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <input className="input-luxe" placeholder="Matricule" value={form.matricule} onChange={(e)=>setForm({...form, matricule:e.target.value})}/>
          <input className="input-luxe" placeholder="Identifiant parent" value={form.parent_username} onChange={(e)=>setForm({...form, parent_username:e.target.value})}/>
          <input className="input-luxe" type="password" placeholder="Mot de passe parent" value={form.parent_password} onChange={(e)=>setForm({...form, parent_password:e.target.value})}/>
          <button onClick={submit} className="btn-gold md:col-span-3">Enregistrer</button>
        </div>
      )}

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400/70" size={16}/>
        <input className="input-luxe pl-9" placeholder="Rechercher…" value={filter} onChange={(e)=>setFilter(e.target.value)}/>
      </div>

      <div className="overflow-auto max-h-[55vh]">
        <table className="luxe-table">
          <thead><tr><th>Nom complet</th><th>Classe</th><th>Matricule</th><th>Parent</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} data-testid={`student-row-${s.id}`}>
                <td>{s.first_name} {s.last_name}</td>
                <td>{s.class_name}</td>
                <td className="font-mono text-amber-300 text-xs">{s.matricule || "—"}</td>
                <td>{s.parent_username || <span className="text-emerald-100/40 italic">non défini</span>}</td>
                <td className="flex gap-2">
                  <button data-testid={`edit-parent-${s.id}`} onClick={()=>{ setEditParent(s); setPcreds({username: s.parent_username||"", password:""}); }} className="btn-outline-gold text-xs flex items-center gap-1"><KeyRound size={12}/> Parent</button>
                  <button onClick={()=>del(s.id)} className="btn-outline-gold text-xs" style={{color:"#EF4444", borderColor:"rgba(239,68,68,0.5)"}}><Trash2 size={12}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-8 text-emerald-100/60">Aucun élève.</div>}
      </div>

      {editParent && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={()=>setEditParent(null)}>
          <div onClick={e=>e.stopPropagation()} className="glass-card gold-border-top rounded-xl p-6 max-w-md w-full">
            <h3 className="font-serif text-2xl text-amber-100">Compte Parent — {editParent.first_name} {editParent.last_name}</h3>
            <p className="text-sm text-emerald-100/60 mt-1">Créer/modifier les identifiants du parent.</p>
            <div className="mt-4 space-y-3">
              <input data-testid="admin-parent-credentials-username-input" className="input-luxe" placeholder="Nom d'utilisateur" value={pcreds.username} onChange={(e)=>setPcreds({...pcreds, username:e.target.value})}/>
              <input data-testid="admin-parent-credentials-password-input" type="text" className="input-luxe" placeholder="Mot de passe" value={pcreds.password} onChange={(e)=>setPcreds({...pcreds, password:e.target.value})}/>
              <button data-testid="admin-parent-credentials-save-button" onClick={saveCreds} className="btn-gold w-full">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QRTab({ qrTokens, refresh }) {
  const [duration, setDuration] = useState(24);
  const [current, setCurrent] = useState(null);
  const [dataUrl, setDataUrl] = useState("");

  const generate = async () => {
    const { data } = await api.post("/admin/qr-tokens", { duration_hours: Number(duration) });
    setCurrent(data);
    const url = `${window.location.origin}/parent-lookup/${data.token}`;
    const png = await QRCode.toDataURL(url, { errorCorrectionLevel:"M", width: 512, color:{dark:"#061F17", light:"#FFFFFF"}, margin:2 });
    setDataUrl(png);
    toast.success("QR Code généré");
    refresh();
  };

  const revoke = async (tk) => { await api.delete(`/admin/qr-tokens/${tk}`); refresh(); };

  const copyLink = (tk) => {
    const url = `${window.location.origin}/parent-lookup/${tk}`;
    navigator.clipboard.writeText(url);
    toast.success("Lien copié !");
  };

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl; a.download = `qr-parent-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="glass-card gold-border-top rounded-xl p-6">
        <h2 className="font-serif text-2xl text-amber-100">Générer un QR Code Parent</h2>
        <p className="text-sm text-emerald-100/70 mt-1">Les parents scannent le QR et retrouvent leur enfant par classe + nom.</p>

        <div className="mt-5">
          <label className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">Durée de vie</label>
          <select data-testid="admin-qr-generator-duration-select" className="input-luxe mt-1" value={duration} onChange={(e)=>setDuration(e.target.value)}>
            <option value={1}>1 heure</option>
            <option value={24}>24 heures</option>
            <option value={168}>7 jours</option>
            <option value={720}>30 jours</option>
            <option value={8760}>1 an</option>
          </select>
        </div>
        <button data-testid="admin-qr-generate-button" onClick={generate} className="btn-gold mt-4 w-full">Générer le QR Code</button>

        {current && (
          <div className="mt-5 p-4 rounded-md bg-emerald-950/60 border border-amber-500/25">
            <div className="text-xs text-amber-400/80 font-mono tracking-widest">EXPIRE LE</div>
            <div className="font-mono text-amber-100">{new Date(current.expires_at).toLocaleString("fr-FR")}</div>
            <div className="flex justify-center mt-3">
              <img src={dataUrl} alt="QR Code" className="w-56 h-56 rounded-md border border-amber-500/40 bg-white"/>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={download} className="btn-outline-gold flex-1 flex items-center justify-center gap-1"><Download size={14}/> Télécharger</button>
              <button onClick={()=>copyLink(current.token)} className="btn-outline-gold flex-1 flex items-center justify-center gap-1"><Copy size={14}/> Copier lien</button>
            </div>
          </div>
        )}
      </div>

      <div className="glass-card gold-border-top rounded-xl p-6">
        <h2 className="font-serif text-2xl text-amber-100">Historique QR Codes</h2>
        <div className="mt-4 space-y-2 max-h-[60vh] overflow-auto">
          {qrTokens.length === 0 && <div className="text-emerald-100/60 text-sm">Aucun QR généré</div>}
          {qrTokens.map(t => {
            const expired = new Date(t.expires_at) < new Date();
            return (
              <div key={t.token} className="rounded-md border border-amber-500/20 p-3 flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs text-amber-300">{t.token.slice(0,8)}…</div>
                  <div className="text-xs text-emerald-100/70">Expire: {new Date(t.expires_at).toLocaleString("fr-FR")}</div>
                  <div className={`text-[10px] font-mono ${!t.active?"text-red-400":expired?"text-orange-400":"text-green-400"}`}>
                    {!t.active ? "● RÉVOQUÉ" : expired ? "● EXPIRÉ" : "● ACTIF"}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={()=>copyLink(t.token)} className="btn-outline-gold text-xs"><Copy size={12}/></button>
                  {t.active && <button onClick={()=>revoke(t.token)} className="btn-outline-gold text-xs" style={{color:"#EF4444", borderColor:"rgba(239,68,68,0.5)"}}><Trash2 size={12}/></button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BulletinTab({ students, school }) {
  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState("Trimestre 1");
  const [year, setYear] = useState(`${new Date().getFullYear()}-${new Date().getFullYear()+1}`);
  const [grades, setGrades] = useState([
    { subject: "Mathématiques", coefficient: 4, grade: 15, class_avg: 12, appreciation: "Bien" },
    { subject: "Français", coefficient: 4, grade: 14, class_avg: 11, appreciation: "Assez bien" },
    { subject: "Physique", coefficient: 3, grade: 16, class_avg: 13, appreciation: "Très bien" },
  ]);
  const [appreciation, setAppreciation] = useState("Élève sérieux et régulier.");
  const [rank, setRank] = useState("3/32");
  const [busy, setBusy] = useState(false);

  const avg = grades.length ? grades.reduce((s,g) => s + Number(g.grade||0)*Number(g.coefficient||1), 0) / grades.reduce((s,g)=>s+Number(g.coefficient||1),0) : 0;

  const addRow = () => setGrades([...grades, { subject:"", coefficient:1, grade:0, class_avg:0, appreciation:"" }]);
  const update = (i, k, v) => { const g = [...grades]; g[i][k] = v; setGrades(g); };
  const remove = (i) => setGrades(grades.filter((_,idx)=>idx!==i));

  const download = async () => {
    const student = students.find(s => s.id === studentId);
    if (!student) return toast.error("Sélectionner un élève");
    setBusy(true);
    try {
      const { data } = await api.post("/documents/bulletin", {
        student_id: studentId,
        class_name: student.class_name,
        student_name: `${student.first_name} ${student.last_name}`,
        term, year, grades, average: Number(avg.toFixed(2)), rank, appreciation,
      });
      await generateBulletinPDF({
        docId: data.id,
        verifyUrl: data.verify_url,
        schoolName: school?.name,
        studentName: `${student.first_name} ${student.last_name}`,
        className: student.class_name,
        matricule: student.matricule,
        term, year, grades, average: avg, rank, appreciation,
      });
      toast.success("Bulletin PDF généré avec QR officiel");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="glass-card gold-border-top rounded-xl p-6">
      <h2 className="font-serif text-2xl text-amber-100">Générateur de Bulletin (PDF + QR Officiel)</h2>
      <div className="grid md:grid-cols-3 gap-3 mt-4">
        <select data-testid="bulletin-student-select" className="input-luxe" value={studentId} onChange={(e)=>setStudentId(e.target.value)}>
          <option value="">Choisir un élève…</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} — {s.class_name}</option>)}
        </select>
        <input className="input-luxe" value={term} onChange={(e)=>setTerm(e.target.value)} placeholder="Trimestre"/>
        <input className="input-luxe" value={year} onChange={(e)=>setYear(e.target.value)} placeholder="Année"/>
      </div>

      <div className="mt-4 overflow-auto">
        <table className="luxe-table">
          <thead><tr><th>Matière</th><th>Coef</th><th>Note</th><th>Moy. Classe</th><th>Appréciation</th><th></th></tr></thead>
          <tbody>
            {grades.map((g,i) => (
              <tr key={i}>
                <td><input className="input-luxe" value={g.subject} onChange={(e)=>update(i,"subject",e.target.value)}/></td>
                <td><input className="input-luxe w-16" type="number" value={g.coefficient} onChange={(e)=>update(i,"coefficient",Number(e.target.value))}/></td>
                <td><input className="input-luxe w-20" type="number" step="0.25" value={g.grade} onChange={(e)=>update(i,"grade",Number(e.target.value))}/></td>
                <td><input className="input-luxe w-20" type="number" step="0.25" value={g.class_avg} onChange={(e)=>update(i,"class_avg",Number(e.target.value))}/></td>
                <td><input className="input-luxe" value={g.appreciation} onChange={(e)=>update(i,"appreciation",e.target.value)}/></td>
                <td><button onClick={()=>remove(i)} className="btn-outline-gold text-xs" style={{color:"#EF4444",borderColor:"rgba(239,68,68,0.5)"}}><Trash2 size={12}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addRow} className="btn-outline-gold text-sm mt-3">+ Ajouter une matière</button>

      <div className="mt-4 grid md:grid-cols-3 gap-3">
        <input className="input-luxe" value={rank} onChange={(e)=>setRank(e.target.value)} placeholder="Rang (ex: 3/32)"/>
        <input className="input-luxe md:col-span-2" value={appreciation} onChange={(e)=>setAppreciation(e.target.value)} placeholder="Appréciation générale"/>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="text-amber-300 font-serif text-xl">Moyenne : <b>{avg.toFixed(2)} / 20</b></div>
        <button data-testid="generate-bulletin-pdf-button" onClick={download} disabled={busy} className="btn-gold flex items-center gap-2">
          <FileText size={16}/> {busy ? "Génération…" : "Télécharger PDF"}
        </button>
      </div>
    </div>
  );
}

function MedicalTab({ students, school }) {
  const [form, setForm] = useState({ student_id:"", reason:"", treatment:"", medic_name:"", clearance:"APTE", amount:0, currency:"FCFA" });
  const [busy, setBusy] = useState(false);
  const student = students.find(s => s.id === form.student_id);

  const download = async () => {
    if (!student) return toast.error("Sélectionner un élève");
    setBusy(true);
    try {
      const payload = {
        ...form,
        student_id: student.id,
        student_name: `${student.first_name} ${student.last_name}`,
        class_name: student.class_name,
      };
      const { data } = await api.post("/documents/medical", payload);
      await generateMedicalReceiptPDF({
        docId: data.id,
        verifyUrl: data.verify_url,
        schoolName: school?.name,
        studentName: payload.student_name,
        className: payload.class_name,
        reason: payload.reason,
        treatment: payload.treatment,
        medic_name: payload.medic_name,
        clearance: payload.clearance,
        amount: payload.amount,
        currency: payload.currency,
      });
      toast.success("Reçu médical généré");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div className="glass-card gold-border-top rounded-xl p-6">
      <h2 className="font-serif text-2xl text-amber-100">Reçu du Service Médical</h2>
      <p className="text-sm text-emerald-100/70 mt-1">Générez un reçu médical officiel avec QR vérifiable.</p>

      <div className="mt-5 grid md:grid-cols-2 gap-3">
        <select data-testid="medical-student-select" className="input-luxe" value={form.student_id} onChange={(e)=>setForm({...form, student_id:e.target.value})}>
          <option value="">Élève concerné…</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} — {s.class_name}</option>)}
        </select>
        <input className="input-luxe" placeholder="Nom du médecin / infirmier" value={form.medic_name} onChange={(e)=>setForm({...form, medic_name:e.target.value})}/>
        <input className="input-luxe md:col-span-2" placeholder="Motif de la consultation" value={form.reason} onChange={(e)=>setForm({...form, reason:e.target.value})}/>
        <input className="input-luxe md:col-span-2" placeholder="Traitement / Prescription" value={form.treatment} onChange={(e)=>setForm({...form, treatment:e.target.value})}/>
        <select className="input-luxe" value={form.clearance} onChange={(e)=>setForm({...form, clearance:e.target.value})}>
          <option value="APTE">APTE à reprendre les cours</option>
          <option value="REPOS">REPOS recommandé</option>
          <option value="HOSPITALISATION">HOSPITALISATION</option>
        </select>
        <div className="grid grid-cols-3 gap-2">
          <input className="input-luxe col-span-2" type="number" placeholder="Montant" value={form.amount} onChange={(e)=>setForm({...form, amount:Number(e.target.value)})}/>
          <input className="input-luxe" placeholder="Devise" value={form.currency} onChange={(e)=>setForm({...form, currency:e.target.value})}/>
        </div>
      </div>

      <button data-testid="generate-medical-receipt-button" onClick={download} disabled={busy} className="btn-gold mt-5 flex items-center gap-2">
        <Stethoscope size={16}/> {busy ? "Génération…" : "Télécharger Reçu Médical"}
      </button>
    </div>
  );
}
