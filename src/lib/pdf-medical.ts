import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

/**
 * PDF médical — design « Institut Gianelli » (navy & or), identique aux reçus
 * et bulletins : double bordure décorative, logo école encadré d'or, logo
 * EduGest en haut à droite, lignes pointillées, sections or, QR de
 * vérification en bas et marqueur caché pour l'import dans « Vérification ».
 *
 * Types supportés :
 *  - DISPENSE_MEDICALE : dispense d'activités (EPS, sport...)
 *  - FICHE_SANTE       : fiche de santé individuelle de l'élève
 *  - REGISTRE_SANTE    : registre des passages à l'infirmerie
 */

const NAVY: [number, number, number] = [2, 36, 72];
const GOLD: [number, number, number] = [212, 175, 55];
const GREEN: [number, number, number] = [0, 135, 90];
const LGREEN: [number, number, number] = [232, 245, 233];
const MINT: [number, number, number] = [200, 230, 201];
const GRAY: [number, number, number] = [120, 120, 120];
const LGRAY: [number, number, number] = [200, 200, 200];
const RED: [number, number, number] = [186, 26, 26];

/** Sanitisation ASCII (design gianelli) — rendu identique de tous les accents. */
export function sanitizeAscii(text: string): string {
  return String(text || '')
    .replace(/[\u00C0-\u00C5]/g, 'A')
    .replace(/[\u00C6]/g, 'AE')
    .replace(/[\u00C7]/g, 'C')
    .replace(/[\u00C8-\u00CB]/g, 'E')
    .replace(/[\u00CC-\u00CF]/g, 'I')
    .replace(/[\u00D0]/g, 'D')
    .replace(/[\u00D1]/g, 'N')
    .replace(/[\u00D2-\u00D6\u00D8]/g, 'O')
    .replace(/[\u00D9-\u00DC]/g, 'U')
    .replace(/[\u00DD]/g, 'Y')
    .replace(/[\u00DF]/g, 'ss')
    .replace(/[\u00E0-\u00E5]/g, 'a')
    .replace(/[\u00E6]/g, 'ae')
    .replace(/[\u00E7]/g, 'c')
    .replace(/[\u00E8-\u00EB]/g, 'e')
    .replace(/[\u00EC-\u00EF]/g, 'i')
    .replace(/[\u00F0]/g, 'd')
    .replace(/[\u00F1]/g, 'n')
    .replace(/[\u00F2-\u00F6\u00F8]/g, 'o')
    .replace(/[\u00F9-\u00FC]/g, 'u')
    .replace(/[\u00FD\u00FF]/g, 'y')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E]/g, '');
}

function fmtDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
      .format(new Date(date));
  } catch { return '—'; }
}

function fmtDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      .format(new Date(date));
  } catch { return '—'; }
}

export function getMedicalDocTitle(type: string): string {
  switch (type) {
    case 'DISPENSE_MEDICALE': return 'DISPENSE MEDICALE';
    case 'FICHE_SANTE': return 'FICHE DE SANTE';
    case 'REGISTRE_SANTE': return 'REGISTRE DE SANTE';
    default: return 'DOCUMENT MEDICAL';
  }
}

export function getMedicalDocCodePrefix(type: string): 'DIS' | 'FSA' | 'REG' {
  switch (type) {
    case 'DISPENSE_MEDICALE': return 'DIS';
    case 'FICHE_SANTE': return 'FSA';
    case 'REGISTRE_SANTE': return 'REG';
    default: return 'REG';
  }
}

export function getDecisionLabel(decision: string | null | undefined): string {
  switch (decision) {
    case 'RETURN_TO_CLASS': return 'Retour en classe';
    case 'RESTING': return 'Repos a l\'infirmerie';
    case 'SENT_HOME': return 'Envoye a domicile';
    case 'EMERGENCY_EVACUATION': return 'Evacuation d\'urgence';
    default: return sanitizeAscii(decision || '—');
  }
}

interface MedicalStudentInfo {
  firstName: string;
  lastName: string;
  matricule: string;
  class?: { name: string } | null;
}

