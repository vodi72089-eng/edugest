import { db } from '@/lib/db';
import { requireAuth, verifySchoolAccess, verifyParentAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function getDecisionLabel(decision: string | null): { label: string; color: { r: number; g: number; b: number } } {
  switch (decision) {
    case 'PASSED':
      return { label: 'PASSÉ', color: { r: 22, g: 163, b: 74 } };
    case 'REPEAT':
      return { label: 'REDOUBLE', color: { r: 220, g: 38, b: 38 } };
    default:
      return { label: 'EN ATTENTE', color: { r: 234, g: 179, b: 8 } };
  }
}

function getMention(average: number): string {
  if (average >= 16) return 'Mention Bien';
  if (average >= 14) return 'Mention Assez Bien';
  if (average >= 12) return 'Mention Passable';
  if (average >= 10) return 'Admis';
  return 'Non Admis';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
}

// ─── PDF Builder using jsPDF ────────────────────────────────────────────────

function buildBulletinPDF(
  student: { id: string; firstName: string; lastName: string; matricule: string; photoUrl?: string | null },
  school: { name: string; shortName: string; email: string; phone: string; address: string; city: string; province: string; country: string; logo?: string | null },
  className: string,
  trimester: string,
  grades: { subjectName: string; score: number; coefficient: number }[],
  average: number,
  decision: string | null,
  schoolYearLabel: string,
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
      const initials = getSchoolInitials(school.shortName);
      doc.setFillColor(184, 134, 11);
      doc.circle(marginX + 12, 26, 12, 'F');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(initials, marginX + 12, 30, { align: 'center' });
    }
  } else {
    const initials = getSchoolInitials(school.shortName);
    doc.setFillColor(184, 134, 11);
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

  // ── Bulletin Title ────────────────────────────────────────────────────────
  y = 62;
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('BULLETIN SCOLAIRE', pageWidth / 2, y, { align: 'center' });

  // Trimester & School Year
  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(`${getTrimesterLabel(trimester)} — ${schoolYearLabel}`, pageWidth / 2, y, { align: 'center' });

  // ── Student information ──────────────────────────────────────────────────
  y += 14;
  doc.setFillColor(184, 134, 11);
  doc.rect(marginX, y, 2, 6, 'F');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text("INFORMATIONS DE L'ÉLÈVE", marginX + 6, y + 5);

  y += 14;
  // Student photo (if available)
  const photoX = marginX;
  if (studentPhotoBase64) {
    try {
      doc.addImage(studentPhotoBase64, 'JPEG', photoX, y - 2, 16, 16);
    } catch {
      // No photo, skip
    }
    drawFieldRow(doc, photoX + 20, y, contentWidth - 20, 'Nom complet', `${student.lastName.toUpperCase()} ${student.firstName}`);
  } else {
    drawFieldRow(doc, photoX, y, contentWidth, 'Nom complet', `${student.lastName.toUpperCase()} ${student.firstName}`);
  }
  y += 10;
  drawFieldRow(doc, marginX, y, contentWidth, 'Matricule', student.matricule);
  y += 10;
  drawFieldRow(doc, marginX, y, contentWidth, 'Classe', className);

  // ── Divider ──────────────────────────────────────────────────────────────
  y += 14;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, pageWidth - marginX, y);

  // ── Grades Table ──────────────────────────────────────────────────────────
  y += 8;
  doc.setFillColor(184, 134, 11);
  doc.rect(marginX, y, 2, 6, 'F');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('NOTES PAR MATIÈRE', marginX + 6, y + 5);

  y += 14;

  // Table header
  const colSubject = marginX;
  const colCoefficient = marginX + contentWidth * 0.6;
  const colScore = marginX + contentWidth * 0.75;
  const colAvg = marginX + contentWidth * 0.88;

  doc.setFillColor(248, 250, 252); // #f8fafc
  doc.roundedRect(marginX, y, contentWidth, 8, 1, 1, 'F');

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text('MATIÈRE', colSubject + 3, y + 5.5);
  doc.text('COEFF.', colCoefficient, y + 5.5, { align: 'center' });
  doc.text('NOTE', colScore, y + 5.5, { align: 'center' });
  doc.text('MOY.', colAvg, y + 5.5, { align: 'center' });

  y += 10;

  // Table rows
  let totalWeightedScore = 0;
  let totalCoefficients = 0;

  grades.forEach((grade, index) => {
    // Alternate row background
    if (index % 2 === 0) {
      doc.setFillColor(255, 255, 255);
    } else {
      doc.setFillColor(249, 250, 251); // #f9fafb
    }
    doc.roundedRect(marginX, y - 1, contentWidth, 8, 0.5, 0.5, 'F');

    // Subject name
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.text(grade.subjectName, colSubject + 3, y + 4.5, { maxWidth: contentWidth * 0.55 });

    // Coefficient
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(String(grade.coefficient), colCoefficient, y + 4.5, { align: 'center' });

    // Score
    const scoreColor = grade.score >= 10 ? { r: 22, g: 163, b: 74 } : { r: 220, g: 38, b: 38 };
    doc.setFontSize(8);
    doc.setTextColor(scoreColor.r, scoreColor.g, scoreColor.b);
    doc.setFont('helvetica', 'bold');
    doc.text(`${grade.score.toFixed(1)}/20`, colScore, y + 4.5, { align: 'center' });

    // Weighted contribution
    const weightedContribution = (grade.score * grade.coefficient) / (grade.coefficient || 1);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(weightedContribution.toFixed(1), colAvg, y + 4.5, { align: 'center' });

    totalWeightedScore += grade.score * grade.coefficient;
    totalCoefficients += grade.coefficient;

    y += 8;
  });

  // ── Divider ──────────────────────────────────────────────────────────────
  y += 4;
  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, y, pageWidth - marginX, y);

  // ── Average & Decision ──────────────────────────────────────────────────
  y += 8;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(marginX, y, contentWidth, 30, 3, 3, 'F');

  // Average
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.text('MOYENNE GÉNÉRALE', marginX + 10, y + 10);

  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(`${average.toFixed(2)}/20`, marginX + 10, y + 24);

  // Mention
  doc.setFontSize(9);
  doc.setTextColor(184, 134, 11); // gold
  doc.setFont('helvetica', 'bold');
  doc.text(getMention(average), marginX + 60, y + 24);

  // Decision badge
  const decisionInfo = getDecisionLabel(decision);
  const decisionBg = decision === 'PASSED'
    ? { r: 220, g: 252, b: 231 }
    : decision === 'REPEAT'
      ? { r: 254, g: 226, b: 226 }
      : { r: 254, g: 249, b: 195 };

  doc.setFillColor(decisionBg.r, decisionBg.g, decisionBg.b);
  doc.roundedRect(marginX + contentWidth - 40, y + 6, 30, 18, 2, 2, 'F');

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('DÉCISION', marginX + contentWidth - 25, y + 12, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(decisionInfo.color.r, decisionInfo.color.g, decisionInfo.color.b);
  doc.setFont('helvetica', 'bold');
  doc.text(decisionInfo.label, marginX + contentWidth - 25, y + 20, { align: 'center' });

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
    `Document généré automatiquement le ${formatDate(new Date())} — Ce bulletin est officiel.`,
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

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { studentId } = await params;
    const { searchParams } = new URL(request.url);
    const trimester = searchParams.get('trimester') || 'T1';
    const schoolId = searchParams.get('schoolId') || user.schoolId;

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    // For PARENT, verify parent-child relationship
    if (user.role === 'PARENT') {
      const hasAccess = await verifyParentAccess(user, studentId);
      if (!hasAccess) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
    }

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
        class: { select: { name: true } },
      },
    });

    if (!student) {
      return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 });
    }

    // SECURITY: the student must belong to the requested school, otherwise a
    // user of school A could generate bulletins for students of school B.
    if (student.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
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
      return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
    }

    // Fetch active school year
    const schoolYear = await db.schoolYear.findFirst({
      where: { schoolId, isActive: true },
      select: { id: true, label: true },
    });

    if (!schoolYear) {
      return NextResponse.json({ error: 'Année scolaire active non trouvée' }, { status: 404 });
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
      return NextResponse.json({ error: 'Aucune note trouvée pour ce trimestre' }, { status: 404 });
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

    // Build PDF
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

    const pdfBuffer = buildBulletinPDF(
      student,
      school,
      student.class?.name || '—',
      trimester,
      gradeData,
      average,
      decision,
      schoolYear.label || schoolYear.id,
      schoolLogoBase64,
      studentPhotoBase64
    );

    const filename = `bulletin-${student.lastName}-${student.firstName}-${trimester}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Error generating bulletin PDF:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
