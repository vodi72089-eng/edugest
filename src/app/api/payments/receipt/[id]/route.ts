import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';

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

function getStatusColor(status: string): { bg: string; text: string; label: string } {
  switch (status.toUpperCase()) {
    case 'PAID':
      return { bg: '#dcfce7', text: '#166534', label: 'PAYÉ' };
    case 'PARTIAL':
      return { bg: '#fef9c3', text: '#854d0e', label: 'PARTIEL' };
    case 'PENDING':
      return { bg: '#fee2e2', text: '#991b1b', label: 'EN ATTENTE' };
    case 'OVERDUE':
      return { bg: '#fecaca', text: '#7f1d1d', label: 'EN RETARD' };
    case 'CANCELLED':
      return { bg: '#f3f4f6', text: '#374151', label: 'ANNULÉ' };
    default:
      return { bg: '#e5e7eb', text: '#374151', label: status.toUpperCase() };
  }
}

function getPaymentMethodLabel(method: string | null): string {
  if (!method) return '—';
  const map: Record<string, string> = {
    CASH: 'Espèces',
    MOBILE_MONEY: 'Mobile Money',
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

// ─── PDF Builder ────────────────────────────────────────────────────────────

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
    createdAt: Date;
  },
  student: { firstName: string; lastName: string; matricule: string },
  school: { name: string; shortName: string; email: string; phone: string; address: string; city: string; province: string; country: string }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 60, left: 50, right: 50 },
      info: {
        Title: `Reçu - ${student.lastName} ${student.firstName}`,
        Author: 'EduGest',
        Subject: `Reçu de paiement ${payment.receiptNumber || payment.id}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const rightX = doc.page.width - doc.page.margins.right;
    const statusInfo = getStatusColor(payment.status);
    const remaining = payment.amount - payment.paidAmount;

    // ── School header with initials badge ──────────────────────────────────

    const initials = getSchoolInitials(school.shortName);

    // Draw initials circle
    const circleX = leftX + 28;
    const circleY = 68;
    const circleR = 28;
    doc.save();
    doc.circle(circleX, circleY, circleR).fill('#1e293b');
    doc.fontSize(20).fillColor('#ffffff').font('Helvetica-Bold');
    doc.text(initials, circleX - circleR, circleY - 14, {
      width: circleR * 2,
      align: 'center',
    });
    doc.restore();

    // School name
    const textStartX = circleX + circleR + 16;
    doc.fontSize(18).fillColor('#0f172a').font('Helvetica-Bold');
    doc.text(school.name, textStartX, 48, { width: pageWidth - 70 });

    // School address line
    doc.fontSize(9).fillColor('#64748b').font('Helvetica');
    const addressParts = [school.address, school.city, school.province, school.country].filter(Boolean);
    doc.text(addressParts.join(', '), textStartX, 72, { width: pageWidth - 70 });

    // Contact line
    const contactParts = [school.email, school.phone].filter(Boolean);
    doc.text(contactParts.join('  |  '), textStartX, 84, { width: pageWidth - 70 });

    // ── Divider ────────────────────────────────────────────────────────────

    let y = 108;
    doc.moveTo(leftX, y).lineTo(rightX, y).strokeColor('#cbd5e1').lineWidth(1).stroke();

    // ── Receipt Title ──────────────────────────────────────────────────────

    y = 124;
    doc.fontSize(20).fillColor('#0f172a').font('Helvetica-Bold');
    doc.text('REÇU DE PAIEMENT', leftX, y, { width: pageWidth, align: 'center' });

    // Receipt number & date
    y += 30;
    doc.fontSize(9).fillColor('#64748b').font('Helvetica');
    const receiptNo = payment.receiptNumber || `REC-${payment.id.slice(-8).toUpperCase()}`;
    doc.text(`N° du reçu : ${receiptNo}`, leftX, y, { width: pageWidth / 2 });
    doc.text(`Date d'émission : ${formatDate(payment.paidAt || payment.createdAt)}`, leftX + pageWidth / 2, y, {
      width: pageWidth / 2,
      align: 'right',
    });

    // ── Status indicator bar ───────────────────────────────────────────────

    y += 26;
    const barHeight = 30;
    doc.save();
    doc.roundedRect(leftX, y, pageWidth, barHeight, 4).fill('#f8fafc');
    doc.restore();

    // Status badge
    const badgeW = 110;
    const badgeH = 22;
    const badgeX = leftX + 14;
    const badgeY = y + (barHeight - badgeH) / 2;
    doc.save();
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 4).fill(statusInfo.bg);
    doc.fontSize(10).fillColor(statusInfo.text).font('Helvetica-Bold');
    doc.text(statusInfo.label, badgeX, badgeY + 6, { width: badgeW, align: 'center' });
    doc.restore();

    // Status description next to badge
    const statusDescX = badgeX + badgeW + 16;
    doc.fontSize(9).fillColor('#475569').font('Helvetica');
    const statusMessages: Record<string, string> = {
      PAID: 'Le paiement a été intégralement réglé.',
      PARTIAL: 'Le paiement est partiellement réglé. Un solde reste dû.',
      PENDING: 'Le paiement est en attente de règlement.',
      OVERDUE: 'Le paiement est en retard. Veuillez régler dès que possible.',
      CANCELLED: 'Ce paiement a été annulé.',
    };
    doc.text(statusMessages[payment.status.toUpperCase()] || '', statusDescX, badgeY + 6, {
      width: pageWidth - (statusDescX - leftX) - 10,
    });

    // ── Student information ────────────────────────────────────────────────

    y += barHeight + 20;
    doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold');
    doc.text('INFORMATIONS DE L\'ÉLÈVE', leftX, y);

    y += 20;
    drawFieldRow(doc, leftX, y, pageWidth, 'Nom complet', `${student.lastName.toUpperCase()} ${student.firstName}`);
    y += 22;
    drawFieldRow(doc, leftX, y, pageWidth, 'Matricule', student.matricule);

    // ── Divider ────────────────────────────────────────────────────────────

    y += 30;
    doc.moveTo(leftX, y).lineTo(rightX, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

    // ── Payment details ────────────────────────────────────────────────────

    y += 14;
    doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold');
    doc.text('DÉTAILS DU PAIEMENT', leftX, y);

    y += 22;
    drawFieldRow(doc, leftX, y, pageWidth, 'Trimestre', getTrimesterLabel(payment.trimester));
    y += 22;
    drawFieldRow(doc, leftX, y, pageWidth, 'Montant dû', formatCurrency(payment.amount));
    y += 22;
    drawFieldRow(doc, leftX, y, pageWidth, 'Montant payé', formatCurrency(payment.paidAmount));
    y += 22;

    // Remaining balance — highlighted if > 0
    const remainingColor = remaining > 0 ? '#dc2626' : '#16a34a';
    doc.fontSize(9).fillColor('#64748b').font('Helvetica');
    doc.text('Reste à payer', leftX, y + 2, { width: pageWidth * 0.4 });
    doc.fontSize(10).fillColor(remainingColor).font('Helvetica-Bold');
    doc.text(remaining > 0 ? formatCurrency(remaining) : '0 CDF', leftX + pageWidth * 0.4, y + 2, {
      width: pageWidth * 0.6,
      align: 'right',
    });

    y += 22;
    drawFieldRow(doc, leftX, y, pageWidth, 'Mode de paiement', getPaymentMethodLabel(payment.paymentMethod));
    y += 22;
    drawFieldRow(doc, leftX, y, pageWidth, 'Référence', payment.referenceNumber || '—');

    // ── Divider ────────────────────────────────────────────────────────────

    y += 30;
    doc.moveTo(leftX, y).lineTo(rightX, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

    // ── Amount summary box ─────────────────────────────────────────────────

    y += 16;
    const summaryBoxH = 56;
    doc.save();
    doc.roundedRect(leftX, y, pageWidth, summaryBoxH, 6).fill('#1e293b');
    doc.restore();

    doc.fontSize(9).fillColor('#94a3b8').font('Helvetica');
    doc.text('MONTANT TOTAL PAYÉ', leftX + 20, y + 12, { width: pageWidth - 40 });
    doc.fontSize(22).fillColor('#ffffff').font('Helvetica-Bold');
    doc.text(formatCurrency(payment.paidAmount), leftX + 20, y + 26, { width: pageWidth - 40 });

    // ── Footer ─────────────────────────────────────────────────────────────

    y += summaryBoxH + 40;
    doc.moveTo(leftX, y).lineTo(rightX, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

    y += 16;

    // EduGest branding text
    doc.fontSize(9).fillColor('#94a3b8').font('Helvetica');
    doc.text('Généré par EduGest - La plateforme de gestion scolaire', leftX, y, {
      width: pageWidth,
      align: 'center',
    });
    y += 14;
    doc.fontSize(7).fillColor('#cbd5e1').font('Helvetica');
    doc.text(
      `Document généré automatiquement le ${formatDate(new Date())} — Ce reçu fait foi de paiement.`,
      leftX,
      y,
      { width: pageWidth, align: 'center' }
    );

    // Finalize
    doc.end();
  });
}

function drawFieldRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  pageWidth: number,
  label: string,
  value: string
) {
  doc.fontSize(9).fillColor('#64748b').font('Helvetica');
  doc.text(label, x, y + 2, { width: pageWidth * 0.4 });
  doc.fontSize(10).fillColor('#0f172a').font('Helvetica');
  doc.text(value, x + pageWidth * 0.4, y + 2, { width: pageWidth * 0.6, align: 'right' });
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
    }

    // Fetch the student (no direct relation in schema, so manual lookup)
    const student = await db.student.findUnique({
      where: { id: payment.studentId },
      select: { firstName: true, lastName: true, matricule: true },
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Build PDF
    const pdfBuffer = await buildReceiptPDF(payment, student, payment.school);

    const receiptNo = payment.receiptNumber || `REC-${payment.id.slice(-8).toUpperCase()}`;

    return new NextResponse(pdfBuffer, {
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
      { error: 'Failed to generate receipt PDF' },
      { status: 500 }
    );
  }
}
