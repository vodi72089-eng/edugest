import { db } from '@/lib/db';
import { requirePermission, verifySchoolAccess, verifyParentAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';

// ─── Design tokens EduGest (style « institut-gianelli » adapté aux couleurs EduGest) ──

type RGB = readonly [number, number, number];

const EDUGEST = {
  DARK: [19, 21, 29] as const,        // EduGest DARK — textes principaux, bordure extérieure
  GOLD: [217, 164, 65] as const,      // EduGest GOLD — titres de sections, lignes décoratives
  TEAL: [11, 140, 127] as const,      // EduGest ACCENT — titres de sections de données
  GREEN: [5, 150, 105] as const,      // Vert succès
  GREEN_LIGHT: [232, 245, 233] as const,
  MINT: [200, 230, 201] as const,
  GRAY: [120, 120, 120] as const,
  GRAY_LIGHT: [200, 200, 200] as const,
  RED: [220, 38, 38] as const,
  WHITE: [255, 255, 255] as const,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

// Helvetica (police standard jsPDF) ne possède pas d'accents : tout le texte
// affiché dans le PDF est nettoyé en ASCII pur (é→e, ç→c, —→-, etc.)
const ASCII_MAP: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y', ç: 'c', ñ: 'n',
  À: 'A', Á: 'A', Â: 'A', Ä: 'A', Ã: 'A', Å: 'A',
  È: 'E', É: 'E', Ê: 'E', Ë: 'E',
  Ì: 'I', Í: 'I', Î: 'I', Ï: 'I',
  Ò: 'O', Ó: 'O', Ô: 'O', Ö: 'O', Õ: 'O',
  Ù: 'U', Ú: 'U', Û: 'U', Ü: 'U',
  Ý: 'Y', Ç: 'C', Ñ: 'N',
  œ: 'oe', Œ: 'OE', æ: 'ae', Æ: 'AE',
  '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '«': '"', '»': '"',
  '\u00A0': ' ', '\u202F': ' ', '\u2009': ' ',
  '\u00B7': '\u00B7', // point médian : conservé (présent dans WinAnsi)
  '€': 'EUR',
};

function sanitizeAscii(input: string): string {
  if (!input) return '';
  let out = '';
  for (const ch of input) {
    const mapped = ASCII_MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
    } else if (ch.charCodeAt(0) <= 127) {
      out += ch;
    }
    // Caractère non-ASCII non mappé : supprimé silencieusement
  }
  return out;
}

// Formatage nombres FR : espaces milliers + virgule décimale (sans Intl, ASCII pur)
function fmtNum(value: number): string {
  if (!isFinite(value)) return '0';
  const fixed = (Math.round(value * 100) / 100).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return decPart && decPart !== '00' ? `${grouped},${decPart}` : grouped;
}

