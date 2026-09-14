import { db } from './db';
import { jsPDF } from 'jspdf';
import { registerDocument, qrDataUrlForDocument, documentVerifyUrl } from './document-verify';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GeneratedBulletin {
  pdfBuffer: Buffer;
  filename: string;
  verifyUrl: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    classId: string;
    photoUrl?: string | null;
    schoolId: string;
    parentId: string | null;
    class: { name: string } | null;
  };
  school: {
    name: string;
    shortName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    province: string;
    country: string;
    logo?: string | null;
  };
  className: string;
  trimester: string;
  average: number;
  decision: string | null;
}

/** Erreur métier du bulletin avec code HTTP associé. */
export class BulletinError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sanitisation ASCII (design gianelli) : rendu identique de tous les accents
 * quel que soit l'environnement jsPDF (É→E, è→e, —→-, etc.).
 */
function sanitizeAscii(text: string): string {
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

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
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

function getTrimesterLabel(trimester: string): string {
  const map: Record<string, string> = {
    T1: '1er Trimestre',
    T2: '2ème Trimestre',
    T3: '3ème Trimestre',
  };
  return map[trimester] || trimester;
}

function getDecisionLabel(decision: string | null): { label: string; color: [number, number, number] } {
  switch (decision) {
    case 'PASSED':
      return { label: 'ADMIS', color: [0, 135, 90] };
    case 'REPEAT':
      return { label: 'REDOUBLE', color: [186, 26, 26] };
    default:
      return { label: 'EN ATTENTE', color: [200, 160, 40] };
  }
}

function getMention(average: number): string {
  if (average >= 16) return 'Mention Bien';
  if (average >= 14) return 'Mention Assez Bien';
  if (average >= 12) return 'Mention Passable';
  if (average >= 10) return 'Admis';
  return 'Non Admis';
}

// ─── PDF Builder — design « Institut Gianelli » (navy & or) ──────────────────
// Palette et structure reprises du générateur jsPDF d'institut-gianelli-web :
// double bordure décorative, logo encadré d'or, QR code unique, lignes
// pointillées, encadré vert pour la moyenne, cachets et vérification.

const NAVY = [2, 36, 72] as [number, number, number];
const GOLD = [212, 175, 55] as [number, number, number];
const GREEN = [0, 135, 90] as [number, number, number];
const LGREEN = [232, 245, 233] as [number, number, number];
const MINT = [200, 230, 201] as [number, number, number];
const GRAY = [120, 120, 120] as [number, number, number];
const LGRAY = [200, 200, 200] as [number, number, number];
const DGRAY = [60, 60, 60] as [number, number, number];

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

function setDraw(doc: jsPDF, c: [number, number, number]) { doc.setDrawColor(c[0], c[1], c[2]); }
function setFill(doc: jsPDF, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]); }
function setText(doc: jsPDF, c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]); }

