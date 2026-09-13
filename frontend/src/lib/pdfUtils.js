import jsPDF from "jspdf";
import QRCode from "qrcode";

const GOLD = "#D4AF37";
const EMERALD = "#0B2E23";
const EMERALD_DARK = "#061F17";
const TEXT_MUTED = "#5B7166";

async function drawHeader(doc, title, schoolName) {
  const w = doc.internal.pageSize.getWidth();
  // Dark top band
  doc.setFillColor(6, 31, 23);
  doc.rect(0, 0, w, 34, "F");
  // Gold double line
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.8);
  doc.line(10, 36, w - 10, 36);
  doc.setLineWidth(0.3);
  doc.line(10, 38, w - 10, 38);
  // School name
  doc.setTextColor(GOLD);
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.text(schoolName || "École", w / 2, 15, { align: "center" });
  doc.setFont("times", "italic");
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 200);
  doc.text("EduGest Destock — Document Officiel", w / 2, 22, { align: "center" });
  // Title
  doc.setFont("times", "bold");
  doc.setFontSize(20);
  doc.setTextColor(GOLD);
  doc.text(title, w / 2, 30, { align: "center" });
}

async function drawQR(doc, verifyUrl, x, y, size = 32) {
  try {
    const dataUrl = await QRCode.toDataURL(verifyUrl, {
      errorCorrectionLevel: "M",
      color: { dark: "#061F17", light: "#FFFFFF" },
      margin: 1,
      width: 256,
    });
    doc.addImage(dataUrl, "PNG", x, y, size, size);
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text("Document Officiel Vérifié", x + size / 2, y + size + 3, { align: "center" });
    doc.text("Scannez pour Authentifier", x + size / 2, y + size + 6.5, { align: "center" });
  } catch (e) {
    console.error("QR error", e);
  }
}

export async function generateBulletinPDF({ docId, verifyUrl, schoolName, studentName, className, term, year, grades, average, rank, appreciation, matricule }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  await drawHeader(doc, "BULLETIN SCOLAIRE", schoolName);

  // Student info block
  let y = 50;
  doc.setDrawColor(GOLD);
  doc.setFillColor(245, 240, 220);
  doc.roundedRect(10, y, w - 20, 26, 2, 2, "FD");
  doc.setTextColor(EMERALD_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Élève : ${studentName}`, 14, y + 8);
  doc.setFont("helvetica", "normal");
  doc.text(`Classe : ${className}`, 14, y + 15);
  doc.text(`Matricule : ${matricule || "—"}`, 14, y + 22);
  doc.text(`Trimestre : ${term}`, w - 60, y + 8);
  doc.text(`Année : ${year}`, w - 60, y + 15);
  doc.text(`Rang : ${rank || "—"}`, w - 60, y + 22);

  // Grades table
  y += 34;
  doc.setFillColor(11, 46, 35);
  doc.rect(10, y, w - 20, 8, "F");
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("MATIÈRE", 14, y + 5.5);
  doc.text("COEF.", 90, y + 5.5);
  doc.text("NOTE /20", 115, y + 5.5);
  doc.text("MOYENNE CL.", 145, y + 5.5);
  doc.text("APPRÉCIATION", 175, y + 5.5);

  y += 8;
  doc.setTextColor(EMERALD_DARK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  (grades || []).forEach((g, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(250, 246, 235);
      doc.rect(10, y, w - 20, 7, "F");
    }
    doc.text(String(g.subject || ""), 14, y + 5);
    doc.text(String(g.coefficient ?? 1), 90, y + 5);
    doc.text(String(g.grade ?? "-"), 115, y + 5);
    doc.text(String(g.class_avg ?? "-"), 145, y + 5);
    doc.text(String(g.appreciation ?? ""), 175, y + 5, { maxWidth: 25 });
    y += 7;
  });

  // Average box
  y += 6;
  doc.setFillColor(6, 31, 23);
  doc.roundedRect(10, y, 90, 16, 2, 2, "F");
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Moyenne Générale : ${Number(average).toFixed(2)} / 20`, 14, y + 10);

  // Appreciation
  if (appreciation) {
    doc.setTextColor(EMERALD_DARK);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text(`Appréciation générale : ${appreciation}`, 14, y + 24, { maxWidth: w - 60 });
  }

  // QR code bottom-right
  await drawQR(doc, verifyUrl, w - 50, y + 4, 32);

  // Footer
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(GOLD);
  doc.line(10, ph - 18, w - 10, ph - 18);
  doc.setFontSize(7);
  doc.setTextColor(TEXT_MUTED);
  doc.text(`ID Document : ${docId}`, 14, ph - 12);
  doc.text(`Vérification : ${verifyUrl}`, 14, ph - 8);
  doc.text("EduGest Destock — Plateforme Scolaire", w - 14, ph - 8, { align: "right" });

  doc.save(`bulletin-${studentName.replace(/\s+/g, "_")}-${term}.pdf`);
}

export async function generateMedicalReceiptPDF({ docId, verifyUrl, schoolName, studentName, className, reason, treatment, medic_name, clearance, amount, currency }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  await drawHeader(doc, "REÇU DU SERVICE MÉDICAL", schoolName);

  // Medical cross
  doc.setFillColor(200, 90, 50);
  doc.rect(w / 2 - 15, 42, 4, 12, "F");
  doc.rect(w / 2 - 21, 46, 16, 4, "F");

  let y = 60;
  doc.setDrawColor(GOLD);
  doc.setFillColor(250, 246, 235);
  doc.roundedRect(10, y, w - 20, 60, 2, 2, "FD");
  doc.setTextColor(EMERALD_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Date : ${new Date().toLocaleDateString("fr-FR")}`, 14, y + 8);
  doc.text(`Élève : ${studentName}`, 14, y + 16);
  doc.text(`Classe : ${className || "—"}`, 14, y + 24);
  doc.text(`Médecin / Infirmier : ${medic_name}`, 14, y + 32);
  doc.setFont("helvetica", "normal");
  doc.text(`Motif : ${reason}`, 14, y + 40, { maxWidth: w - 30 });
  doc.text(`Traitement : ${treatment}`, 14, y + 48, { maxWidth: w - 30 });

  const clearColor = clearance === "APTE" ? "#0B7A45" : clearance === "REPOS" ? "#B7791F" : "#B02A2A";
  doc.setDrawColor(GOLD);
  doc.setFillColor(6, 31, 23);
  y += 68;
  doc.roundedRect(10, y, 90, 16, 2, 2, "F");
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Verdict médical : ${clearance}`, 14, y + 10);

  if (amount && Number(amount) > 0) {
    doc.setTextColor(EMERALD_DARK);
    doc.setFontSize(10);
    doc.text(`Montant : ${Number(amount).toFixed(2)} ${currency || "FCFA"}`, 110, y + 10);
  }

  // QR
  await drawQR(doc, verifyUrl, w - 50, y + 4, 32);

  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(GOLD);
  doc.line(10, ph - 18, w - 10, ph - 18);
  doc.setFontSize(7);
  doc.setTextColor(TEXT_MUTED);
  doc.text(`ID Document : ${docId}`, 14, ph - 12);
  doc.text(`Vérification : ${verifyUrl}`, 14, ph - 8);
  doc.text("EduGest Destock — Service Médical", w - 14, ph - 8, { align: "right" });

  doc.save(`recu-medical-${studentName.replace(/\s+/g, "_")}.pdf`);
}
