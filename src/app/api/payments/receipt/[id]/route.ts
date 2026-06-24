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
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 22;
  const contentWidth = pageWidth - marginX * 2;
  let y = 0;

  // ── Full dark background ──────────────────────────────────────────────────
  doc.setFillColor(LUXE.darkBg[0], LUXE.darkBg[1], LUXE.darkBg[2]);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // ── Header with Kente texture ─────────────────────────────────────────────
  drawKentePattern(doc, 0, 0, pageWidth, 56);

  // School logo (if available)
  if (schoolLogoBase64) {
    try {
      doc.addImage(schoolLogoBase64, 'JPEG', marginX, 10, 20, 20);
    } catch {
      const initials = getSchoolInitials(school.shortName);
      doc.setFillColor(LUXE.gold[0], LUXE.gold[1], LUXE.gold[2]);
      doc.circle(marginX + 14, 22, 14, 'F');
      doc.setFontSize(16);
      doc.setTextColor(LUXE.darkBg[0], LUXE.darkBg[1], LUXE.darkBg[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(initials, marginX + 14, 26, { align: 'center' });
    }
  } else {
    const initials = getSchoolInitials(school.shortName);
    doc.setFillColor(LUXE.gold[0], LUXE.gold[1], LUXE.gold[2]);
    doc.circle(marginX + 14, 22, 14, 'F');
    doc.setFontSize(16);
    doc.setTextColor(LUXE.darkBg[0], LUXE.darkBg[1], LUXE.darkBg[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(initials, marginX + 14, 26, { align: 'center' });
  }

  // School name
  doc.setFontSize(18);
  doc.setTextColor(LUXE.textWhite[0], LUXE.textWhite[1], LUXE.textWhite[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(school.name, marginX + 32, 20, { maxWidth: contentWidth - 32 });

  // School address
  doc.setFontSize(8);
  doc.setTextColor(LUXE.textMuted[0], LUXE.textMuted[1], LUXE.textMuted[2]);
  doc.setFont('helvetica', 'normal');
  const addressParts = [school.address, school.city, school.province, school.country].filter(Boolean);
  if (addressParts.length > 0) {
    doc.text(addressParts.join(', '), marginX + 32, 29, { maxWidth: contentWidth - 32 });
  }
  const contactParts = [school.email, school.phone].filter(Boolean);
  if (contactParts.length > 0) {
    doc.text(contactParts.join('  |  '), marginX + 32, 35, { maxWidth: contentWidth - 32 });
  }

  // "REÇU DE PAIEMENT" title on dark
  doc.setFontSize(22);
  doc.setTextColor(LUXE.gold[0], LUXE.gold[1], LUXE.gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('REÇU DE PAIEMENT', pageWidth / 2, 50, { align: 'center' });

  // ── Ivory content area ─────────────────────────────────────────────────────
  y = 62;
  const contentHeight = pageHeight - y - 32;
  drawDotTexture(doc, marginX - 2, y, contentWidth + 4, contentHeight);

  // Status badge in top-right
  const receiptNo = payment.receiptNumber || `REC-${payment.id.slice(-8).toUpperCase()}`;
  const statusInfo = getStatusInfo(payment.status);
  const bgRgb = hexToRgb(statusInfo.bg);
  const textRgb = hexToRgb(statusInfo.text);
  doc.setFillColor(bgRgb.r, bgRgb.g, bgRgb.b);
  doc.roundedRect(pageWidth - marginX - 38, y + 4, 36, 10, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
  doc.setFont('helvetica', 'bold');
  doc.text(statusInfo.label, pageWidth - marginX - 20, y + 10.5, { align: 'center' });

  // Receipt number & date
  doc.setFontSize(8);
  doc.setTextColor(120, 115, 105);
  doc.setFont('helvetica', 'normal');
  doc.text(`N° ${receiptNo}`, marginX + 2, y + 10);
  doc.text(formatDate(payment.paidAt || payment.createdAt), marginX + 2, y + 16);

  // ── Section: Student Info ──────────────────────────────────────────────────
  y += 26;
  drawSectionTitle(doc, marginX + 2, y, "INFORMATIONS DE L'ÉLÈVE");

  y += 14;
  const photoX = marginX + 2;
  if (studentPhotoBase64) {
    try {
      // Photo with gold border
      doc.setFillColor(LUXE.gold[0], LUXE.gold[1], LUXE.gold[2]);
      doc.roundedRect(photoX - 1, y - 3, 18, 18, 1, 1, 'F');
      doc.addImage(studentPhotoBase64, 'JPEG', photoX, y - 2, 16, 16);
    } catch {}
    drawFieldRowLuxe(doc, photoX + 20, y, contentWidth - 22, 'Nom complet', `${student.lastName.toUpperCase()} ${student.firstName}`);
  } else {
    drawFieldRowLuxe(doc, photoX, y, contentWidth - 4, 'Nom complet', `${student.lastName.toUpperCase()} ${student.firstName}`);
  }
  y += 12;
  drawFieldRowLuxe(doc, photoX, y, contentWidth - 4, 'Matricule', student.matricule);

  // ── Ornament divider ──────────────────────────────────────────────────────
  y += 16;
  drawOrnamentDivider(doc, marginX + 2, y, contentWidth - 4);

  // ── Section: Payment Details ───────────────────────────────────────────────
  y += 10;
  drawSectionTitle(doc, marginX + 2, y, 'DÉTAILS DU PAIEMENT');

  y += 14;
  drawFieldRowLuxe(doc, marginX + 2, y, contentWidth - 4, 'Trimestre', getTrimesterLabel(payment.trimester));
  y += 12;
  drawFieldRowLuxe(doc, marginX + 2, y, contentWidth - 4, 'Montant dû', formatCurrency(payment.amount));
  y += 12;
  drawFieldRowLuxe(doc, marginX + 2, y, contentWidth - 4, 'Montant payé', formatCurrency(payment.paidAmount));
  y += 12;

  const remaining = payment.amount - payment.paidAmount;
  doc.setFontSize(8);
  doc.setTextColor(120, 115, 105);
  doc.setFont('helvetica', 'normal');
  doc.text('Reste à payer', marginX + 2, y + 3.5);
  doc.setFontSize(9);
  if (remaining > 0) {
    doc.setTextColor(LUXE.danger[0], LUXE.danger[1], LUXE.danger[2]);
  } else {
    doc.setTextColor(LUXE.success[0], LUXE.success[1], LUXE.success[2]);
  }
  doc.setFont('helvetica', 'bold');
  doc.text(remaining > 0 ? formatCurrency(remaining) : '0 CDF', pageWidth - marginX - 2, y + 3.5, { align: 'right' });

  y += 12;
  drawFieldRowLuxe(doc, marginX + 2, y, contentWidth - 4, 'Mode de paiement', getPaymentMethodLabel(payment.paymentMethod));
  y += 12;
  drawFieldRowLuxe(doc, marginX + 2, y, contentWidth - 4, 'Référence', payment.referenceNumber || '—');

  // ── Ornament divider ──────────────────────────────────────────────────────
  y += 16;
  drawOrnamentDivider(doc, marginX + 2, y, contentWidth - 4);

  // ── Summary box (dark with gold accent) ────────────────────────────────────
  y += 10;
  // Dark summary card
  doc.setFillColor(LUXE.darkBg[0], LUXE.darkBg[1], LUXE.darkBg[2]);
  doc.roundedRect(marginX + 2, y, contentWidth - 4, 30, 4, 4, 'F');

  // Gold top border
  doc.setFillColor(LUXE.gold[0], LUXE.gold[1], LUXE.gold[2]);
  doc.rect(marginX + 2, y, contentWidth - 4, 1.5, 'F');

  doc.setFontSize(8);
  doc.setTextColor(LUXE.textMuted[0], LUXE.textMuted[1], LUXE.textMuted[2]);
  doc.setFont('helvetica', 'normal');
  doc.text('MONTANT TOTAL PAYÉ', marginX + 12, y + 12);

  doc.setFontSize(22);
  doc.setTextColor(LUXE.gold[0], LUXE.gold[1], LUXE.gold[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(payment.paidAmount), marginX + 12, y + 24);

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = pageHeight - 28;

  // Gold ornament line
  drawOrnamentDivider(doc, marginX, footerY - 4, contentWidth);

  doc.setFontSize(8);
  doc.setTextColor(LUXE.textMuted[0], LUXE.textMuted[1], LUXE.textMuted[2]);
  doc.setFont('helvetica', 'normal');
  doc.text('Généré par EduGest — La plateforme de gestion scolaire', pageWidth / 2, footerY + 4, { align: 'center' });

  doc.setFontSize(6);
  doc.setTextColor(LUXE.gold[0], LUXE.gold[1], LUXE.gold[2]);
  doc.text(
    `Document généré automatiquement le ${formatDate(new Date())} — Ce reçu fait foi de paiement.`,
    pageWidth / 2,
    footerY + 10,
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
