import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { CheckCircle2, XCircle, ShieldCheck, GraduationCap, Stethoscope, FileText } from "lucide-react";

export default function VerifyDoc() {
  const { docId } = useParams();
  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    api.get(`/documents/verify/${docId}`)
      .then(({data}) => { setDoc(data); setStatus(data.official ? "ok" : "invalid"); })
      .catch(() => setStatus("invalid"));
  }, [docId]);

  const isBulletin = doc?.type === "BULLETIN";
  const Icon = isBulletin ? FileText : Stethoscope;

  return (
    <div className="min-h-screen kente-pattern flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <Link to="/" className="flex items-center gap-2 mb-6 justify-center">
          <GraduationCap className="text-amber-400" size={26}/>
          <div className="font-serif text-2xl text-amber-300 font-bold">EduGest Destock</div>
        </Link>

        {status === "loading" && (
          <div className="glass-card gold-border-top rounded-xl p-8 text-center text-amber-200">Vérification en cours…</div>
        )}

        {status === "invalid" && (
          <div className="glass-card rounded-xl p-8 text-center border border-red-500/40">
            <XCircle className="text-red-400 mx-auto" size={64}/>
            <h1 className="font-serif text-3xl text-red-300 mt-4">Document non authentique</h1>
            <p className="text-emerald-100/70 mt-2">Ce QR code ne correspond à aucun document officiel enregistré dans EduGest Destock.</p>
            <div className="font-mono text-xs text-emerald-100/40 mt-3">ID: {docId}</div>
          </div>
        )}

        {status === "ok" && doc && (
          <div className="glass-card gold-border-top rounded-xl p-8 relative overflow-hidden">
            <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full" style={{background: "radial-gradient(circle, rgba(212,175,55,0.35), transparent 70%)"}}/>
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center">
                  <CheckCircle2 className="text-amber-300" size={30}/>
                </div>
                <div>
                  <div data-testid="doc-verify-status-badge" className="text-xs tracking-widest font-mono text-amber-400">DOCUMENT OFFICIEL HOMOLOGUÉ</div>
                  <h1 className="font-serif text-3xl text-amber-100">{isBulletin ? "Bulletin Scolaire" : "Reçu Médical"}</h1>
                </div>
              </div>

              <div className="mt-6 grid md:grid-cols-2 gap-4">
                <Info label="École" value={doc.school_name}/>
                <Info label="Type" value={isBulletin ? "BULLETIN" : "REÇU MÉDICAL"}/>
                <Info label="Élève" value={doc.data.student_name}/>
                <Info label="Classe" value={doc.data.class_name || "—"}/>
                {isBulletin ? (
                  <>
                    <Info label="Trimestre" value={doc.data.term}/>
                    <Info label="Année" value={doc.data.year}/>
                    <Info label="Moyenne" value={doc.data.average ? `${doc.data.average} / 20` : "—"}/>
                  </>
                ) : (
                  <>
                    <Info label="Motif" value={doc.data.reason}/>
                    <Info label="Médecin" value={doc.data.medic_name}/>
                    <Info label="Verdict" value={doc.data.clearance}/>
                  </>
                )}
                <Info label="Émis le" value={new Date(doc.issued_at).toLocaleString("fr-FR")}/>
                <Info label="ID Document" value={doc.id} mono/>
              </div>

              <div className="mt-8 flex items-center gap-2 text-amber-300 border-t border-amber-500/20 pt-4">
                <ShieldCheck size={18}/>
                <span className="font-serif italic text-lg">Ce document est authentique et enregistré sur EduGest Destock.</span>
              </div>
              <div className="mt-2 text-xs text-emerald-100/50">Icon: <Icon size={12} className="inline"/> — Vérification cryptographique par ID unique. Aucune modification n'est possible après émission.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, mono }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-amber-400/80 font-mono">{label}</div>
      <div className={`text-emerald-100 mt-1 ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</div>
    </div>
  );
}
