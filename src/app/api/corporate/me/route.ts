import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';

// ═══════════════════════════════════════════════════════════════════════════
// ESPACE CORPORATE (/api/corporate/me)
// Le compte corporate (CORPORATE_ADMIN) voit TOUTES SES écoles avec les
// statistiques agrégées — c'est ce qui distingue un compte corporate d'un
// compte école : il peut avoir PLUSIEURS écoles rattachées.
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['CORPORATE_ADMIN', 'SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // Le compte corporate est rattaché via CorporateUser (schoolId = null)
    const membership = await db.corporateUser.findFirst({
      where: { userId: user.id },
      include: {
        corporate: {
          include: {
            schools: {
              include: { school: { select: { id: true, name: true, shortName: true, city: true, province: true, logo: true, subscriptionTier: true, subscriptionStatus: true, studentCount: true, classCount: true, isActive: true } } },
            },
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Aucun espace corporate rattaché à ce compte' }, { status: 404 });
    }
    const corporate = membership.corporate;

    // Statistiques réelles par école (les comptes : élèves, classes, personnel,
    // paiements encaissés, incidents de discipline, tickets ouverts)
    const schoolIds = corporate.schools.map(cs => cs.school.id);
    const [studentCounts, classCounts, staffCounts, paidAgg, disciplineCounts, openTickets] = await Promise.all([
      db.student.groupBy({ by: ['schoolId'], where: { schoolId: { in: schoolIds } }, _count: true }),
      db.class.groupBy({ by: ['schoolId'], where: { schoolId: { in: schoolIds } }, _count: true }),
      db.user.groupBy({ by: ['schoolId'], where: { schoolId: { in: schoolIds }, role: { not: 'PARENT' } }, _count: true }),
      db.paymentRecord.groupBy({ by: ['schoolId'], where: { schoolId: { in: schoolIds }, status: 'PAID' }, _sum: { paidAmount: true } }),
      db.disciplineRecord.groupBy({ by: ['schoolId'], where: { schoolId: { in: schoolIds } }, _count: true }).catch(() => [] as { schoolId: string; _count: number }[]),
      db.supportTicket.groupBy({ by: ['schoolId'], where: { corporateId: corporate.id, status: { in: ['OPEN', 'IN_PROGRESS'] } }, _count: true }).catch(() => [] as { schoolId: string | null; _count: number }[]),
    ]);

    const pick = (arr: { schoolId: string | null; _count: number | { paidAmount: number | null } }[], id: string, sum = false) => {
      const row = arr.find(r => r.schoolId === id);
      if (!row) return 0;
      return sum ? Number(row._count) || 0 : row._count as number;
    };

    const schools = corporate.schools.map(cs => {
      const s = cs.school;
      const paid = paidAgg.find(p => p.schoolId === s.id)?._sum.paidAmount || 0;
      return {
        id: s.id,
        name: s.name,
        shortName: s.shortName,
        city: s.city,
        province: s.province,
        logo: s.logo,
        subscriptionTier: s.subscriptionTier,
        subscriptionStatus: s.subscriptionStatus,
        isActive: s.isActive,
        stats: {
          students: studentCounts.find(c => c.schoolId === s.id)?._count || 0,
          classes: classCounts.find(c => c.schoolId === s.id)?._count || 0,
          staff: staffCounts.find(c => c.schoolId === s.id)?._count || 0,
          paidAmount: Number(paid) || 0,
          disciplineIncidents: disciplineCounts.find(c => c.schoolId === s.id)?._count || 0,
          openTickets: openTickets.find(t => t.schoolId === s.id)?._count || 0,
        },
      };
    });

    // Totaux agrégés de l'entreprise (multi-écoles = la valeur corporate)
    const totals = schools.reduce(
      (acc, s) => ({
        schools: acc.schools + 1,
        students: acc.students + s.stats.students,
        classes: acc.classes + s.stats.classes,
        staff: acc.staff + s.stats.staff,
        paidAmount: acc.paidAmount + s.stats.paidAmount,
        disciplineIncidents: acc.disciplineIncidents + s.stats.disciplineIncidents,
        openTickets: acc.openTickets + (s.stats.openTickets || 0),
      }),
      { schools: 0, students: 0, classes: 0, staff: 0, paidAmount: 0, disciplineIncidents: 0, openTickets: 0 }
    );

    return NextResponse.json({
      data: {
        corporate: {
          id: corporate.id,
          name: corporate.name,
          contactName: corporate.contactName,
          contactEmail: corporate.contactEmail,
          contactPhone: corporate.contactPhone,
          city: corporate.city,
          status: corporate.status,
          memberRole: membership.role,
        },
        schools,
        totals,
      },
    });
  } catch (error) {
    console.error('[Corporate:me] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
