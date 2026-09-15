import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, verifySchoolAccess } from '@/lib/auth';

/**
 * Vérification universelle par code unique — GET /api/verify/document?code=
 *
 * Recherche un document par son code lisible (ou son identifiant technique) :
 *  - Reçu de paiement   : receiptNumber / referenceNumber / id  (REC-…)
 *  - Bulletin           : ReportCard.docCode                    (BUL-…)
 *  - Note               : Grade.docCode                         (NOT-…)
 *  - Fiche médicale     : MedicalDocument.docCode               (DIS-/FSA-/REG-)
 *
 * Renvoie { found: true, type, data } avec les détails du document,
 * ou 404 { found: false }.
 */

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code')?.trim();
    if (!code) {
      return NextResponse.json({ error: 'Code document requis' }, { status: 400 });
    }

    const q = norm(code);
    const scopeSchoolId = user.role === 'SUPER_ADMIN_GLOBAL'
      ? searchParams.get('schoolId') || null
      : user.schoolId;

    // ── 1. Document médical (DIS-/FSA-/REG-) ────────────────────────
    const medical = await db.medicalDocument.findFirst({
      where: {
        OR: [{ docCode: code }, { docCode: q }, { id: q }],
        ...(scopeSchoolId ? { schoolId: scopeSchoolId } : {}),
      },
      include: {
        student: {
          select: { firstName: true, lastName: true, matricule: true, class: { select: { name: true } } },
        },
        school: { select: { name: true, shortName: true } },
        createdBy: { select: { name: true } },
      },
    });
    if (medical) {
      if (!verifySchoolAccess(user, medical.schoolId)) {
        return NextResponse.json({ found: false, error: 'Document hors de votre école' }, { status: 403 });
      }
      return NextResponse.json({
        found: true,
        type: 'MEDICAL_DOCUMENT',
        data: {
          id: medical.id,
          docCode: medical.docCode,
          docType: medical.type,
          title: medical.title,
          createdAt: medical.createdAt,
          createdBy: medical.createdBy?.name || null,
          student: medical.student,
          school: medical.school,
        },
      });
    }

    // ── 2. Reçu de paiement (receiptNumber / referenceNumber / id) ──
    const payment = await db.paymentRecord.findFirst({
      where: {
        OR: [
          { receiptNumber: code },
          { receiptNumber: q },
          { referenceNumber: code },
          { referenceNumber: q },
          { id: q },
        ],
        ...(scopeSchoolId ? { schoolId: scopeSchoolId } : {}),
      },
      include: {
        school: { select: { name: true, shortName: true } },
      },
    });
    if (payment) {
      if (!verifySchoolAccess(user, payment.schoolId)) {
        return NextResponse.json({ found: false, error: 'Document hors de votre école' }, { status: 403 });
      }
      const payStudent = await db.student.findUnique({
        where: { id: payment.studentId },
        select: { firstName: true, lastName: true, matricule: true, class: { select: { name: true } } },
      });
      return NextResponse.json({
        found: true,
        type: 'RECEIPT',
        data: {
          id: payment.id,
          receiptNumber: payment.receiptNumber || `REC-${payment.id.slice(-8).toUpperCase()}`,
          referenceNumber: payment.referenceNumber,
          amount: payment.amount,
          paidAmount: payment.paidAmount,
          remaining: Math.max(payment.amount - payment.paidAmount, 0),
          trimester: payment.trimester,
          paymentMethod: payment.paymentMethod,
          status: payment.status,
          paidAt: payment.paidAt,
          verifiedBy: payment.verifiedBy,
          verifiedAt: payment.verifiedAt,
          createdAt: payment.createdAt,
          student: payStudent,
          school: payment.school,
        },
      });
    }

    // ── 3. Bulletin (ReportCard.docCode) ────────────────────────────
    const reportCard = await db.reportCard.findFirst({
      where: {
        OR: [{ docCode: code }, { docCode: q }, { id: q }],
      },
    });
    if (reportCard) {
      const rcStudent = await db.student.findUnique({
        where: { id: reportCard.studentId },
        select: { firstName: true, lastName: true, matricule: true, schoolId: true, class: { select: { name: true } } },
      });
      if (!rcStudent || !verifySchoolAccess(user, rcStudent.schoolId)) {
        return NextResponse.json({ found: false, error: 'Document hors de votre école' }, { status: 403 });
      }
      return NextResponse.json({
        found: true,
        type: 'BULLETIN',
        data: {
          id: reportCard.id,
          docCode: reportCard.docCode,
          trimester: reportCard.trimester,
          average: reportCard.average,
          decision: reportCard.decision,
          generatedAt: reportCard.generatedAt,
          student: {
            firstName: rcStudent.firstName,
            lastName: rcStudent.lastName,
            matricule: rcStudent.matricule,
            class: rcStudent.class,
          },
        },
      });
    }

    // ── 4. Note (Grade.docCode) ─────────────────────────────────────
    const grade = await db.grade.findFirst({
      where: {
        OR: [{ docCode: code }, { docCode: q }, { id: q }],
      },
      include: {
        student: {
          select: { firstName: true, lastName: true, matricule: true, schoolId: true, class: { select: { name: true } } },
        },
        subject: { select: { name: true } },
      },
    });
    if (grade) {
      if (!verifySchoolAccess(user, grade.student.schoolId)) {
        return NextResponse.json({ found: false, error: 'Document hors de votre école' }, { status: 403 });
      }
      return NextResponse.json({
        found: true,
        type: 'GRADE',
        data: {
          id: grade.id,
          docCode: grade.docCode,
          trimester: grade.trimester,
          score: grade.score,
          comment: grade.comment,
          createdAt: grade.createdAt,
          subject: grade.subject,
          student: {
            firstName: grade.student.firstName,
            lastName: grade.student.lastName,
            matricule: grade.student.matricule,
            class: grade.student.class,
          },
        },
      });
    }

    return NextResponse.json({ found: false }, { status: 404 });
  } catch (error: any) {
    console.error('[Verify Document API] GET error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
