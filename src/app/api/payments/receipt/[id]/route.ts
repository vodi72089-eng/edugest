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
  const marginX = 25;
  const contentWidth = pageWidth - marginX * 2;
  let y = 0;

  // ── Header background ────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(0, 0, pageWidth, 52, 'F');

  // School logo (if available)
  if (schoolLogoBase64) {
    try {
      doc.addImage(schoolLogoBase64, 'JPEG', marginX, 8, 18, 18);
    } catch {
      // Fallback to initials badge if image fails
      const initials = getSchoolInitials(school.shortName);
      doc.setFillColor(184, 134, 11);
      doc.circle(marginX + 12, 26, 12, 'F');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(initials, marginX + 12, 30, { align: 'center' });
    }
  } else {
    // School initials badge (no logo)
    const initials = getSchoolInitials(school.shortName);
    doc.setFillColor(184, 134, 11); // gold
    doc.circle(marginX + 12, 26, 12, 'F');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(initials, marginX + 12, 30, { align: 'center' });
  }

  // School name
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(school.name, marginX + 30, 20, { maxWidth: contentWidth - 30 });

  // School address
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255, 0.55);
  doc.setFont('helvetica', 'normal');
  const addressParts = [school.address, school.city, school.province, school.country].filter(Boolean);
  if (addressParts.length > 0) {
    doc.text(addressParts.join(', '), marginX + 30, 28, { maxWidth: contentWidth - 30 });
  }
  const contactParts = [school.email, school.phone].filter(Boolean);
  if (contactParts.length > 0) {
    doc.text(contactParts.join('  |  '), marginX + 30, 34, { maxWidth: contentWidth - 30 });
  }

  // ── Receipt Title ────────────────────────────────────────────────────────
  y = 62;
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('REÇU DE PAIEMENT', pageWidth / 2, y, { align: 'center' });

  // Receipt number & date
  y += 10;
  const receiptNo = payment.receiptNumber || `REC-${payment.id.slice(-8).toUpperCase()}`;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(`N° du reçu : ${receiptNo}`, marginX, y);
  doc.text(`Date d'émission : ${formatDate(payment.paidAt || payment.createdAt)}`, pageWidth - marginX, y, { align: 'right' });

  // ── Status bar ───────────────────────────────────────────────────────────
  y += 12;
  doc.setFillColor(248, 250, 252); // #f8fafc
  doc.roundedRect(marginX, y, contentWidth, 14, 2, 2, 'F');

  const statusInfo = getStatusInfo(payment.status);
  // Status badge
  const bgRgb = hexToRgb(statusInfo.bg);
  const textRgb = hexToRgb(statusInfo.text);
  doc.setFillColor(bgRgb.r, bgRgb.g, bgRgb.b);
  doc.roundedRect(marginX + 4, y + 2, 36, 10, 2, 2, 'F');
  doc.setFontSize(8);
  doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
  doc.setFont('helvetica', 'bold');
  doc.text(statusInfo.label, marginX + 22, y + 8.5, { align: 'center' });

  // Status description
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text(statusInfo.desc, marginX + 44, y + 8.5, { maxWidth: contentWidth - 50 });

  // ── Student information ──────────────────────────────────────────────────
  y += 24;
  // Section title with gold left border
  doc.setFillColor(184, 134, 11);
  doc.rect(marginX, y, 2, 6, 'F');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text("INFORMATIONS DE L'ÉLÈVE", marginX + 6, y + 5);

  y += 14;
  const photoX = marginX;
  if (studentPhotoBase64) {
    try {
      doc.addImage(studentPhotoBase64, 'JPEG', photoX, y - 2, 16, 16);
    } catch {}
    drawFieldRow(doc, photoX + 20, y, contentWidth - 20, 'Nom complet', `${student.lastName.toUpperCase()} ${student.firstName}`);
  } else {
    drawFieldRow(doc, photoX, y, contentWidth, 'Nom complet', `${student.lastName.toUpperCase()} ${student.firstName}`);
  }
  y += 10;
  drawFieldRow(doc, marginX, y, contentWidth, 'Matricule', student.matricule);

  // ── Divider ──────────────────────────────────────────────────────────────
  y += 14;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, pageWidth - marginX, y);

  // ── Payment details ──────────────────────────────────────────────────────
  y += 8;
  doc.setFillColor(184, 134, 11);
  doc.rect(marginX, y, 2, 6, 'F');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('DÉTAILS DU PAIEMENT', marginX + 6, y + 5);

  y += 14;
  drawFieldRow(doc, marginX, y, contentWidth, 'Trimestre', getTrimesterLabel(payment.trimester));
  y += 10;
  drawFieldRow(doc, marginX, y, contentWidth, 'Montant dû', formatCurrency(payment.amount));
  y += 10;
  drawFieldRow(doc, marginX, y, contentWidth, 'Montant payé', formatCurrency(payment.paidAmount));
  y += 10;

  const remaining = payment.amount - payment.paidAmount;
  // Remaining balance
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('Reste à payer', marginX, y + 3);
  doc.setFontSize(9);
  if (remaining > 0) {
    doc.setTextColor(220, 38, 38); // red
  } else {
    doc.setTextColor(22, 163, 74); // green
  }
  doc.setFont('helvetica', 'bold');
  doc.text(remaining > 0 ? formatCurrency(remaining) : '0 CDF', pageWidth - marginX, y + 3, { align: 'right' });

  y += 10;
  drawFieldRow(doc, marginX, y, contentWidth, 'Mode de paiement', getPaymentMethodLabel(payment.paymentMethod));
  y += 10;
  drawFieldRow(doc, marginX, y, contentWidth, 'Référence', payment.referenceNumber || '—');

  // ── Divider ──────────────────────────────────────────────────────────────
  y += 14;
  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, y, pageWidth - marginX, y);

  // ── Summary box ──────────────────────────────────────────────────────────
  y += 8;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(marginX, y, contentWidth, 28, 3, 3, 'F');

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.text('MONTANT TOTAL PAYÉ', marginX + 10, y + 10);

  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(payment.paidAmount), marginX + 10, y + 22);

  // ── Verification section ──────────────────────────────────────────────────
  y += 36;
  if (payment.verifiedBy) {
    doc.setFillColor(220, 252, 231); // green-100
    doc.roundedRect(marginX, y, contentWidth, 20, 2, 2, 'F');

    doc.setFillColor(22, 163, 74); // green
    doc.circle(marginX + 8, y + 7, 3, 'F');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('✓', marginX + 8, y + 8.5, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(22, 163, 74);
    doc.setFont('helvetica', 'bold');
    doc.text('PAIEMENT VÉRIFIÉ', marginX + 14, y + 7);

    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    const verifiedDate = payment.verifiedAt ? formatDate(payment.verifiedAt) : '—';
    doc.text(`Vérifié par : ${payment.verifiedBy}  |  Date : ${verifiedDate}`, marginX + 14, y + 13);

    if (payment.verificationNote) {
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(`Note : ${payment.verificationNote}`, marginX + 14, y + 17, { maxWidth: contentWidth - 20 });
    }
  } else {
    doc.setFillColor(254, 249, 195); // yellow-100
    doc.roundedRect(marginX, y, contentWidth, 14, 2, 2, 'F');

    doc.setFontSize(8);
    doc.setTextColor(133, 77, 14);
    doc.setFont('helvetica', 'bold');
    doc.text('⚠ PAIEMENT NON VÉRIFIÉ', marginX + 6, y + 6);

    doc.setFontSize(6);
    doc.setTextColor(161, 98, 7);
    doc.setFont('helvetica', 'normal');
    doc.text('Ce paiement n\'a pas encore été vérifié par un administrateur', marginX + 6, y + 11);
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  y = pageHeight - 30;
  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, y, pageWidth - marginX, y);

  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.text('Généré par EduGest — La plateforme de gestion scolaire', pageWidth / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(6);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Document généré automatiquement le ${formatDate(new Date())} — Ce reçu fait foi de paiement.`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );

  return Buffer.from(doc.output('arraybuffer'));
}

function drawFieldRow(
  doc: jsPDF,
  x: number,
  y: number,
  contentWidth: number,
  label: string,
  value: string
) {
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(label, x, y + 3);
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(value, x + contentWidth, y + 3, { align: 'right' });
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