export interface MedicalPdfContent {
  // Dispense
  dispensationType?: string;
  startDate?: string | null;
  endDate?: string | null;
  reason?: string;
  doctorName?: string;
  certificateUrl?: string;
  recommendations?: string;
  // Fiche de santé
  bloodGroup?: string;
  allergies?: string;
  chronicConditions?: string;
  regularMedication?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  doctorPhone?: string;
  notes?: string;
  lastVisits?: { visitDate: string; reason: string; decision: string; temperature?: number | null }[];
  activeDispensations?: { type: string; startDate: string; endDate: string; reason: string }[];
  // Registre
  periodFrom?: string | null;
  periodTo?: string | null;
  className?: string;
  visits?: {
    visitDate: string;
    studentName: string;
    className?: string;
    reason: string;
    decision: string;
    temperature?: number | null;
    parentNotified?: boolean;
  }[];
}

function centerText(doc: jsPDF, text: string, y: number, pageWidth: number) {
  const tw = doc.getTextWidth(text);
  doc.text(text, (pageWidth - tw) / 2, y);
}

function rightText(doc: jsPDF, text: string, y: number, rightX: number) {
  const tw = doc.getTextWidth(text);
  doc.text(text, rightX - tw, y);
}

function drawDottedLine(doc: jsPDF, x1: number, y: number, x2: number) {
  const step = 2.5;
  const len = x2 - x1;
  const count = Math.floor(len / step);
  for (let i = 0; i < count; i += 2) {
    const sx = x1 + i * step;
    const ex = Math.min(sx + step * 0.6, x2);
    doc.line(sx, y, ex, y);
  }
}

function sectionHeader(doc: jsPDF, title: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.text(title, x + 2, y);
}

