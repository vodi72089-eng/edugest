import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';

/**
 * GET /api/finance-overview — Situation financière consolidée (vue dédiée,
 * distincte d'« Enregistrer un paiement »).
 *
 * Renvoie en un appel :
 *  - par élève : total attendu / total payé / reste / taux atteint / nb paiements
 *  - l'historique des paiements (250 derniers, avec infos élève)
 *  - les totaux de l'école (encaissé, attendu, impayé, effectifs par atteinte)
 *
 * Réservé aux rôles finance/école : payments:read + accès école vérifié.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'payments:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // ── SÉCURITÉ (HexStrike/IDOR-CRITIQUE) : « payments:read » est aussi porté
    // par le rôle PARENT (nécessaire pour voir les paiements de SES enfants via
    // /api/payments, scellé par parentId). Sans gate de rôle explicite, un
    // parent pouvait lire la situation financière CONSOLIDÉE de toute l'école
    // (noms, matricules, montants payés/impayés, historique de 250 paiements).
    // La vue est réservée à la direction et au personnel financier de l'école.
    const FINANCE_OVERVIEW_ROLES = [
      'SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'CASHIER',
      'DIRECTION', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE',
    ];
    if (!FINANCE_OVERVIEW_ROLES.includes(user.role)) {
      return NextResponse.json(
        { error: 'Accès réservé à la direction et au personnel financier' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    let schoolId = searchParams.get('schoolId') || '';
    if (!schoolId && user.role !== 'SUPER_ADMIN_GLOBAL') {
      schoolId = user.schoolId || '';
    }
    if (!schoolId) {
      return NextResponse.json({ error: 'School ID required' }, { status: 403 });
    }
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const [students, payments] = await Promise.all([
      db.student.findMany({
        where: { schoolId },
        select: {
          id: true, firstName: true, lastName: true, matricule: true, photoUrl: true,
          class: { select: { name: true, section: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      db.paymentRecord.findMany({
        where: { schoolId },
        select: {
          id: true, studentId: true, amount: true, paidAmount: true, status: true,
          trimester: true, paymentMethod: true, referenceNumber: true,
          createdAt: true, paidAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Agrégat par élève
    const agg = new Map<string, { expected: number; paid: number; count: number; lastPaymentAt: Date | null }>();
    for (const p of payments) {
      const a = agg.get(p.studentId) || { expected: 0, paid: 0, count: 0, lastPaymentAt: null as Date | null };
      a.expected += p.amount;
      a.paid += p.paidAmount;
      a.count += 1;
      const d = p.paidAt || p.createdAt;
      if (!a.lastPaymentAt || d > a.lastPaymentAt) a.lastPaymentAt = d;
      agg.set(p.studentId, a);
    }

    const studentsOut = students.map(s => {
      const a = agg.get(s.id);
      const expected = a?.expected || 0;
      const paid = a?.paid || 0;
      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        matricule: s.matricule,
        photoUrl: s.photoUrl,
        class: s.class,
        totalExpected: expected,
        totalPaid: paid,
        totalRemaining: Math.max(0, expected - paid),
        paymentCount: a?.count || 0,
        lastPaymentAt: a?.lastPaymentAt || null,
        reachRate: expected > 0 ? Math.min(100, Math.round((paid / expected) * 100)) : paid > 0 ? 100 : 0,
      };
    });

    // Tri par montant atteint (décroissant) pour le classement
    studentsOut.sort((a, b) => b.totalPaid - a.totalPaid || b.reachRate - a.reachRate);

    const totals = {
      expected: studentsOut.reduce((s, x) => s + x.totalExpected, 0),
      collected: studentsOut.reduce((s, x) => s + x.totalPaid, 0),
      outstanding: studentsOut.reduce((s, x) => s + x.totalRemaining, 0),
      studentCount: studentsOut.length,
      paidFully: studentsOut.filter(x => x.totalExpected > 0 && x.totalPaid >= x.totalExpected).length,
      partial: studentsOut.filter(x => x.totalPaid > 0 && x.totalExpected > 0 && x.totalPaid < x.totalExpected).length,
      notStarted: studentsOut.filter(x => x.totalPaid <= 0).length,
    };

    // Historique : derniers paiements avec infos élève
    const studentById = new Map(students.map(s => [s.id, s]));
    const history = payments.slice(0, 250).map(p => {
      const s = studentById.get(p.studentId);
      return {
        id: p.id,
        studentId: p.studentId,
        studentName: s ? `${s.firstName} ${s.lastName}` : '—',
        matricule: s?.matricule || '',
        className: s?.class?.name || '',
        amount: p.amount,
        paidAmount: p.paidAmount,
        trimester: p.trimester,
        paymentMethod: p.paymentMethod,
        referenceNumber: p.referenceNumber,
        status: p.status,
        date: (p.paidAt || p.createdAt).toISOString(),
      };
    });

    return NextResponse.json({
      data: {
        students: studentsOut,
        history,
        totals,
      },
    });
  } catch (error) {
    console.error('Error building finance overview:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
