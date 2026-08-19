import { db } from '@/lib/db';
import { requireAuth, requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

const CONFIG_ROLES = ['SUPER_ADMIN_GLOBAL', 'ADMIN', 'SECRETARY', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE', 'HEAD_TEACHER'];

// GET /api/report-cards?studentId=...&trimester=...&schoolId=...
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const trimester = searchParams.get('trimester');
    const schoolId = searchParams.get('schoolId') || user.schoolId;

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    const where: any = {};
    if (studentId) where.studentId = studentId;
    if (trimester) where.trimester = trimester;

    // If studentId specified, verify access
    if (studentId) {
      const student = await db.student.findUnique({ where: { id: studentId }, select: { parentId: true, schoolId: true } });
      if (!student) {
        return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 });
      }
      // SECURITY: the student must belong to the requested school
      if (user.role !== 'SUPER_ADMIN_GLOBAL' && student.schoolId !== schoolId) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
      // Parents can only read their own children
      if (user.role === 'PARENT' && student.parentId !== user.id) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
    }

    const reportCards = await db.reportCard.findMany({
      where,
      orderBy: { generatedAt: 'desc' },
    });

    return NextResponse.json({ data: reportCards });
  } catch (error) {
    console.error('[ReportCard] Error fetching report cards:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// POST /api/report-cards
// Create or update a report card decision
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, CONFIG_ROLES);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { studentId, trimester, decision, schoolId, average } = body;

    if (!studentId || !trimester || !decision) {
      return NextResponse.json(
        { error: 'studentId, trimester et decision sont requis' },
        { status: 400 }
      );
    }

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    // Validate decision
    const validDecisions = ['PENDING', 'PASSED', 'REPEAT'];
    if (!validDecisions.includes(decision)) {
      return NextResponse.json(
        { error: `Décision invalide: ${decision}. Valeurs acceptées: ${validDecisions.join(', ')}` },
        { status: 400 }
      );
    }

    // Find active school year
    const schoolYear = await db.schoolYear.findFirst({
      where: { schoolId, isActive: true },
      select: { id: true },
    });

    if (!schoolYear) {
      return NextResponse.json({ error: 'Année scolaire active non trouvée' }, { status: 404 });
    }

    // Find existing report card or create new one
    const existing = await db.reportCard.findFirst({
      where: {
        studentId,
        trimester,
        schoolYearId: schoolYear.id,
      },
    });

    let reportCard;
    if (existing) {
      reportCard = await db.reportCard.update({
        where: { id: existing.id },
        data: {
          decision,
          average: average || null,
        },
      });
    } else {
      reportCard = await db.reportCard.create({
        data: {
          studentId,
          trimester,
          schoolYearId: schoolYear.id,
          decision,
          average: average || null,
        },
      });
    }

    // Create in-app notifications
    try {
      const student = await db.student.findUnique({
        where: { id: studentId },
        select: { firstName: true, lastName: true, parentId: true, schoolId: true },
      });
      if (student) {
        const decisionLabel = decision === 'PASSED' ? 'Admis' : decision === 'REPEAT' ? 'Redoublant' : 'En attente';

        // Notify admins
        const adminRoles = ['SUPER_ADMIN_GLOBAL', 'SECRETARY', 'CASHIER', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];
        const schoolAdmins = await db.user.findMany({
          where: { schoolId: student.schoolId, role: { in: adminRoles }, id: { not: user.id } },
          select: { id: true },
        });
        for (const admin of schoolAdmins) {
          await db.notification.create({
            data: {
              type: 'BULLETIN_UPDATED',
              title: 'Bulletin mis à jour',
              message: `${student.firstName} ${student.lastName} - ${trimester} - ${decisionLabel}${average ? ` - Moy: ${average}` : ''}`,
              userId: admin.id,
              schoolId: student.schoolId,
              relatedId: reportCard.id,
            },
          });
        }

        // Notify parent
        if (student.parentId) {
          await db.notification.create({
            data: {
              type: 'BULLETIN_UPDATED',
              title: 'Bulletin disponible',
              message: `${student.firstName} ${student.lastName} - ${trimester} - ${decisionLabel}${average ? ` - Moyenne: ${average}` : ''}`,
              userId: student.parentId,
              schoolId: student.schoolId,
              relatedId: reportCard.id,
            },
          });
        }
      }
    } catch { /* notification failed, non-critical */ }

    return NextResponse.json({
      data: reportCard,
      message: 'Décision enregistrée avec succès',
    });
  } catch (error) {
    console.error('[ReportCard] Error saving report card:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
