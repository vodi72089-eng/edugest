import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { notifyEvent } from '@/lib/notification-service';

const DISPENSE_READ_ROLES = [
  'MEDICAL', 'EPS', 'SCHOOL_ADMIN', 'SUPER_ADMIN_GLOBAL', 'SECRETARY',
  'DIRECTION', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE',
];

const DISPENSE_WRITE_ROLES = ['MEDICAL', 'SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN'];

/**
 * GET /api/dispenses?schoolId=&status=ACTIVE|ALL&classId=&studentId=
 * Liste des dispenses (élèves dispensés d'EPS), 200 plus récentes.
 * Par défaut : dispenses actives (status='ACTIVE' et endDate nulle ou future).
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, DISPENSE_READ_ROLES);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || user.schoolId;
    const statusFilter = searchParams.get('status') || 'ACTIVE';
    const classId = searchParams.get('classId') || '';
    const studentId = searchParams.get('studentId') || '';

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    // NB : le modèle est MedicalDispensation (pas de champ `status`) — une
    // dispense est « active » tant que sa date de fin n'est pas échue.
    const where: Prisma.MedicalDispensationWhereInput = { schoolId };

    if (statusFilter === 'ACTIVE') {
      where.endDate = { gte: new Date() };
    } // status=ALL → tout

    if (classId) where.student = { classId };
    if (studentId) where.studentId = studentId;

    const dispenses = await db.medicalDispensation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            matricule: true,
            photoUrl: true,
            class: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json({
      data: dispenses.map(d => ({
        id: d.id,
        student: {
          id: d.student.id,
          firstName: d.student.firstName,
          lastName: d.student.lastName,
          matricule: d.student.matricule,
          photoUrl: d.student.photoUrl,
          class: d.student.class,
        },
        type: d.type,
        reason: d.reason,
        startDate: d.startDate,
        endDate: d.endDate,
        // Statut dérivé (le modèle n'a pas de champ status) + champs sans
        // équivalent sur MedicalDispensation renvoyés à null.
        status: d.endDate >= new Date() ? 'ACTIVE' : 'EXPIRED',
        note: null,
        createdById: null,
        createdByName: null,
        createdAt: d.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Dispenses] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

/**
 * POST /api/dispenses
 * body: { studentId, type?: 'EPS', reason, startDate?, endDate?, note? }
 * Crée une dispense puis notifie les comptes EPS (+ SCHOOL_ADMIN) de l'école.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, DISPENSE_WRITE_ROLES);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { studentId, type, reason, startDate, endDate, note } = body;

    if (!studentId || !reason) {
      return NextResponse.json({ error: 'studentId et reason sont requis' }, { status: 400 });
    }

    const student = await db.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        schoolId: true,
        class: { select: { name: true } },
      },
    });

    if (!student) {
      return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 });
    }

    if (!verifySchoolAccess(user, student.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    const start = startDate ? new Date(startDate) : new Date();
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: 'startDate invalide (date ISO attendue)' }, { status: 400 });
    }
    // endDate est requis dans MedicalDispensation : par défaut, même jour.
    const end = endDate ? new Date(endDate) : start;
    if (endDate && isNaN(end.getTime())) {
      return NextResponse.json({ error: 'endDate invalide (date ISO attendue)' }, { status: 400 });
    }

    const dispense = await db.medicalDispensation.create({
      data: {
        studentId: student.id,
        type: type || 'EPS',
        reason,
        startDate: start,
        endDate: end,
        schoolId: student.schoolId,
      },
    });

    // ── Notifications in-app (resolver centralisé) ─────────────────────────
    // Destinataires : Parent (politique médical) + SCHOOL_ADMIN + EPS
    // (besoin métier sport) de l'école.
    let epsNotified = 0;
    try {
      const startFr = start.toLocaleDateString('fr-FR');
      const endFr = end ? end.toLocaleDateString('fr-FR') : 'indéterminé';
      const typeLabel = dispense.type === 'EPS' ? "d'EPS" : `de ${dispense.type}`;
      const message =
        `${student.firstName} ${student.lastName} (${student.class?.name ?? 'classe non définie'}) est dispensé(e) ${typeLabel} du ${startFr} au ${endFr}. Motif : ${reason}.` +
        (note ? ` Note : ${note}` : '');

      const notifyResult = await notifyEvent(
        { type: 'DISPENSE', schoolId: student.schoolId, studentId, actorId: user.id },
        {
          title: 'Nouvel élève dispensé (EPS)',
          message,
          relatedId: dispense.id,
        }
      );
      epsNotified = notifyResult.recipients.filter((r) => r.role === 'EPS').length;
    } catch (notifError) {
      console.error('[Dispenses] Notification error (non-blocking):', notifError);
    }

    return NextResponse.json(
      { data: dispense, notifications: { epsNotified } },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Dispenses] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