function fmtNumInt(value: number): string {
  if (!isFinite(value)) return '0';
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

// « JJ/MM/AAAA HH:MM » (chiffres uniquement, ASCII pur)
function formatDateTime(date: Date): string {
  const d = new Date(date);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
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

function getStatusInfo(status: string): { bg: string; text: string; label: string; desc: string } {
  switch (status.toUpperCase()) {
    case 'PAID':
      return { bg: '#dcfce7', text: '#166534', label: 'PAYÉ', desc: 'Le paiement a été intégralement réglé.' };
    case 'CONFIRMED':
      return { bg: '#dcfce7', text: '#166534', label: 'CONFIRMÉ', desc: 'Le paiement a été confirmé.' };
    case 'REJECTED':
      return { bg: '#fee2e2', text: '#991b1b', label: 'REJETÉ', desc: 'Le paiement a été rejeté.' };
    case 'PARTIAL':
      return { bg: '#fef9c3', text: '#854d0e', label: 'PARTIEL', desc: 'Le paiement est partiellement réglé. Un solde reste dû.' };
    case 'PENDING':
      return { bg: '#fee2e2', text: '#991b1b', label: 'EN ATTENTE', desc: 'Le paiement est en attente de règlement.' };
    case 'OVERDUE':
      return { bg: '#fecaca', text: '#7f1d1d', label: 'EN RETARD', desc: 'Le paiement est en retard. Veuillez régler dès que possible.' };
    case 'CANCELLED':
      return { bg: '#f3f4f6', text: '#374151', label: 'ANNULÉ', desc: 'Ce paiement a été annulé.' };
    default:
      return { bg: '#e5e7eb', text: '#374151', label: status.toUpperCase(), desc: '' };
  }
}

function getPaymentMethodLabel(method: string | null): string {
  if (!method) return '—';
  const map: Record<string, string> = {
    CASH: 'Espèces',
    MOBILE_MONEY: 'Mobile Money',
    ORANGE_MONEY: 'Orange Money',
    MPESA: 'M-Pesa',
    AIRTEL_MONEY: 'Airtel Money',
    BANK_TRANSFER: 'Virement bancaire',
    CARD: 'Carte bancaire',
    CHECK: 'Chèque',
    OTHER: 'Autre',
  };
  return map[method.toUpperCase()] || method;
}

function getTrimesterLabel(trimester: string): string {
  const map: Record<string, string> = {
    T1: '1er Trimestre',
    T2: '2ème Trimestre',
    T3: '3ème Trimestre',
  };
  return map[trimester] || trimester;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
}

// ─── Primitives de dessin (style gianelli : positionnement 100% manuel) ─────

function setFill(doc: jsPDF, c: RGB) {
  doc.setFillColor(c[0], c[1], c[2]);
}

function setDraw(doc: jsPDF, c: RGB) {
  doc.setDrawColor(c[0], c[1], c[2]);
}

function setInk(doc: jsPDF, c: RGB) {
  doc.setTextColor(c[0], c[1], c[2]);
}

function drawText(doc: jsPDF, str: string, x: number, y: number) {
  doc.text(sanitizeAscii(str), x, y);
}

function rightText(doc: jsPDF, str: string, xRight: number, y: number) {
  const s = sanitizeAscii(str);
  doc.text(s, xRight - doc.getTextWidth(s), y);
}

function centerText(doc: jsPDF, str: string, cx: number, y: number) {
  const s = sanitizeAscii(str);
  doc.text(s, cx - doc.getTextWidth(s) / 2, y);
}

// Ligne pointillée : points espacés de 2.5mm (petits rects pleins — pas de circle)
function drawDottedLine(doc: jsPDF, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.floor(length / 2.5));
  setFill(doc, EDUGEST.GRAY_LIGHT);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    doc.rect(x1 + dx * t, y1 + dy * t, 0.5, 0.5, 'F');
  }
}

function drawDottedRect(doc: jsPDF, x: number, y: number, w: number, h: number) {
  drawDottedLine(doc, x, y, x + w, y);
  drawDottedLine(doc, x + w, y, x + w, y + h);
  drawDottedLine(doc, x + w, y + h, x, y + h);
  drawDottedLine(doc, x, y + h, x, y);
}

// Rangée de données : libellé gras gris à gauche, valeur foncée à droite,
// ligne pointillée entre les deux
function drawDottedRow(doc: jsPDF, x: number, y: number, width: number, label: string, value: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setInk(doc, EDUGEST.GRAY);
  drawText(doc, label, x, y);
  const labelWidth = doc.getTextWidth(sanitizeAscii(label));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setInk(doc, EDUGEST.DARK);
  rightText(doc, value, x + width, y);
  const valueWidth = doc.getTextWidth(sanitizeAscii(value));

  const dotStart = x + labelWidth + 2.5;
  const dotEnd = x + width - valueWidth - 2.5;
  if (dotEnd > dotStart) {
    drawDottedLine(doc, dotStart, y - 1.2, dotEnd, y - 1.2);
  }
}

// Titre de section doré majuscule + filet doré fin
function drawSectionTitle(doc: jsPDF, x: number, y: number, width: number, title: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  setInk(doc, EDUGEST.GOLD);
  drawText(doc, title, x, y);
  setDraw(doc, EDUGEST.GOLD);
  doc.setLineWidth(0.2);
  doc.line(x, y + 2.4, x + width, y + 2.4);
}

// Ligne dorée décorative double (1 + 0.3)
function drawDoubleGoldLine(doc: jsPDF, x: number, y: number, width: number) {
  setDraw(doc, EDUGEST.GOLD);
  doc.setLineWidth(1);
  doc.line(x, y, x + width, y);
  doc.setLineWidth(0.3);
  doc.line(x, y + 1.6, x + width, y + 1.6);
}

// ─── PDF Builder (style « institut-gianelli », couleurs EduGest) ────────────