function infoRow(doc: jsPDF, label: string, value: string, x: number, y: number, rightX: number) {
  doc.setDrawColor(LGRAY[0], LGRAY[1], LGRAY[2]);
  doc.setLineWidth(0.2);
  drawDottedLine(doc, x + 2, y - 2, rightX);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text(label, x + 4, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  rightText(doc, value.slice(0, 52), y, rightX - 4);
}

function wrappedValue(doc: jsPDF, label: string, value: string, x: number, y: number, rightX: number): number {
  const maxWidth = rightX - x - 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(value, maxWidth) as string[];
  if (lines.length <= 1) {
    infoRow(doc, label, value, x, y, rightX);
    return y + 7;
  }
  doc.setDrawColor(LGRAY[0], LGRAY[1], LGRAY[2]);
  doc.setLineWidth(0.2);
  drawDottedLine(doc, x + 2, y - 2, rightX);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  doc.text(label, x + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  let vy = y;
  for (const line of lines.slice(0, 4)) {
    vy += 5.5;
    doc.text(line, x + 14, vy);
  }
  return vy + 6;
}

function getSchoolInitials(shortName: string): string {
  return shortName
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

const DISPENSATION_TYPE_LABELS: Record<string, string> = {
  EPS: 'EPS (Education Physique)',
  SPORT: 'Activite Sportive',
  AUTRE: 'Autre activite',
};

export function buildMedicalDocumentPDF(
  docData: { docCode: string; type: string; title: string; content: MedicalPdfContent; createdAt: Date },
  student: MedicalStudentInfo | null,
  school: { name: string; shortName: string; email: string; phone: string; address: string; city: string; province: string; country: string; logo: string | null },
  schoolLogoBase64: string | null,
  qrCodeDataUrl: string | null
): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210;
  const H = 297;
  const mx = 15;
  const cw = W - mx * 2;

  const setD = (d: jsPDF, c: [number, number, number]) => d.setDrawColor(c[0], c[1], c[2]);
  const setF = (d: jsPDF, c: [number, number, number]) => d.setFillColor(c[0], c[1], c[2]);
  const setT = (d: jsPDF, c: [number, number, number]) => d.setTextColor(c[0], c[1], c[2]);

  // ═══ DOUBLE BORDURE DÉCORATIVE (gianelli) ═══
  setD(doc, NAVY);
  doc.setLineWidth(1.5);
  doc.rect(5, 5, W - 10, H - 10);

  setD(doc, GOLD);
  doc.setLineWidth(0.3);
  doc.rect(8, 8, W - 16, H - 16);

  // ═══ EN-TÊTE : logo école encadré d'or + logo EduGest haut droit ═══
  let y = 20;

  const logoX = mx + 2;
  const logoY = y;
  const logoSize = 22;

  setD(doc, GOLD);
  setF(doc, [255, 255, 255]);
  doc.setLineWidth(1.5);
  doc.rect(logoX, logoY, logoSize, logoSize, 'FD');

  let logoDrawn = false;
  if (schoolLogoBase64) {
    try {
      doc.addImage(schoolLogoBase64, 'JPEG', logoX + 1.5, logoY + 1.5, logoSize - 3, logoSize - 3);
      logoDrawn = true;
    } catch { logoDrawn = false; }
  }
  if (!logoDrawn) {
    const initials = getSchoolInitials(school.shortName);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setT(doc, NAVY);
    const tw = doc.getTextWidth(initials);
    doc.text(initials, logoX + (logoSize - tw) / 2, logoY + logoSize / 2 + 2);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  setT(doc, GOLD);
  doc.text(sanitizeAscii(school.name).toUpperCase().slice(0, 30), mx + 30, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setT(doc, GRAY);
  const addressParts = sanitizeAscii([school.address, school.city, school.province].filter(Boolean).join(', '));
  if (addressParts) doc.text(addressParts.slice(0, 58), mx + 30, y + 15);
  const contactParts = sanitizeAscii([school.phone, school.email].filter(Boolean).join('  |  '));
  if (contactParts) doc.text(contactParts.slice(0, 58), mx + 30, y + 20);

  // ── LOGO EDUGEST (haut droit) ──
  try {
    let edugestLogo: string | null = null;
    for (const p of [path.join(process.cwd(), 'public', 'edugest-logo-pdf.jpg'), path.join(process.cwd(), 'public', 'edugest-logo.png')]) {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        edugestLogo = `data:image/${p.endsWith('.png') ? 'png' : 'jpeg'};base64,${buf.toString('base64')}`;
        break;
      }
    }
    if (edugestLogo) {
      doc.addImage(edugestLogo, edugestLogo.startsWith('data:image/png') ? 'PNG' : 'JPEG', W - mx - 26, y - 2, 24, 24);
    }
  } catch { /* logo ignoré */ }

  // ═══ LIGNE DÉCORATIVE OR ═══
  y = y + 30;
  setD(doc, GOLD);
  doc.setLineWidth(1);
  doc.line(mx, y, W - mx, y);
  doc.setLineWidth(0.3);
  doc.line(mx, y + 2, W - mx, y + 2);

  // ═══ TITRE ═══
  y += 11;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setT(doc, NAVY);
  centerText(doc, getMedicalDocTitle(docData.type), y, W);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setT(doc, GRAY);
  centerText(doc, `N. ${docData.docCode}`, y + 6, W);
  centerText(doc, `Date : ${fmtDate(docData.createdAt)}`, y + 11, W);

  const C = docData.content || {};

  // ═══ CORPS SELON LE TYPE ═══
  if (docData.type === 'REGISTRE_SANTE') {
    // ── REGISTRE : période + tableau des visites ──
    y += 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setT(doc, GOLD);
    doc.text('PERIODE ET PERIMETRE', mx + 2, y);
    y += 7;
    infoRow(doc, 'DU', sanitizeAscii(fmtDate(C.periodFrom || null)), mx, y, W - mx);
    y += 7;
    infoRow(doc, 'AU', sanitizeAscii(fmtDate(C.periodTo || null)), mx, y, W - mx);
    y += 7;
    infoRow(doc, 'CLASSES', sanitizeAscii(C.className || 'Toutes les classes'), mx, y, W - mx);

    y += 12;
    sectionHeader(doc, `PASSAGES A L'INFIRMERIE (${(C.visits || []).length})`, mx, y);
    y += 4;

    // Tableau
    const colX = [mx + 2, mx + 26, mx + 84, mx + 116, mx + 150];
    const colW = [24, 58, 32, 34, 34];
    const headers = ['DATE', 'ELEVE', 'CLASSE', 'MOTIF', 'DECISION'];
    setF(doc, NAVY);
    doc.rect(mx + 1, y, cw - 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setT(doc, [255, 255, 255]);
    headers.forEach((h, i) => doc.text(h, colX[i] + 1, y + 5));
    y += 7;

    const visits = (C.visits || []).slice(0, 18);
    if (visits.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      setT(doc, GRAY);
      centerText(doc, 'Aucun passage enregistre sur cette periode', y + 6, W);
      y += 12;
    }
    for (let i = 0; i < visits.length; i++) {
      const v = visits[i];
      if (i % 2 === 0) {
        setF(doc, LGREEN);
        doc.rect(mx + 1, y, cw - 2, 8, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      setT(doc, NAVY);
      doc.text(sanitizeAscii(fmtDateTime(v.visitDate).replace(':', 'h').slice(0, 16)), colX[0] + 1, y + 5.5);
      doc.text(sanitizeAscii(v.studentName).slice(0, 26), colX[1] + 1, y + 5.5);
      doc.text(sanitizeAscii(v.className || '—').slice(0, 14), colX[2] + 1, y + 5.5);
      doc.text(sanitizeAscii(v.reason).slice(0, 16), colX[3] + 1, y + 5.5);
      doc.text(sanitizeAscii(getDecisionLabel(v.decision)).slice(0, 16), colX[4] + 1, y + 5.5);
      y += 8;
    }

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setT(doc, GRAY);
    doc.text(`Temperature et notification parent : renseignees dans le service medical. Total : ${(C.visits || []).length} passage(s).`, mx + 2, y);
  } else if (docData.type === 'FICHE_SANTE') {
    // ── FICHE DE SANTÉ ──
    y += 17;
    sectionHeader(doc, 'INFORMATIONS ELEVE', mx, y);
    y += 3;
    const infoFields: [string, string][] = [
      ['ELEVE', student ? sanitizeAscii(`${student.lastName.toUpperCase()} ${student.firstName}`) : '—'],
      ['MATRICULE', sanitizeAscii(student?.matricule || '—')],
      ['CLASSE', sanitizeAscii(student?.class?.name || '—')],
    ];
    for (const [label, value] of infoFields) {
      y += 7;
      infoRow(doc, label, value, mx, y, W - mx);
    }

    y += 12;
    sectionHeader(doc, 'DONNEES MEDICALES', mx, y);
    y += 3;
    const medFields: [string, string][] = [
      ['GROUPE SANGUIN', sanitizeAscii(C.bloodGroup || 'Non renseigne')],
      ['ALLERGIES', sanitizeAscii(C.allergies || 'Aucune connue')],
      ['MALADIES CHRONIQUES', sanitizeAscii(C.chronicConditions || 'Aucune connue')],
      ['MEDICAMENTS REGULIERS', sanitizeAscii(C.regularMedication || 'Aucun')],
    ];
    for (const [label, value] of medFields) {
      y += 8;
      y = wrappedValue(doc, label, value, mx, y, W - mx);
    }

    y += 6;
    sectionHeader(doc, 'CONTACTS D\'URGENCE', mx, y);
    y += 3;
    const contactFields: [string, string][] = [
      ['CONTACT', sanitizeAscii(C.emergencyContactName || '—')],
      ['TELEPHONE', sanitizeAscii(C.emergencyContactPhone || '—')],
      ['MEDECIN TRAITANT', sanitizeAscii(C.doctorName || '—')],
      ['TEL MEDECIN', sanitizeAscii(C.doctorPhone || '—')],
    ];
    for (const [label, value] of contactFields) {
      y += 7;
      infoRow(doc, label, value, mx, y, W - mx);
    }

    // Dernières visites
    const lastVisits = (C.lastVisits || []).slice(0, 4);
    if (lastVisits.length > 0) {
      y += 12;
      sectionHeader(doc, 'DERNIERS PASSAGES A L\'INFIRMERIE', mx, y);
      y += 4;
      setF(doc, NAVY);
      doc.rect(mx + 1, y, cw - 2, 6.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setT(doc, [255, 255, 255]);
      doc.text('DATE', mx + 3, y + 4.5);
      doc.text('MOTIF', mx + 40, y + 4.5);
      doc.text('DECISION', mx + 105, y + 4.5);
      doc.text('TEMP.', mx + 155, y + 4.5);
      y += 6.5;
      for (let i = 0; i < lastVisits.length; i++) {
        const v = lastVisits[i];
        if (i % 2 === 0) {
          setF(doc, LGREEN);
          doc.rect(mx + 1, y, cw - 2, 7.5, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        setT(doc, NAVY);
        doc.text(sanitizeAscii(fmtDate(v.visitDate)).slice(0, 18), mx + 3, y + 5);
        doc.text(sanitizeAscii(v.reason).slice(0, 32), mx + 40, y + 5);
        doc.text(sanitizeAscii(getDecisionLabel(v.decision)).slice(0, 24), mx + 105, y + 5);
        doc.text(v.temperature != null ? `${v.temperature} C` : '—', mx + 155, y + 5);
        y += 7.5;
      }
    }

    // Observations
    if (C.notes) {
      y += 12;
      sectionHeader(doc, 'OBSERVATIONS', mx, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      setT(doc, NAVY);
      const lines = doc.splitTextToSize(sanitizeAscii(C.notes), cw - 8) as string[];
      for (const line of lines.slice(0, 6)) {
        doc.text(line, mx + 4, y);
        y += 5;
      }
    }
  } else {
    // ── DISPENSE MÉDICALE ──
    y += 17;
    sectionHeader(doc, 'INFORMATIONS ELEVE', mx, y);
    y += 3;
    const infoFields: [string, string][] = [
      ['ELEVE', student ? sanitizeAscii(`${student.lastName.toUpperCase()} ${student.firstName}`) : '—'],
      ['MATRICULE', sanitizeAscii(student?.matricule || '—')],
      ['CLASSE', sanitizeAscii(student?.class?.name || '—')],
    ];
    for (const [label, value] of infoFields) {
      y += 7;
      infoRow(doc, label, value, mx, y, W - mx);
    }

    y += 12;
    sectionHeader(doc, 'DETAILS DE LA DISPENSE', mx, y);
    y += 3;
    const dispFields: [string, string][] = [
      ['ACTIVITE CONCERNEE', sanitizeAscii(DISPENSATION_TYPE_LABELS[C.dispensationType || 'EPS'] || C.dispensationType || '—')],
      ['DU', sanitizeAscii(fmtDate(C.startDate || null))],
      ['AU', sanitizeAscii(fmtDate(C.endDate || null))],
      ['MEDECIN', sanitizeAscii(C.doctorName || '—')],
      ['CERTIFICAT MEDICAL', sanitizeAscii(C.certificateUrl ? 'Fourni' : 'Non fourni')],
    ];
    for (const [label, value] of dispFields) {
      y += 7;
      infoRow(doc, label, value, mx, y, W - mx);
    }

    y += 9;
    sectionHeader(doc, 'MOTIF', mx, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setT(doc, NAVY);
    const motifLines = doc.splitTextToSize(sanitizeAscii(C.reason || '—'), cw - 8) as string[];
    for (const line of motifLines.slice(0, 4)) {
      doc.text(line, mx + 4, y);
      y += 5.5;
    }

    if (C.recommendations) {
      y += 6;
      sectionHeader(doc, 'RECOMMANDATIONS', mx, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      setT(doc, NAVY);
      const recoLines = doc.splitTextToSize(sanitizeAscii(C.recommendations), cw - 8) as string[];
      for (const line of recoLines.slice(0, 4)) {
        doc.text(line, mx + 4, y);
        y += 5;
      }
    }

    // Encadré vert « dispense valide »
    y += 10;
    setF(doc, LGREEN);
    setD(doc, GREEN);
    doc.setLineWidth(0.5);
    doc.roundedRect(mx + 20, y, cw - 40, 12, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setT(doc, GREEN);
    centerText(doc, 'DISPENSE ENREGISTREE AU SERVICE MEDICAL', y + 7.5, W);
  }

  // ═══ SIGNATURES (dispense + fiche) ═══
  if (docData.type !== 'REGISTRE_SANTE') {
    y = Math.max(y + 16, 232);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setT(doc, GRAY);
    doc.text('Signature Service Medical', mx + 8, y);
    rightText(doc, 'Cachet de l\'ecole', W - mx - 8, y);
    y += 18;
    setD(doc, LGRAY);
    doc.setLineWidth(0.3);
    doc.line(mx + 8, y, mx + 68, y);
    doc.line(W - mx - 68, y, W - mx - 8, y);
  }

  // ═══ QR DE VÉRIFICATION (centré, au-dessus du pied de page) ═══
  try {
    if (qrCodeDataUrl) {
      const qrSize = 24;
      const qrX = W / 2 - qrSize / 2;
      const qrY = H - 54;
      doc.addImage(qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setT(doc, GRAY);
      doc.text('VERIFICATION', W / 2, qrY + qrSize + 3.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(docData.docCode, W / 2, qrY + qrSize + 7, { align: 'center' });
    }
  } catch { /* QR ignoré */ }

  // ═══ PIED DE PAGE ═══
  setD(doc, GOLD);
  doc.setLineWidth(0.5);
  doc.line(mx, H - 22, W - mx, H - 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setT(doc, GRAY);
  centerText(doc, sanitizeAscii(`${school.name} - Genere par EduGest - La plateforme de gestion scolaire`), H - 17, W);
  centerText(doc, fmtDateTime(new Date()), H - 13, W);

  // Marqueur caché pour l'import dans « Vérification » (blanc 4pt)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(4);
  doc.text(`EDUGEST-ID:${docData.docCode}`, mx, H - 4);

  return Buffer.from(doc.output('arraybuffer'));
}
