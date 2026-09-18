import { db } from '@/lib/db';
import { notify } from '@/lib/notify';
import { requireAuth, requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { notifyBulletin } from '@/lib/whatsapp-agent';
import { notifyPassingUpdateToAdmins } from '@/lib/passing-notify';
import { requireFeature } from '@/lib/feature-gate';

// Rôles pouvant enregistrer une décision de passage. (Avant : rôle fantôme
// 'ADMIN' inexistant et SCHOOL_ADMIN/DIRECTION absents.)
const CONFIG_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'SECRETARY', 'DIRECTION', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE', 'HEAD_TEACHER'];

// GET /api/report-cards?studentId=...&trimester=...&schoolId=...
export async function GET(request: NextRequest) {
  try {
    // Feature report_cards (bulletins) réservée STANDARD+ côté serveur.
    const authResult = await requireFeature(request, 'report_cards');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const trimester = searchParams.get('trimester');
    // ── SÉCURITÉ (cross-tenant P1) : le schoolId du query n'est honoré que
    // pour SUPER_ADMIN_GLOBAL (avant : un SCHOOL_ADMIN voyait toutes les
    // écoles). Feature bulletin (report_cards) réservée STANDARD+ côté API.
    const schoolId = user.role === 'SUPER_ADMIN_GLOBAL'
      ? (searchParams.get('schoolId') || user.schoolId)
      : user.schoolId;

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    const where: any = {};
    if (studentId) where.studentId = studentId;
    if (trimester) where.trimester = trimester;
    // Scoping école systématique via l'élève : les décisions d'une autre
    // école ne fuient plus jamais dans la liste.
    where.student = { ...(where.student || {}), schoolId };

    // For TEACHER/HEAD_TEACHER, only show report cards from their assigned classes
    if (user.role === 'TEACHER' || user.role === 'HEAD_TEACHER') {
      const assignments = await db.teacherAssignment.findMany({
        where: { teacherId: user.id },
        select: { classId: true },
      });
      const classIds = [...new Set(assignments.map(a => a.classId))];
      where.student = {
        schoolId,
        ...(classIds.length > 0 ? { classId: { in: classIds } } : { classId: '__NONE__' }),
      };
    }

    // For PARENT role, only show their children's report cards
    if (user.role === 'PARENT') {
      where.student = { schoolId, parentId: user.id };
    }

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
    // Feature report_cards (bulletins) réservée STANDARD+ côté serveur.
    const featureCheck = await requireFeature(request, 'report_cards');
    if ('error' in featureCheck) return featureCheck.error;
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

    // ── SÉCURITÉ (cross-tenant) : l'élève ciblé doit appartenir à l'école
    // (avant : décision de passage enregistrable pour un élève d'une autre
    // école sur l'en-tête de la sienne).
    const targetStudent = await db.student.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });
    if (!targetStudent) {
      return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 });
    }
    if (targetStudent.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Cet élève n\'appartient pas à cette école' }, { status: 403 });
    }

    // Validate decision (RATTRAPAGE = passage sous condition d'examens de rattrapage)
    const validDecisions = ['PENDING', 'PASSED', 'REPEAT', 'RATTRAPAGE'];
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

    // Create in-app notifications + WhatsApp au parent
    try {
      const student = await db.student.findUnique({
        where: { id: studentId },
        select: { firstName: true, lastName: true, parentId: true, schoolId: true, classId: true },
      });
      if (student) {
        const decisionLabel = decision === 'PASSED' ? 'Admis' : decision === 'REPEAT' ? 'Redoublant' : decision === 'RATTRAPAGE' ? 'Rattrapage' : 'En attente';

        // ── Notify admins (in-app + push + EMAIL via Resend) ────────────────
        // Personnel de l'école (SCHOOL_ADMIN inclus) + super admins plateforme.
        // Une décision T3 = décision de passage de classe → titre dédié.
        const isPassingDecision = trimester === 'T3' && decision !== 'PENDING';
        try {
          void notifyPassingUpdateToAdmins({
            type: isPassingDecision ? 'CLASS_PASSING' : 'BULLETIN_UPDATED',
            title: isPassingDecision ? 'Passage de classe — décision enregistrée' : 'Bulletin mis à jour',
            message: `${student.firstName} ${student.lastName} - ${trimester} - ${decisionLabel}${average ? ` - Moy: ${average}` : ''}`,
            schoolId: student.schoolId,
            schoolName: (await db.school.findUnique({ where: { id: student.schoolId }, select: { name: true } }))?.name ?? null,
            relatedId: reportCard.id,
            excludeUserId: user.id,
          });
        } catch (adminNotifyError) {
          console.error('[ReportCard] Admin notify error (non-blocking):', adminNotifyError);
        }

        // Notify parent (in-app)
        if (student.parentId) {
          await notify({
            data: {
              type: 'BULLETIN_UPDATED',
              title: 'Bulletin disponible',
              message: `${student.firstName} ${student.lastName} - ${trimester} - ${decisionLabel}${average ? ` - Moyenne: ${average}` : ''}`,
              userId: student.parentId,
              schoolId: student.schoolId,
              relatedId: reportCard.id,
            },
          });

          // ── WhatsApp au parent : résumé du bulletin avec rang de classe ──
          const parent = await db.user.findUnique({
            where: { id: student.parentId },
            select: { phone: true },
          });
          const school = await db.school.findUnique({
            where: { id: student.schoolId },
            select: { name: true },
          });
          if (parent?.phone && school) {
            // Calcul du rang : moyennes des bulletins de la classe pour ce trimestre
            let ranking = 1;
            let totalClassStudents = 1;
            try {
              const classmates = await db.student.findMany({
                where: { classId: student.classId, isArchived: false, isExcluded: false },
                select: { id: true },
              });
              const ids = classmates.map(c => c.id);
              const cards = await db.reportCard.findMany({
                where: { studentId: { in: ids }, trimester, schoolYearId: schoolYear.id, average: { not: null } },
                select: { studentId: true, average: true },
              });
              const sorted = [...cards].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
              const rank = sorted.findIndex(c => c.studentId === studentId) + 1;
              if (rank > 0) ranking = rank;
              totalClassStudents = Math.max(sorted.length, 1);
            } catch { /* classement best-effort */ }

            const finalAverage = Number(average ?? reportCard.average ?? 0);
            void notifyBulletin({
              parentPhone: parent.phone,
              studentName: `${student.firstName} ${student.lastName}`,
              trimester,
              average: finalAverage,
              ranking,
              totalStudents: totalClassStudents,
              schoolName: school.name,
              schoolId: student.schoolId,
            }).catch(e => console.error('[ReportCard] WhatsApp bulletin failed:', e));
          }
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
