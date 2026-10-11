import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ── Export JSON de l'école (plateforme → application desktop) ──────────────
// GET /api/school/export-payload — consommé par l'application desktop (exe)
// lors de la PREMIÈRE CONNEXION (« récupérer mon école depuis la plateforme »).
// L'exe authentifie le compte sur la plateforme, puis télécharge TOUTES les
// données de SON école (années, classes, matières, personnel, parents, élèves,
// notes, frais) et les écrit dans sa base LOCALE : la connexion normale
// fonctionne ensuite, même hors ligne.
//
// SÉCURITÉ : authentification obligatoire ; seules les données de l'école de
// l'admin connecté sont renvoyées (aucun cross-école). Les hash de mot de
// passe sont inclus pour que les comptes fonctionnent immédiatement en local —
// même contrat de confiance que l'import de fichier .db (hash jamais en clair).
const EXPORT_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];

// Garde-fou mémoire : au-delà, les notes sont tronquées (drapeau renvoyé).
const GRADES_MAX = 200000;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;

  const user = auth.user;
  if (!EXPORT_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Réservé aux administrateurs de l\'école.' }, { status: 403 });
  }
  const schoolId = user.role === 'SUPER_ADMIN_GLOBAL'
    ? request.nextUrl.searchParams.get('schoolId') || user.schoolId
    : user.schoolId;
  if (!schoolId) {
    return NextResponse.json({ error: 'Aucune école liée à ce compte.' }, { status: 404 });
  }

  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true, name: true, shortName: true, email: true, phone: true,
      address: true, city: true, province: true, country: true,
      subscriptionTier: true,
    },
  });
  if (!school) {
    return NextResponse.json({ error: 'École non trouvée.' }, { status: 404 });
  }

  const [schoolYears, classes, subjects, users, students, schoolFees] = await Promise.all([
    db.schoolYear.findMany({
      where: { schoolId },
      select: { id: true, label: true, startDate: true, endDate: true, isActive: true },
    }),
    db.class.findMany({
      where: { schoolId },
      select: { id: true, name: true, section: true, level: true, capacity: true, schoolYearId: true },
    }),
    db.subject.findMany({
      where: { schoolId },
      select: { id: true, name: true, code: true, coefficient: true, schoolYearId: true, classId: true },
    }),
    // Personnel + parents (+ le compte admin de l'école) — hash compris
    // (voir en-tête : contrat de confiance identique à l'import .db).
    db.user.findMany({
      where: { schoolId, role: { not: 'SUPER_ADMIN_GLOBAL' } },
      select: {
        id: true, name: true, email: true, phone: true, password: true,
        role: true, subjectName: true, isActive: true,
      },
    }),
    db.student.findMany({
      where: { schoolId },
      select: {
        id: true, matricule: true, firstName: true, lastName: true,
        dateOfBirth: true, gender: true, address: true, phone: true,
        classId: true, schoolYearId: true, parentId: true,
      },
    }),
    db.schoolFee.findMany({
      where: { schoolId },
      select: { id: true, name: true, amount: true, currency: true, trimester: true, classId: true },
    }),
  ]);

  // Notes : rattachées aux classes de l'école (filtre par ids, sans relation).
  const classIds = classes.map(c => c.id);
  const grades = classIds.length
    ? await db.grade.findMany({
        where: { classId: { in: classIds } },
        select: {
          id: true, studentId: true, subjectId: true, classId: true,
          trimester: true, score: true, comment: true, schoolYearId: true,
        },
      })
    : [];

  const gradesTruncated = grades.length > GRADES_MAX;

  return NextResponse.json({
    data: {
      school,
      schoolYears,
      classes,
      subjects,
      users,
      students,
      grades: gradesTruncated ? grades.slice(0, GRADES_MAX) : grades,
      gradesTruncated,
      schoolFees,
    },
  });
}
