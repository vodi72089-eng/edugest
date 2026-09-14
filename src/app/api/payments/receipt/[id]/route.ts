import { db } from '@/lib/db';
import { requirePermission, verifySchoolAccess, verifyParentAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import { registerDocument, qrDataUrlForDocument, documentVerifyUrl } from '@/lib/document-verify';
import fs from 'fs';
import path from 'path';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sanitisation ASCII (design gianelli) : la police Helvetica de jsPDF ne
 * rend pas correctement les accents dans certains environnements — on
 * remplace É→E, è→e, —→-, etc. pour un rendu identique partout.
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

/** Format « 34 649 » (groupes français, ASCII pur — compatible jsPDF). */
function fmtNumInt(n: number): string {
  if (n <= 0) return '0';
  const intPart = Math.round(n).toString();
  const reversed = intPart.split('').reverse().join('');
  const grouped = reversed.replace(/(.{3})(?=.)/g, '$1 ');
  return grouped.split('').reverse().join('');
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

function getStatusInfo(status: string): { label: string; bg: [number, number, number]; fg: [number, number, number] } {
  switch (status.toUpperCase()) {
    case 'PAID':
      return { label: 'PAYE', bg: [0, 135, 90], fg: [255, 255, 255] };
    case 'PARTIAL':
      return { label: 'PARTIEL', bg: [200, 160, 40], fg: [255, 255, 255] };
    case 'PENDING':
      return { label: 'EN ATTENTE', bg: [186, 26, 26], fg: [255, 255, 255] };
    case 'OVERDUE':
      return { label: 'EN RETARD', bg: [127, 29, 29], fg: [255, 255, 255] };
    case 'CANCELLED':
      return { label: 'ANNULE', bg: [120, 120, 120], fg: [255, 255, 255] };
    default:
      return { label: status.toUpperCase(), bg: [120, 120, 120], fg: [255, 255, 255] };
  }
}

function getPaymentMethodLabel(method: string | null): string {
  if (!method) return '—';
  const map: Record<string, string> = {
    CASH: 'Especes',
    MOBILE_MONEY: 'Mobile Money',
    ORANGE_MONEY: 'Orange Money',
    MPESA: 'M-Pesa',
    AIRTEL_MONEY: 'Airtel Money',
    BANK_TRANSFER: 'Virement bancaire',
    CARD: 'Carte bancaire',
    CHECK: 'Cheque',
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

/** Logo EduGest embarqué (version compacte pour PDF, lu depuis /public). */
function getEduGestLogoBase64(): string | null {
  try {
    const candidates = [
      path.join(process.cwd(), 'public', 'edugest-logo-pdf.jpg'),
      path.join(process.cwd(), 'public', 'edugest-logo.png'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        const isPng = p.endsWith('.png');
        return `data:image/${isPng ? 'png' : 'jpeg'};base64,${buf.toString('base64')}`;
      }
    }
  } catch { /* logo absent */ }
  return null;
}

// ─── PDF Builder — design « Institut Gianelli » (navy & or) ──────────────────
// Double bordure décorative, logo école encadré d'or + logo EduGest en haut à
// droite, lignes pointillées, encadré vert du montant, cachets, et QR code de
// vérification en bas du reçu.

const NAVY: [number, number, number] = [2, 36, 72];
const GOLD: [number, number, number] = [212, 175, 55];
const GREEN: [number, number, number] = [0, 135, 90];
const LGREEN: [number, number, number] = [232, 245, 233];
const MINT: [number, number, number] = [200, 230, 201];
const GRAY: [number, number, number] = [120, 120, 120];
const LGRAY: [number, number, number] = [200, 200, 200];
const RED: [number, number, number] = [186, 26, 26];

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
  //  EN-TÊTE : logo école encadré d'or + logo EduGest en haut à droite
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
  doc.text(sanitizeAscii(school.name).toUpperCase().slice(0, 30), mx + 30, y + 9);

  // Sous-titre
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setT(doc, GRAY);
  const addressParts = sanitizeAscii([school.address, school.city, school.province].filter(Boolean).join(', '));
  if (addressParts) doc.text(addressParts.slice(0, 58), mx + 30, y + 15);
  const contactParts = sanitizeAscii([school.phone, school.email].filter(Boolean).join('  |  '));
  if (contactParts) doc.text(contactParts.slice(0, 58), mx + 30, y + 20);

  // ── LOGO EDUGEST (haut droit) ──
  const edugestLogo = getEduGestLogoBase64();
  try {
    if (edugestLogo) {
      const edugestFormat = edugestLogo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(edugestLogo, edugestFormat, W - mx - 26, y - 2, 24, 24);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      setT(doc, GOLD);
      doc.text('EduGest', W - mx - 4, y + 8, { align: 'right' });
    }
  } catch { /* logo ignoré */ }

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
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setT(doc, NAVY);
  const receiptNo = payment.receiptNumber || `REC-${payment.id.slice(-8).toUpperCase()}`;
  centerText(doc, `RECU N. ${receiptNo}`, y, W);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setT(doc, GRAY);
  centerText(doc, `Date : ${formatDate(payment.paidAt || payment.createdAt)}`, y + 6, W);

  // ══════════════════════════════════════════════════════════════════
  //  INFORMATIONS ÉLÈVE
  // ══════════════════════════════════════════════════════════════════
  y += 15;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setT(doc, GOLD);
  doc.text('INFORMATIONS ELEVE', mx + 2, y);
  y += 3;

  const infoFields: [string, string][] = [
    ['ELEVE', sanitizeAscii(`${student.lastName.toUpperCase()} ${student.firstName}`).slice(0, 46)],
    ['MATRICULE', sanitizeAscii(student.matricule)],
    ['TRIMESTRE', sanitizeAscii(getTrimesterLabel(payment.trimester))],
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
    rightText(doc, value, y, W - mx - 4);
  }

  // ══════════════════════════════════════════════════════════════════
  //  DÉTAILS DU PAIEMENT
  // ══════════════════════════════════════════════════════════════════
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setT(doc, GOLD);
  doc.text('DETAILS DU PAIEMENT', mx + 2, y);
  y += 3;

  const payFields: [string, string][] = [
    ['MODE DE PAIEMENT', sanitizeAscii(getPaymentMethodLabel(payment.paymentMethod))],
    ['REFERENCE', sanitizeAscii(payment.referenceNumber || '-')],
    ['VERIFIE PAR', sanitizeAscii(payment.verifiedBy || 'Non verifie')],
  ];

  for (const [label, value] of payFields) {
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
    rightText(doc, value.slice(0, 40), y, W - mx - 4);
  }

  // ══════════════════════════════════════════════════════════════════
  //  ENCADRÉ MONTANT PAYÉ (vert menthe, style gianelli)
  // ══════════════════════════════════════════════════════════════════
  y += 10;
  const boxH = 28;
  const boxX = mx + 2;
  const boxW = cw - 4;

  setF(doc, LGREEN);
  setD(doc, MINT);
  doc.setLineWidth(0.8);
  doc.rect(boxX, y, boxW, boxH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setT(doc, GREEN);
  centerText(doc, 'MONTANT PAYE', y + 7, W);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  setT(doc, GREEN);
  centerText(doc, `${fmtNumInt(payment.paidAmount)} CDF`, y + 17, W);

  // Badge statut
  const statusInfo = getStatusInfo(payment.status);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const bW = doc.getTextWidth(statusInfo.label) + 10;
  const bX = W / 2 - bW / 2;
  const bY = y + 21;

  setF(doc, statusInfo.bg);
  setD(doc, statusInfo.bg);
  doc.setLineWidth(0.5);
  doc.rect(bX, bY, bW, 6, 'FD');
  setT(doc, statusInfo.fg);
  const sTw = doc.getTextWidth(statusInfo.label);
  doc.text(statusInfo.label, W / 2 - sTw / 2, bY + 4.2);

  y += boxH + 4;

  // ══════════════════════════════════════════════════════════════════
  //  SITUATION FINANCIÈRE (3 colonnes)
  // ══════════════════════════════════════════════════════════════════
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setT(doc, GOLD);
  doc.text('SITUATION FINANCIERE', mx + 2, y);

  y += 6;
  const colW = cw / 3;

  setD(doc, NAVY);
  doc.setLineWidth(0.5);
  doc.line(mx, y, W - mx, y);

  y += 6;

  const remaining = payment.amount - payment.paidAmount;
  const summaryData: { label: string; value: string; color: [number, number, number] }[] = [
    { label: 'TOTAL DU', value: `${fmtNumInt(payment.amount)} CDF`, color: NAVY },
    { label: 'TOTAL PAYE', value: `${fmtNumInt(payment.paidAmount)} CDF`, color: GREEN },
    { label: 'RESTANT', value: `${fmtNumInt(Math.max(remaining, 0))} CDF`, color: remaining > 0 ? GOLD : GREEN },
  ];

  for (let i = 0; i < 3; i++) {
    const colCenter = mx + colW * i + colW / 2;
    const item = summaryData[i];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setT(doc, GRAY);
    const lTw = doc.getTextWidth(item.label);
    doc.text(item.label, colCenter - lTw / 2, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setT(doc, item.color);
    const vTw = doc.getTextWidth(item.value);
    doc.text(item.value, colCenter - vTw / 2, y + 8);
  }

  y += 10;
  setD(doc, NAVY);
  doc.setLineWidth(0.5);
  doc.line(mx, y, W - mx, y);

  // ══════════════════════════════════════════════════════════════════
  //  SIGNATURE & CACHET
  // ══════════════════════════════════════════════════════════════════
  y = Math.min(Math.max(y + 10, 190), 206);

  setD(doc, GOLD);
  doc.setLineWidth(0.5);
  doc.line(mx, y, W - mx, y);

  y += 6;
  const methodLabel = getPaymentMethodLabel(payment.paymentMethod);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setT(doc, GRAY);
  doc.text(`MODE : ${methodLabel}`, mx + 4, y);

  y += 9;
  const leftBoxX = mx + 4;
  const rightBoxX = W / 2 + 5;
  const sigBoxW = W / 2 - mx - 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setT(doc, GRAY);
  doc.text('Signature Caissier', leftBoxX, y);
  setD(doc, LGRAY);
  doc.setLineWidth(0.3);
  doc.line(leftBoxX, y + 8, leftBoxX + sigBoxW - 5, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setT(doc, GRAY);
  doc.text('Cachet de l\'ecole', rightBoxX, y);
  setD(doc, LGRAY);
  doc.setLineWidth(0.3);
  doc.line(rightBoxX, y + 8, rightBoxX + sigBoxW - 5, y + 8);

  // ══════════════════════════════════════════════════════════════════
  //  QR CODE DE VÉRIFICATION (EN BAS DU REÇU) + notice
  // ══════════════════════════════════════════════════════════════════
  if (qrCodeDataUrl) {
    const qrY = H - 60;
    try {
      doc.addImage(qrCodeDataUrl, 'PNG', W / 2 - 10, qrY, 20, 20);
    } catch { /* QR ignoré */ }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setT(doc, GRAY);
    centerText(doc, 'VERIFICATION', qrY + 23, W);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setT(doc, LGRAY);
    centerText(doc, 'Pour verifier l\'authenticite de ce recu, scannez le QR code', qrY + 27, W);
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

  // ID de vérification machine-lisible
  doc.setFontSize(4);
  setT(doc, [255, 255, 255]);
  centerText(doc, `EDUGEST-RECU:${payment.id}`, H - 4, W);

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

    // ── Enregistrement du document officiel + QR code unique ─────────
    const docRecord = await registerDocument({
      type: 'RECEIPT',
      schoolId: payment.schoolId,
      studentId: payment.studentId,
      paymentRecordId: payment.id,
      trimester: payment.trimester,
      metadata: {
        receiptNumber: payment.receiptNumber || `REC-${payment.id.slice(-8).toUpperCase()}`,
        amount: payment.amount,
        paidAmount: payment.paidAmount,
        remaining: Math.max(payment.amount - payment.paidAmount, 0),
        status: payment.status,
        method: payment.paymentMethod,
        studentName: `${student.firstName} ${student.lastName}`,
        matricule: student.matricule,
      },
    });
    const qrCodeDataUrl = await qrDataUrlForDocument(docRecord.id);

    // Build PDF (design gianelli : logos école + EduGest, QR en bas)
    const pdfBuffer = buildReceiptPDF(payment, student, payment.school, schoolLogoBase64, qrCodeDataUrl);

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
