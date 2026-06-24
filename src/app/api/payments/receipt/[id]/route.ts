import { db } from '@/lib/db';
import { requirePermission, verifySchoolAccess, verifyParentAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'CDF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
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

function getStatusInfo(status: string): { bg: string; text: string; label: string; desc: string } {
  switch (status.toUpperCase()) {
    case 'PAID':
      return { bg: '#dcfce7', text: '#166534', label: 'PAYÉ', desc: 'Le paiement a été intégralement réglé.' };
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

// ─── PDF Builder using jsPDF ────────────────────────────────────────────────

// Landing page "Luxe Africain" design tokens
const LUXE = {
  darkBg: [10, 15, 13] as const,       // #0a0f0d
  darkBgAlt: [11, 22, 19] as const,    // #0b1613
  darkBgDeep: [13, 31, 26] as const,   // #0d1f1a
  gold: [245, 166, 35] as const,       // #f5a623
  goldDark: [184, 134, 11] as const,   // #b8860b
  goldLight: [255, 215, 100] as const, // #ffd764
  ivory: [250, 248, 242] as const,     // #faf8f2
  ivoryWarm: [245, 243, 237] as const, // #f5f3ed
  textWhite: [255, 255, 255] as const,
  textMuted: [160, 155, 140] as const, // muted on dark
  textDark: [30, 28, 25] as const,     // dark text on light
  textGold: [245, 166, 35] as const,
  success: [34, 197, 94] as const,     // #22c55e
  danger: [220, 38, 38] as const,      // #dc2626
  warning: [234, 179, 8] as const,     // #eab308
  border: [200, 195, 185] as const,    // warm border
};

function drawKentePattern(doc: jsPDF, x: number, y: number, width: number, height: number) {
  // Subtle Kente-inspired geometric overlay
  doc.setFillColor(LUXE.darkBg[0], LUXE.darkBg[1], LUXE.darkBg[2]);
  doc.rect(x, y, width, height, 'F');

  // Thin gold accent lines simulating Kente weave
  doc.setDrawColor(LUXE.gold[0], LUXE.gold[1], LUXE.gold[2]);
  doc.setLineWidth(0.15);
  const spacing = 4;
  for (let i = 0; i < width; i += spacing) {
    doc.line(x + i, y, x + i, y + height);
  }
  doc.setDrawColor(LUXE.gold[0], LUXE.gold[1], LUXE.gold[2]);
  doc.setLineWidth(0.1);
  for (let j = 0; j < height; j += spacing) {
    doc.line(x, y + j, x + width, y + j);
  }
}

function drawOrnamentDivider(doc: jsPDF, x: number, y: number, width: number) {
  const centerX = x + width / 2;
  const lineHalf = width / 2 - 10;

  // Left line
  doc.setDrawColor(LUXE.gold[0], LUXE.gold[1], LUXE.gold[2]);
  doc.setLineWidth(0.3);
  doc.line(x, y, centerX - lineHalf, y);

  // Right line
  doc.line(centerX + lineHalf, y, x + width, y);

  // Center diamond
  doc.setFillColor(LUXE.gold[0], LUXE.gold[1], LUXE.gold[2]);
  const diamondSize = 2;
  doc.setLineWidth(0.2);
  doc.line(centerX, y - diamondSize, centerX + diamondSize, y);
  doc.line(centerX + diamondSize, y, centerX, y + diamondSize);
  doc.line(centerX, y + diamondSize, centerX - diamondSize, y);
  doc.line(centerX - diamondSize, y, centerX, y - diamondSize);
}

function drawSectionTitle(doc: jsPDF, x: number, y: number, title: string) {
  // Gold left bar
  doc.setFillColor(LUXE.gold[0], LUXE.gold[1], LUXE.gold[2]);
  doc.rect(x, y, 2.5, 7, 'F');
  // Title text
  doc.setFontSize(11);
  doc.setTextColor(LUXE.darkBg[0], LUXE.darkBg[1], LUXE.darkBg[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(title, x + 7, y + 5.5);
}

function drawFieldRowLuxe(
  doc: jsPDF,
  x: number,
  y: number,
  contentWidth: number,
  label: string,
  value: string
) {
  // Label
  doc.setFontSize(8);
  doc.setTextColor(120, 115, 105);
  doc.setFont('helvetica', 'normal');
  doc.text(label, x, y + 3.5);
  // Value
  doc.setFontSize(9);
  doc.setTextColor(LUXE.textDark[0], LUXE.textDark[1], LUXE.textDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(value, x + contentWidth, y + 3.5, { align: 'right' });
}

function drawDotTexture(doc: jsPDF, x: number, y: number, width: number, height: number) {
  // Ivory dot micro-texture
  doc.setFillColor(LUXE.ivory[0], LUXE.ivory[1], LUXE.ivory[2]);
  doc.rect(x, y, width, height, 'F');
  doc.setFillColor(230, 225, 215);
  for (let dx = 0; dx < width; dx += 3) {
    for (let dy = 0; dy < height; dy += 3) {
      doc.circle(x + dx, y + dy, 0.15, 'F');
    }
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
  studentPhotoBase64: string | null
): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 22;
  const contentWidth = pageWidth - marginX * 2;
  let y = 20;

  // ── White background ─────────────────────────────────────────────────────
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');

  // ── Gold top accent line ────────────────────────────────────────────────
  doc.setFillColor(245, 166, 35);
  doc.rect(0, 0, pageWidth, 2, 'F');

  // ── School logo (if available) ──────────────────────────────────────────
  if (schoolLogoBase64) {
    try {
      doc.addImage(schoolLogoBase64, 'JPEG', marginX, y, 18, 18);
    } catch {
      // Fallback to initials
      doc.setFillColor(245, 166, 35);
      doc.circle(marginX + 9, y + 9, 9, 'F');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text(getSchoolInitials(school.shortName), marginX + 9, y + 12.5, { align: 'center' });
    }
  } else {
    doc.setFillColor(245, 166, 35);
    doc.circle(marginX + 9, y + 9, 9, 'F');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text(getSchoolInitials(school.shortName), marginX + 9, y + 12.5, { align: 'center' });
  }

  // ── School name (large, bold) ───────────────────────────────────────────
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(school.name, marginX + 24, y + 8);

  // ── School address & contact ────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  const addressParts = [school.address, school.city, school.province, school.country].filter(Boolean);
  if (addressParts.length > 0) {
    doc.text(addressParts.join(', '), marginX + 24, y + 14);
  }
  const contactParts = [school.email, school.phone].filter(Boolean);
  if (contactParts.length > 0) {
    doc.text(contactParts.join('  ·  '), marginX + 24, y + 19);
  }

  // ── REÇU label + receipt number (top right) ─────────────────────────────
  const receiptNo = payment.receiptNumber || `REC-${payment.id.slice(-8).toUpperCase()}`;
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.text('REÇU', pageWidth - marginX, y + 5, { align: 'right' });
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(receiptNo, pageWidth - marginX, y + 11, { align: 'right' });
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(payment.paidAt || payment.createdAt), pageWidth - marginX, y + 17, { align: 'right' });

  y += 28;

  // ── Thin divider line ───────────────────────────────────────────────────
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 8;

  // ── Status banner ───────────────────────────────────────────────────────
  const statusInfo = getStatusInfo(payment.status);
  const bgRgb = hexToRgb(statusInfo.bg);
  doc.setFillColor(bgRgb.r, bgRgb.g, bgRgb.b);
  doc.roundedRect(marginX, y, contentWidth, 14, 2, 2, 'F');

  // Status icon
  doc.setFontSize(10);
  doc.setTextColor(180, 83, 9);
  doc.text('!', marginX + 5, y + 6.5);

  // Status text
  doc.setFontSize(9);
  const textRgb = hexToRgb(statusInfo.text);
  doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
  doc.setFont('helvetica', 'bold');
  doc.text(statusInfo.label, marginX + 12, y + 6);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(statusInfo.desc, marginX + 12, y + 11);

  y += 22;

  // ── Student Info Section ────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('NOM COMPLET', marginX, y);
  doc.text('MATRICULE', marginX + contentWidth / 2, y);
  y += 5;
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`${student.lastName.toUpperCase()} ${student.firstName}`, marginX, y);
  doc.text(student.matricule, marginX + contentWidth / 2, y);
  y += 12;

  // ── Payment Details Section ─────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('TRIMESTRE', marginX, y);
  doc.text('MODE DE PAIEMENT', marginX + contentWidth / 2, y);
  y += 5;
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(getTrimesterLabel(payment.trimester), marginX, y);
  doc.text(getPaymentMethodLabel(payment.paymentMethod), marginX + contentWidth / 2, y);
  y += 12;

  // ── Amounts Section ─────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('MONTANT DÛ', marginX, y);
  doc.text('MONTANT PAYÉ', marginX + contentWidth / 2, y);
  y += 5;
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(payment.amount), marginX, y);
  doc.text(formatCurrency(payment.paidAmount), marginX + contentWidth / 2, y);
  y += 12;

  // ── Remaining ───────────────────────────────────────────────────────────
  const remaining = payment.amount - payment.paidAmount;
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('RESTE À PAYER', marginX, y);
  y += 5;
  doc.setFontSize(11);
  if (remaining > 0) {
    doc.setTextColor(220, 38, 38);
  } else {
    doc.setTextColor(22, 163, 74);
  }
  doc.setFont('helvetica', 'bold');
  doc.text(remaining > 0 ? formatCurrency(remaining) : '0 CDF', marginX, y);

  if (payment.referenceNumber) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('RÉFÉRENCE', marginX + contentWidth / 2, y - 7);
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(payment.referenceNumber, marginX + contentWidth / 2, y);
  }

  y += 20;

  // ── Summary box (dark) ──────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(marginX, y, contentWidth, 22, 3, 3, 'F');

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.text('MONTANT TOTAL PAYÉ', marginX + 10, y + 9);

  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  const paidFormatted = new Intl.NumberFormat('fr-FR').format(payment.paidAmount);
  doc.text(paidFormatted, marginX + 10, y + 18);
  doc.setFontSize(10);
  doc.setTextColor(245, 166, 35);
  doc.text('CDF', marginX + 10 + doc.getTextWidth(paidFormatted) + 3, y + 18);

  y += 34;

  // ── Footer ──────────────────────────────────────────────────────────────
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 6;

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.text('Généré par', pageWidth / 2, y, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(245, 166, 35);
  doc.text(' EduGest', pageWidth / 2 + 10, y, { align: 'left' });

  doc.setFontSize(6);
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Document généré automatiquement le ${formatDate(new Date())} — Ce reçu fait foi de paiement.`,
    pageWidth / 2,
    y + 5,
    { align: 'center' }
  );

  return Buffer.from(doc.output('arraybuffer'));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
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

    // Build PDF
    const pdfBuffer = buildReceiptPDF(payment, student, payment.school, schoolLogoBase64, studentPhotoBase64);

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
