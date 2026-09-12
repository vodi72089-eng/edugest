import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, safeParseInt, sanitizeError } from '@/lib/auth';

/**
 * GET /api/parents
 * Liste des comptes parents de l'école (inspirée de la gestion des parents
 * d'institut-gianelli, adaptée au style/data EduGest) :
 *  - recherche par nom / email / téléphone
 *  - pagination (page / limit)
 *  - pour chaque parent : ses enfants (élèves) + stats de paiement de l'année courante
 *
 * Rôles autorisés : SCHOOL_ADMIN, SECRETARY, SUPER_ADMIN_GLOBAL,
 * DIRECTION_MATERNELLE, DIRECTION_PRIMAIRE, DIRECTION_SECONDAIRE.
 *
 * Réponse : {
 *   data: {
 *     parents: [...],
 *     total, page, totalPages,
 *     schoolName,
 *     stats: { totalParents, parentsWithChildren, activeParents, totalChildren }
 *   }
 * }
 */

const PARENTS_READ_ROLES = [
  'SCHOOL_ADMIN',
  'SECRETARY',
  'SUPER_ADMIN_GLOBAL',
  'DIRECTION_MATERNELLE',
  'DIRECTION_PRIMAIRE',
  'DIRECTION_SECONDAIRE',
];

// Statuts "argent réellement encaissé" — alignés sur les statuts réellement
// utilisés dans le code (voir /api/payments POST : PENDING / PARTIAL / PAID).
// paidAmount est la somme encaissée quel que soit le statut (cf. /api/debts).
const PAID_STATUSES = ['PAID', 'PARTIAL'];

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, PARENTS_READ_ROLES);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const requestedSchoolId = searchParams.get('schoolId') || '';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 100000);
    const limit = safeParseInt(searchParams.get('limit'), 20, 1, 100);

    // Le schoolId vient du user authentifié ; seul SUPER_ADMIN_GLOBAL peut
    // en passer un explicitement via ?schoolId= (même pattern que /api/students).
    let schoolId: string | null = user.schoolId;
    if (user.role === 'SUPER_ADMIN_GLOBAL' && requestedSchoolId) {
      schoolId = requestedSchoolId;
    }

    const where: Record<string, unknown> = { role: 'PARENT' };
    if (schoolId) where.schoolId = schoolId;

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    // Année scolaire active (pour information côté UI)
    const activeYear = schoolId
      ? await db.schoolYear.findFirst({
          where: { schoolId, isActive: true },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    const [parents, total] = await Promise.all([
      db.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          profileImageUrl: true,
          isActive: true,
          createdAt: true,
        },
      }),
      db.user.count({ where }),
    ]);

    const parentIds = parents.map((p) => p.id);

    // ── Enfants (élèves non archivés) groupés par parent ────────────────────
    const children = parentIds.length
      ? await db.student.findMany({
          where: { parentId: { in: parentIds }, isArchived: false },
          select: {
            id: true,
            matricule: true,
            firstName: true,
            lastName: true,
            classId: true,
            photoUrl: true,
            parentId: true,
            class: { select: { id: true, name: true } },
          },
          orderBy: { lastName: 'asc' },
        })
      : [];

    const childIds = children.map((c) => c.id);

    // ── Paiements : paidTotal (paidAmount encaissé) + nombre de paiements ───
    const payments = childIds.length
      ? await db.paymentRecord.findMany({
          where: { studentId: { in: childIds }, status: { in: PAID_STATUSES } },
          select: { studentId: true, paidAmount: true, trimester: true },
        })
      : [];

    const paidByStudent = new Map<string, number>();
    const paidTriByStudent = new Map<string, Map<string, number>>();
    const countByStudent = new Map<string, number>();
    for (const p of payments) {
      paidByStudent.set(p.studentId, (paidByStudent.get(p.studentId) || 0) + p.paidAmount);
      countByStudent.set(p.studentId, (countByStudent.get(p.studentId) || 0) + 1);
      let triMap = paidTriByStudent.get(p.studentId);
      if (!triMap) {
        triMap = new Map<string, number>();
        paidTriByStudent.set(p.studentId, triMap);
      }
      triMap.set(p.trimester, (triMap.get(p.trimester) || 0) + p.paidAmount);
    }

    // ── Frais scolaires par classe/trimestre → dette éventuelle ─────────────
    const classIds = [...new Set(children.map((c) => c.classId))];
    const fees = classIds.length
      ? await db.schoolFee.findMany({
          where: {
            classId: { in: classIds },
            isActive: true,
            ...(schoolId ? { schoolId } : {}),
          },
          select: { classId: true, trimester: true, amount: true },
        })
      : [];
    // Plusieurs lignes de frais peuvent exister par trimestre → on somme
    const feeByClassTri = new Map<string, number>(); // clé: `${classId}|${trimester}`
    for (const f of fees) {
      const key = `${f.classId}|${f.trimester}`;
      feeByClassTri.set(key, (feeByClassTri.get(key) || 0) + f.amount);
    }

    const childrenByParent = new Map<string, typeof children>();
    for (const c of children) {
      if (!c.parentId) continue;
      const list = childrenByParent.get(c.parentId);
      if (list) list.push(c);
      else childrenByParent.set(c.parentId, [c]);
    }

    const dataParents = parents.map((p) => {
      const kids = childrenByParent.get(p.id) || [];
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        profileImageUrl: p.profileImageUrl,
        isActive: p.isActive,
        createdAt: p.createdAt,
        childrenCount: kids.length,
        children: kids.map((k) => {
          const paidTotal = paidByStudent.get(k.id) || 0;
          const paymentsCount = countByStudent.get(k.id) || 0;
          const paidTri = paidTriByStudent.get(k.id);
          let expectedTotal = 0;
          let debtTotal = 0;
          for (const [key, feeAmount] of feeByClassTri) {
            if (!key.startsWith(`${k.classId}|`)) continue;
            const tri = key.slice(k.classId.length + 1);
            expectedTotal += feeAmount;
            debtTotal += Math.max(0, feeAmount - (paidTri?.get(tri) || 0));
          }
          return {
            id: k.id,
            matricule: k.matricule,
            firstName: k.firstName,
            lastName: k.lastName,
            classId: k.classId,
            photoUrl: k.photoUrl,
            class: k.class,
            paidTotal,
            paymentsCount,
            expectedTotal,
            debtTotal,
          };
        }),
      };
    });

    // ── Stats globales de l'école (indépendantes de la recherche/pagination) ─
    const schoolScope = { role: 'PARENT' as const, ...(schoolId ? { schoolId } : {}) };
    const [totalParents, activeParents, parentsWithChildren, totalChildren] = await Promise.all([
      db.user.count({ where: schoolScope }),
      db.user.count({ where: { ...schoolScope, isActive: true } }),
      db.user.count({
        where: { ...schoolScope, students: { some: { isArchived: false } } },
      }),
      db.student.count({
        where: {
          isArchived: false,
          parent: { role: 'PARENT', ...(schoolId ? { schoolId } : {}) },
        },
      }),
    ]);

    const school = schoolId
      ? await db.school.findUnique({ where: { id: schoolId }, select: { name: true } })
      : null;

    return NextResponse.json({
      data: {
        parents: dataParents,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        schoolName: school?.name || null,
        activeYearLabel: activeYear?.label || null,
        stats: {
          totalParents,
          parentsWithChildren,
          activeParents,
          totalChildren,
        },
      },
    });
  } catch (error) {
    console.error('Error listing parents:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