export function buildBulletinPDF(
  student: { id: string; firstName: string; lastName: string; matricule: string; photoUrl?: string | null },
  school: { name: string; shortName: string; email: string; phone: string; address: string; city: string; province: string; country: string; logo?: string | null },
  className: string,
  trimester: string,
  grades: { subjectName: string; score: number; coefficient: number }[],
  average: number,
  decision: string | null,
  schoolYearLabel: string,
  schoolLogoBase64: string | null,
  studentPhotoBase64: string | null,
  qrCodeDataUrl: string | null,
  verifyUrl: string
): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210;
  const H = 297;
  const mx = 15;
  const cw = W - mx * 2;

  const setD = (d: jsPDF, c: [number, number, number]) => d.setDrawColor(c[0], c[1], c[2]);
  const setF = (d: jsPDF, c: [number, number, number]) => d.setFillColor(c[0], c[1], c[2]);
  const setT = (d: jsPDF, c: [number, number, number]) => d.setTextColor(c[0], c[1], c[2]);

  // ══════════════════════════════════════════════════════════════════
  //  DOUBLE BORDURE DÉCORATIVE (gianelli)
  // ══════════════════════════════════════════════════════════════════
  setD(doc, NAVY);
  doc.setLineWidth(1.5);
  doc.rect(5, 5, W - 10, H - 10);

  setD(doc, GOLD);
  doc.setLineWidth(0.3);
  doc.rect(8, 8, W - 16, H - 16);

  // ══════════════════════════════════════════════════════════════════
  //  EN-TÊTE : logo école encadré d'or + nom de l'école + QR unique
  // ══════════════════════════════════════════════════════════════════
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

  // Nom de l'école en or
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  setT(doc, GOLD);
  doc.text(sanitizeAscii(school.name).toUpperCase().slice(0, 34), mx + 30, y + 9);

  // Sous-titre : année scolaire + adresse
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setT(doc, GRAY);
  doc.text(`Annee Scolaire ${schoolYearLabel}`, mx + 30, y + 15);
  const addressParts = sanitizeAscii([school.address, school.city, school.province].filter(Boolean).join(', '));
  if (addressParts) {
    doc.text(addressParts.slice(0, 60), mx + 30, y + 20);
  }

  // ── QR CODE UNIQUE (coin supérieur droit) ──
  if (qrCodeDataUrl) {
    try {
      doc.addImage(qrCodeDataUrl, 'PNG', W - mx - 26, y - 2, 24, 24);
    } catch { /* QR ignoré si échec d'encodage */ }
  }

  // ══════════════════════════════════════════════════════════════════
  //  LIGNE DÉCORATIVE OR
  // ══════════════════════════════════════════════════════════════════
  y = y + 30;
  setD(doc, GOLD);
  doc.setLineWidth(1);
  doc.line(mx, y, W - mx, y);
  doc.setLineWidth(0.3);
  doc.line(mx, y + 2, W - mx, y + 2);

  // ══════════════════════════════════════════════════════════════════
  //  TITRE
  // ══════════════════════════════════════════════════════════════════
  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setT(doc, NAVY);
  centerText(doc, 'BULLETIN SCOLAIRE', y, W);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setT(doc, GRAY);
  centerText(doc, sanitizeAscii(`${getTrimesterLabel(trimester)} - ${schoolYearLabel}`), y + 6, W);

  // ══════════════════════════════════════════════════════════════════
  //  INFORMATIONS ÉLÈVE
  // ══════════════════════════════════════════════════════════════════
  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setT(doc, GOLD);
  doc.text('INFORMATIONS ELEVE', mx + 2, y);
  y += 3;

  if (studentPhotoBase64) {
    try {
      doc.addImage(studentPhotoBase64, 'JPEG', W - mx - 16, y + 1, 15, 15);
    } catch { /* photo ignorée */ }
  }

  const infoFields: [string, string][] = [
    ['ELEVE', sanitizeAscii(`${student.lastName.toUpperCase()} ${student.firstName}`)],
    ['MATRICULE', sanitizeAscii(student.matricule)],
    ['CLASSE', sanitizeAscii(className)],
    ['DATE', sanitizeAscii(formatDate(new Date()))],
  ];

  for (const [label, value] of infoFields) {
    y += 7;
    setD(doc, LGRAY);
    doc.setLineWidth(0.2);
    drawDottedLine(doc, mx + 2, y - 2, W - mx - 2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setT(doc, GRAY);
    doc.text(label, mx + 4, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setT(doc, NAVY);
    rightText(doc, value.slice(0, 46), y, W - mx - 4);
  }

  // ══════════════════════════════════════════════════════════════════
  //  NOTES PAR MATIÈRE
  // ══════════════════════════════════════════════════════════════════
  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setT(doc, GOLD);
  doc.text('NOTES PAR MATIERE', mx + 2, y);
  y += 3;

  const colSubject = mx + 4;
  const colCoeff = W - mx - 38;
  const colScore = W - mx - 14;

  for (const g of grades.slice(0, 24)) {
    y += 7;
    setD(doc, LGRAY);
    doc.setLineWidth(0.2);
    drawDottedLine(doc, mx + 2, y - 2, W - mx - 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setT(doc, DGRAY);
    doc.text(sanitizeAscii(g.subjectName).slice(0, 42), colSubject, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setT(doc, GRAY);
    doc.text(`coeff. ${g.coefficient}`, colCoeff, y);

    const scoreColor: [number, number, number] = g.score >= 10 ? GREEN : [186, 26, 26];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setT(doc, scoreColor);
    rightText(doc, `${g.score.toFixed(1)}/20`, y, colScore + 10);
  }

  // ══════════════════════════════════════════════════════════════════
  //  ENCADRÉ MOYENNE GÉNÉRALE (vert menthe, style gianelli)
  // ══════════════════════════════════════════════════════════════════
  y += 13;
  const boxH = 30;
  const boxX = mx + 2;
  const boxW = cw - 4;

  setF(doc, LGREEN);
  setD(doc, MINT);
  doc.setLineWidth(0.8);
  doc.rect(boxX, y, boxW, boxH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setT(doc, GREEN);
  centerText(doc, 'MOYENNE GENERALE', y + 7, W);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  setT(doc, GREEN);
  centerText(doc, `${average.toFixed(2)}/20`, y + 18, W);

  // Badge décision
  const decisionInfo = getDecisionLabel(decision);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const bW = doc.getTextWidth(decisionInfo.label) + 10;
  const bX = W / 2 - bW / 2;
  const bY = y + 22;

  setF(doc, [255, 255, 255]);
  setD(doc, decisionInfo.color);
  doc.setLineWidth(0.4);
  doc.rect(bX, bY, bW, 6, 'FD');
  setT(doc, decisionInfo.color);
  const dTw = doc.getTextWidth(decisionInfo.label);
  doc.text(decisionInfo.label, W / 2 - dTw / 2, bY + 4.2);

  y += boxH + 4;

  // Mention
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  setT(doc, [140, 120, 40]);
  centerText(doc, sanitizeAscii(getMention(average)), y + 2, W);

  // ══════════════════════════════════════════════════════════════════
  //  SIGNATURE & CACHET
  // ══════════════════════════════════════════════════════════════════
  y = Math.min(Math.max(y + 10, 200), 218);

  setD(doc, GOLD);
  doc.setLineWidth(0.5);
  doc.line(mx, y, W - mx, y);

  y += 12;
  const leftBoxX = mx + 4;
  const rightBoxX = W / 2 + 5;
  const sigBoxW = W / 2 - mx - 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setT(doc, GRAY);
  doc.text('Signature Direction', leftBoxX, y);
  setD(doc, LGRAY);
  doc.setLineWidth(0.3);
  doc.line(leftBoxX, y + 10, leftBoxX + sigBoxW - 5, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setT(doc, GRAY);
  doc.text('Cachet de l\'ecole', rightBoxX, y);
  setD(doc, LGRAY);
  doc.setLineWidth(0.3);
  doc.line(rightBoxX, y + 10, rightBoxX + sigBoxW - 5, y + 10);

  // ══════════════════════════════════════════════════════════════════
  //  AVIS DE VÉRIFICATION (QR code)
  // ══════════════════════════════════════════════════════════════════
  if (qrCodeDataUrl) {
    const verifyY = Math.max(y + 12, H - 50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setT(doc, GRAY);
    centerText(doc, 'VERIFICATION', verifyY, W);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setT(doc, LGRAY);
    centerText(doc, 'Pour verifier l\'authenticite de ce bulletin, scannez le QR code', verifyY + 4, W);
  }

  // ══════════════════════════════════════════════════════════════════
  //  PIED DE PAGE : école + EduGest
  // ══════════════════════════════════════════════════════════════════
  const footerY = H - 25;

  setD(doc, GOLD);
  doc.setLineWidth(0.8);
  doc.line(mx, footerY, W - mx, footerY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setT(doc, NAVY);
  centerText(doc, sanitizeAscii(school.name).slice(0, 48), footerY + 5, W);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setT(doc, GRAY);
  centerText(doc, 'Genere par EduGest - La plateforme de gestion scolaire', footerY + 9, W);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  setT(doc, LGRAY);
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const genDate = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  centerText(doc, `Document genere le ${genDate}`, footerY + 13, W);

  // ID de vérification machine-lisible (fond blanc, discret)
  doc.setFontSize(4);
  setT(doc, [255, 255, 255]);
  centerText(doc, `EDUGEST-DOC:${verifyUrl}`, H - 4, W);

  return Buffer.from(doc.output('arraybuffer'));
}

// ─── Génération complète d'un bulletin (données + PDF) ─────────────────────

/**
 * Rassemble toutes les données du bulletin (élève, école, notes, décision),
 * enregistre le document officiel (QR unique) et construit le PDF.
 * Partagé entre le téléchargement et l'envoi WhatsApp.
 */
export async function generateBulletinPDF(
  studentId: string,
  trimester: string,
  schoolId: string
): Promise<GeneratedBulletin> {
  // Fetch student
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      matricule: true,
      classId: true,
      photoUrl: true,
      schoolId: true,
      parentId: true,
      class: { select: { name: true } },
    },
  });

  if (!student) {
    throw new BulletinError('Élève non trouvé', 404);
  }

  // SECURITY: the student must belong to the requested school, otherwise a
  // user of school A could generate bulletins for students of school B.
  if (student.schoolId !== schoolId) {
    throw new BulletinError('Accès non autorisé', 403);
  }

  // Fetch school
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: {
      name: true,
      shortName: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      province: true,
      country: true,
      logo: true,
    },
  });

  if (!school) {
    throw new BulletinError('École non trouvée', 404);
  }

  // Fetch active school year
  const schoolYear = await db.schoolYear.findFirst({
    where: { schoolId, isActive: true },
    select: { id: true, label: true },
  });

  if (!schoolYear) {
    throw new BulletinError('Année scolaire active non trouvée', 404);
  }

  // Fetch grades for this student, trimester, and school year
  const grades = await db.grade.findMany({
    where: {
      studentId,
      trimester,
      schoolYearId: schoolYear.id,
    },
    include: {
      subject: { select: { name: true, coefficient: true } },
    },
  });

  if (grades.length === 0) {
    throw new BulletinError('Aucune note trouvée pour ce trimestre', 404);
  }

  // Calculate weighted average
  let totalWeightedScore = 0;
  let totalCoefficients = 0;
  const gradeData = grades.map((g) => {
    const coeff = g.subject?.coefficient || 1;
    totalWeightedScore += g.score * coeff;
    totalCoefficients += coeff;
    return {
      subjectName: g.subject?.name || '—',
      score: g.score,
      coefficient: coeff,
    };
  });

  const average = totalCoefficients > 0 ? totalWeightedScore / totalCoefficients : 0;

  // Try to fetch decision from ReportCard
  let decision: string | null = null;
  try {
    const reportCard = await db.reportCard.findFirst({
      where: {
        studentId,
        trimester,
        schoolYearId: schoolYear.id,
      },
      select: { decision: true },
    });
    decision = reportCard?.decision || null;
  } catch {
    // ReportCard model may not have data yet
  }

  // Fetch school logo as base64
  let schoolLogoBase64: string | null = null;
  if (school.logo) {
    try {
      const logoUrl = school.logo.startsWith('http') ? school.logo : `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${school.logo}`;
      const logoRes = await fetch(logoUrl);
      if (logoRes.ok) {
        const buf = Buffer.from(await logoRes.arrayBuffer());
        schoolLogoBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;
      }
    } catch {}
  }

  // Fetch student photo as base64
  let studentPhotoBase64: string | null = null;
  if (student.photoUrl) {
    try {
      const photoUrl = student.photoUrl.startsWith('http') ? student.photoUrl : `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${student.photoUrl}`;
      const photoRes = await fetch(photoUrl);
      if (photoRes.ok) {
        const buf = Buffer.from(await photoRes.arrayBuffer());
        studentPhotoBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;
      }
    } catch {}
  }

  const className = student.class?.name || '—';

  // ── Enregistrement du document officiel + QR code unique ──────────
  const docRecord = await registerDocument({
    type: 'BULLETIN',
    schoolId,
    studentId,
    trimester,
    schoolYearId: schoolYear.id,
    metadata: {
      className,
      average: Number(average.toFixed(2)),
      decision,
      mention: getMention(average),
      matricule: student.matricule,
      studentName: `${student.firstName} ${student.lastName}`,
      subjectsCount: gradeData.length,
      schoolYear: schoolYear.label,
    },
  });
  const qrCodeDataUrl = await qrDataUrlForDocument(docRecord.id);

  const pdfBuffer = buildBulletinPDF(
    student,
    school,
    className,
    trimester,
    gradeData,
    average,
    decision,
    schoolYear.label || schoolYear.id,
    schoolLogoBase64,
    studentPhotoBase64,
    qrCodeDataUrl,
    docRecord.url
  );

  const filename = `bulletin-${student.lastName}-${student.firstName}-${trimester}.pdf`;

  return {
    pdfBuffer,
    filename,
    verifyUrl: documentVerifyUrl(docRecord.id),
    student,
    school,
    className,
    trimester,
    average,
    decision,
  };
}