function buildReceiptPDF(
  payment: {
    id: string;
    amount: number;
    paidAmount: number;
    trimester: string;
    paymentMethod: string | null;
    referenceNumber: string | null;
    status: string;
    paidAt: Date | null;
    receiptNumber: string | null;
    verifiedBy: string | null;
    verifiedAt: Date | null;
    verificationNote: string | null;
    createdAt: Date;
  },
  student: { firstName: string; lastName: string; matricule: string; photoUrl?: string | null },
  school: { name: string; shortName: string; email: string; phone: string; address: string; city: string; province: string; country: string; logo: string | null },
  schoolLogoBase64: string | null,
  schoolYearLabel: string | null,
  usdToCdfRate: number | null
): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ── Fond blanc ──────────────────────────────────────────────────────────
  setFill(doc, EDUGEST.WHITE);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // ── Double bordure décorative : extérieure épaisse foncée, intérieure fine dorée ──
  setDraw(doc, EDUGEST.DARK);
  doc.setLineWidth(1.5);
  doc.rect(5, 5, pageWidth - 10, pageHeight - 10, 'S');
  setDraw(doc, EDUGEST.GOLD);
  doc.setLineWidth(0.3);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16, 'S');

  const marginX = 18;
  const contentWidth = pageWidth - marginX * 2;
  const centerX = pageWidth / 2;

  // ── EN-TÊTE : carré logo bordé doré (+ initiales en secours) ────────────
  const logoX = marginX;
  const logoY = 18;
  const logoSize = 20;
  let logoDrawn = false;
  if (schoolLogoBase64) {
    try {
      doc.addImage(schoolLogoBase64, 'JPEG', logoX + 1.2, logoY + 1.2, logoSize - 2.4, logoSize - 2.4);
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }
  if (!logoDrawn) {
    setFill(doc, EDUGEST.DARK);
    doc.rect(logoX, logoY, logoSize, logoSize, 'F');
  }
  setDraw(doc, EDUGEST.GOLD);
  doc.setLineWidth(0.5);
  doc.rect(logoX, logoY, logoSize, logoSize, 'S');
  if (!logoDrawn) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setInk(doc, EDUGEST.GOLD);
    centerText(doc, getSchoolInitials(school.shortName), logoX + logoSize / 2, logoY + logoSize / 2 + 1.5);
  }

  // ── Nom de l'école en doré majuscule ────────────────────────────────────
  let nameSize = 15;
  let nameLines = doc.splitTextToSize(sanitizeAscii(school.name.toUpperCase()), contentWidth - 26) as string[];
  if (nameLines.length > 2) {
    nameSize = 12;
    nameLines = doc.splitTextToSize(sanitizeAscii(school.name.toUpperCase()), contentWidth - 26) as string[];
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(nameSize);
  setInk(doc, EDUGEST.GOLD);
  let nameBottomY = logoY + 8;
  nameLines.forEach((line, i) => {
    const ly = logoY + 8 + i * (nameSize === 15 ? 6.5 : 5.5);
    drawText(doc, line, logoX + 26, ly);
    nameBottomY = ly;
  });

  // ── Sous-titre : République Démocratique du Congo — Année Scolaire ─────
  let yearLabel = schoolYearLabel;
  if (!yearLabel) {
    const refDate = payment.paidAt || payment.createdAt;
    const yy = refDate.getFullYear();
    const mm = refDate.getMonth() + 1;
    yearLabel = mm >= 9 ? `${yy}-${yy + 1}` : `${yy - 1}-${yy}`;
  }
  const subtitleY = nameBottomY + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setInk(doc, EDUGEST.GRAY);
  drawText(doc, `Republique Democratique du Congo - Annee Scolaire ${yearLabel}`, logoX + 26, subtitleY);

  // ── Contacts école (petite ligne grise) ─────────────────────────────────
  const contactParts = [school.email, school.phone].filter(Boolean);
  let headerBottom = Math.max(logoY + logoSize, nameBottomY);
  if (contactParts.length > 0) {
    const contactY = subtitleY + 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setInk(doc, EDUGEST.GRAY);
    drawText(doc, contactParts.join('  ·  '), logoX + 26, contactY);
    headerBottom = Math.max(headerBottom, contactY);
  }

  // ── Ligne dorée décorative double sous l'en-tête ────────────────────────
  const ruleY = headerBottom + 6;
  drawDoubleGoldLine(doc, marginX, ruleY, contentWidth);

  // ── TITRE : RECU N. xxx (foncé, centré) ─────────────────────────────────
  const receiptNo = payment.receiptNumber || `REC-${payment.id.slice(-8).toUpperCase()}`;
  let y = ruleY + 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setInk(doc, EDUGEST.DARK);
  centerText(doc, `RECU N. ${receiptNo}`, centerX, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setInk(doc, EDUGEST.TEAL);
  centerText(doc, 'RECU DE PAIEMENT SCOLAIRE', centerX, y);

  // ── SECTION : INFORMATIONS ELEVE ────────────────────────────────────────
  y += 10;
  drawSectionTitle(doc, marginX, y, contentWidth, 'INFORMATIONS ELEVE');
  y += 8.5;
  drawDottedRow(doc, marginX, y, contentWidth, 'NOM COMPLET', `${student.lastName.toUpperCase()} ${student.firstName}`);
  y += 8.5;
  drawDottedRow(doc, marginX, y, contentWidth, 'MATRICULE', student.matricule || '-');

  // ── SECTION : DETAILS DU PAIEMENT ───────────────────────────────────────
  y += 11.5;
  drawSectionTitle(doc, marginX, y, contentWidth, 'DETAILS DU PAIEMENT');
  y += 8.5;
  drawDottedRow(doc, marginX, y, contentWidth, 'TRIMESTRE', getTrimesterLabel(payment.trimester));
  y += 8.5;
  drawDottedRow(doc, marginX, y, contentWidth, 'MODE DE PAIEMENT', getPaymentMethodLabel(payment.paymentMethod));
  y += 8.5;
  drawDottedRow(doc, marginX, y, contentWidth, 'REFERENCE', payment.referenceNumber || '-');
  y += 8.5;
  drawDottedRow(doc, marginX, y, contentWidth, 'DATE DE PAIEMENT', formatDate(payment.paidAt || payment.createdAt));

  // ── BOÎTE MONTANT (fond vert clair, bordure menthe) ─────────────────────
  y += 7.5;
  const boxHeight = 34;
  setFill(doc, EDUGEST.GREEN_LIGHT);
  doc.rect(marginX, y, contentWidth, boxHeight, 'F');
  setDraw(doc, EDUGEST.MINT);
  doc.setLineWidth(0.3);
  doc.rect(marginX, y, contentWidth, boxHeight, 'S');

  // Label « MONTANT PAYE » petit vert
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setInk(doc, EDUGEST.GREEN);
  drawText(doc, 'MONTANT PAYE', marginX + 6, y + 7.5);

  // Montant en GRAND (26pt) vert
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  setInk(doc, EDUGEST.GREEN);
  const amountStr = fmtNumInt(payment.paidAmount);
  drawText(doc, amountStr, marginX + 6, y + 22);
  const amountWidth = doc.getTextWidth(amountStr);
  doc.setFontSize(11);
  drawText(doc, 'CDF', marginX + 6 + amountWidth + 2, y + 22);

  // Badge statut (fond coloré plein)
  const statusInfo = getStatusInfo(payment.status);
  const statusBg = hexToRgb(statusInfo.bg);
  const statusInk = hexToRgb(statusInfo.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const statusLabel = sanitizeAscii(statusInfo.label);
  const badgeWidth = doc.getTextWidth(statusLabel) + 8;
  const badgeHeight = 7;
  const badgeX = marginX + contentWidth - 4 - badgeWidth;
  const badgeY = y + 4;
  doc.setFillColor(statusBg.r, statusBg.g, statusBg.b);
  doc.rect(badgeX, badgeY, badgeWidth, badgeHeight, 'F');
  doc.setTextColor(statusInk.r, statusInk.g, statusInk.b);
  centerText(doc, statusLabel, badgeX + badgeWidth / 2, badgeY + 5);

  // Équivalence devise (si taux disponible)
  if (usdToCdfRate && usdToCdfRate > 0 && isFinite(usdToCdfRate)) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    setInk(doc, EDUGEST.GRAY);
    drawText(
      doc,
      `Equivalent : ${fmtNum(payment.paidAmount / usdToCdfRate)} USD (taux : 1 USD = ${fmtNum(usdToCdfRate)} CDF)`,
      marginX + 6,
      y + 30
    );
  }

  y += boxHeight;

  // Description du statut (petite ligne italique grise)
  if (statusInfo.desc) {
    y += 5.5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    setInk(doc, EDUGEST.GRAY);
    centerText(doc, statusInfo.desc, centerX, y);
  }

  // ── SECTION : SITUATION FINANCIERE (3 colonnes) ─────────────────────────
  y += 10;
  drawSectionTitle(doc, marginX, y, contentWidth, 'SITUATION FINANCIERE');

  const remaining = payment.amount - payment.paidAmount;
  const colWidth = contentWidth / 3;
  const headersY = y + 9;
  const valuesTopLineY = headersY + 3.5;
  const valuesY = valuesTopLineY + 11;
  const valuesBottomLineY = valuesY + 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setInk(doc, EDUGEST.TEAL);
  centerText(doc, 'TOTAL DU', marginX + colWidth * 0.5, headersY);
  centerText(doc, 'TOTAL PAYE', marginX + colWidth * 1.5, headersY);
  centerText(doc, 'RESTANT', marginX + colWidth * 2.5, headersY);

  setDraw(doc, EDUGEST.GRAY_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(marginX + 4, valuesTopLineY, marginX + contentWidth - 4, valuesTopLineY);
  doc.line(marginX + 4, valuesBottomLineY, marginX + contentWidth - 4, valuesBottomLineY);

  const financialCols: Array<{ text: string; color: RGB }> = [
    { text: fmtNumInt(payment.amount), color: EDUGEST.DARK },
    { text: fmtNumInt(payment.paidAmount), color: EDUGEST.GREEN },
    { text: remaining > 0 ? fmtNumInt(remaining) : '0', color: remaining > 0 ? EDUGEST.GOLD : EDUGEST.GREEN },
  ];
  financialCols.forEach((col, i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setInk(doc, col.color);
    const valueStr = sanitizeAscii(col.text);
    const valueWidth = doc.getTextWidth(valueStr);
    doc.setFontSize(8);
    const unitWidth = doc.getTextWidth('CDF');
    const startX = marginX + colWidth * i + colWidth / 2 - (valueWidth + 2 + unitWidth) / 2;
    doc.setFontSize(14);
    drawText(doc, valueStr, startX, valuesY);
    doc.setFontSize(8);
    drawText(doc, 'CDF', startX + valueWidth + 2, valuesY);
  });

  y = valuesBottomLineY;

  // ── SIGNATURE & CACHET ──────────────────────────────────────────────────
  const isCash = !payment.paymentMethod || payment.paymentMethod.toUpperCase() === 'CASH';
  const sigTop = y + 10;
  const sigHeight = 24;

  if (!isCash) {
    // Paiement en ligne : signature électronique + cachet « PAYE EN LIGNE »
    const eSigW = 78;
    const eSigH = sigHeight - 4;
    setDraw(doc, EDUGEST.GRAY_LIGHT);
    doc.setLineWidth(0.3);
    doc.rect(marginX + 4, sigTop, eSigW, eSigH, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setInk(doc, EDUGEST.GREEN);
    centerText(doc, 'SIGNE ELECTRONIQUEMENT', marginX + 4 + eSigW / 2, sigTop + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setInk(doc, EDUGEST.GRAY);
    centerText(doc, `Le ${formatDateTime(payment.paidAt || payment.createdAt)}`, marginX + 4 + eSigW / 2, sigTop + 16);

    const stampW = 62;
    const stampX = marginX + contentWidth - stampW - 4;
    setFill(doc, EDUGEST.GREEN_LIGHT);
    doc.rect(stampX, sigTop, stampW, eSigH, 'F');
    setDraw(doc, EDUGEST.GREEN);
    doc.setLineWidth(0.3);
    doc.rect(stampX, sigTop, stampW, eSigH, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setInk(doc, EDUGEST.GREEN);
    centerText(doc, 'PAYE EN LIGNE', stampX + stampW / 2, sigTop + eSigH / 2 + 1.5);
  } else {
    // Espèces : lignes vierges + cadre pointillé pour le tampon physique
    const sigLineY = sigTop + 14;
    setDraw(doc, EDUGEST.GRAY);
    doc.setLineWidth(0.3);
    doc.line(marginX + 8, sigLineY, marginX + 68, sigLineY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setInk(doc, EDUGEST.GRAY);
    centerText(doc, 'Signature', marginX + 38, sigLineY + 5);

    const stampW = 55;
    const stampH = 20;
    const stampX = marginX + contentWidth - stampW - 8;
    drawDottedRect(doc, stampX, sigTop, stampW, stampH);
    centerText(doc, 'Cachet', stampX + stampW / 2, sigTop + stampH + 5);
  }

  // ── PIED DE PAGE ────────────────────────────────────────────────────────
  const footerLineY = pageHeight - 34;
  setDraw(doc, EDUGEST.GOLD);
  doc.setLineWidth(0.8);
  doc.line(marginX, footerLineY, marginX + contentWidth, footerLineY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setInk(doc, EDUGEST.DARK);
  centerText(doc, school.name, centerX, footerLineY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setInk(doc, EDUGEST.GRAY);
  const placeParts = [school.city, school.country].filter(Boolean);
  if (placeParts.length > 0) {
    centerText(doc, placeParts.join(', '), centerX, footerLineY + 12.5);
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  setInk(doc, EDUGEST.GRAY_LIGHT);
  centerText(doc, `Document genere le ${formatDateTime(new Date())}`, centerX, footerLineY + 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  setInk(doc, EDUGEST.GRAY_LIGHT);
  centerText(doc, 'Genere par EduGest', centerX, footerLineY + 22.5);

  // ── ID de paiement en texte machine blanc (vérification d'import) ───────
  doc.setFontSize(4);
  setInk(doc, EDUGEST.WHITE);
  centerText(doc, `EDUGEST-ID:${payment.id}`, centerX, pageHeight - 2.5);

  return Buffer.from(doc.output('arraybuffer'));
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'payments:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    // Fetch the payment record
    const payment = await db.paymentRecord.findUnique({
      where: { id },
      include: {
        school: {
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
        },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
    }

    // Verify school access
    if (!verifySchoolAccess(user, payment.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    // Fetch the student
    const student = await db.student.findUnique({
      where: { id: payment.studentId },
      select: { firstName: true, lastName: true, matricule: true, photoUrl: true },
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // For PARENT, verify parent-child relationship with the student
    if (user.role === 'PARENT') {
      const hasAccess = await verifyParentAccess(user, payment.studentId);
      if (!hasAccess) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
    }

    // Fetch school logo as base64 (if exists)
    let schoolLogoBase64: string | null = null;
    if (payment.school.logo) {
      try {
        const logoUrl = payment.school.logo.startsWith('http')
          ? payment.school.logo
          : `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${payment.school.logo}`;
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const logoBuffer = Buffer.from(await logoRes.arrayBuffer());
          const mimeType = logoUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';
          schoolLogoBase64 = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
        }
      } catch {}
    }

    // Année scolaire active (affichée dans le sous-titre de l'en-tête)
    let schoolYearLabel: string | null = null;
    try {
      const activeYear = await db.schoolYear.findFirst({
        where: { schoolId: payment.schoolId, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { label: true },
      });
      schoolYearLabel = activeYear?.label ?? null;
    } catch {}

    // Taux USD -> CDF (pour la ligne d'équivalence devise ; omise si indisponible)
    let usdToCdfRate: number | null = null;
    try {
      const currencyConfig = await db.schoolCurrencyConfig.findUnique({
        where: { schoolId: payment.schoolId },
      });
      if (currencyConfig?.useManualRates && currencyConfig.manualRates) {
        const rates = JSON.parse(currencyConfig.manualRates) as Record<string, unknown>;
        const usd = typeof rates.USD === 'number' && rates.USD > 0 ? rates.USD : 1;
        const cdf = typeof rates.CDF === 'number' ? rates.CDF : null;
        if (cdf && cdf > 0) usdToCdfRate = cdf / usd;
      }
      if (!usdToCdfRate) {
        const latestRate = await db.exchangeRate.findFirst({
          where: { base: 'USD', target: 'CDF' },
          orderBy: { fetchedAt: 'desc' },
        });
        if (latestRate?.rate && latestRate.rate > 0) usdToCdfRate = latestRate.rate;
      }
    } catch {}

    // Build PDF
    const pdfBuffer = buildReceiptPDF(payment, student, payment.school, schoolLogoBase64, schoolYearLabel, usdToCdfRate);

    const receiptNo = payment.receiptNumber || `REC-${payment.id.slice(-8).toUpperCase()}`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="recu-${receiptNo}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Error generating payment receipt PDF:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
