import { db } from '@/lib/db';
import { requireRole, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Require SUPER_ADMIN_GLOBAL role only — this exposes all platform financial data
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city') || '';

    // Build where clause for city filter
    const schoolWhere: Record<string, unknown> = { isActive: true };
    if (city) schoolWhere.city = city;

    // ===== OVERVIEW STATS =====
    const [totalSchools, totalStudents, totalUsers, totalRevenue] = await Promise.all([
      db.school.count({ where: schoolWhere }),
      db.student.count(),
      db.user.count({ where: { isActive: true } }),
      db.paymentRecord.aggregate({
        where: { status: 'PAID' },
        _sum: { paidAmount: true },
      }),
    ]);

    // ===== SCHOOLS WITH MOST STUDENTS =====
    const schoolsWithMostStudents = await db.school.findMany({
      where: schoolWhere,
      select: {
        id: true,
        name: true,
        shortName: true,
        city: true,
        country: true,
        subscriptionTier: true,
        studentCount: true,
        classCount: true,
        _count: { select: { students: true, users: true } },
      },
      orderBy: { studentCount: 'desc' },
      take: 10,
    });

    // ===== SCHOOLS WITH FEWEST STUDENTS =====
    const schoolsWithFewestStudents = await db.school.findMany({
      where: schoolWhere,
      select: {
        id: true,
        name: true,
        shortName: true,
        city: true,
        country: true,
        subscriptionTier: true,
        studentCount: true,
        classCount: true,
        _count: { select: { students: true, users: true } },
      },
      orderBy: { studentCount: 'asc' },
      take: 10,
    });

    // ===== SCHOOLS BY CITY =====
    const schoolsByCity = await db.school.groupBy({
      by: ['city'],
      where: schoolWhere,
      _count: { id: true },
      _sum: { studentCount: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // ===== SUBSCRIPTION DISTRIBUTION =====
    const subscriptionDistribution = await db.school.groupBy({
      by: ['subscriptionTier'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // ===== STUDENTS WITH DEBTS (per school) =====
    const debtStats = await db.paymentRecord.groupBy({
      by: ['schoolId'],
      where: {
        status: { in: ['OVERDUE', 'PARTIAL', 'PENDING'] },
      },
      _count: { id: true },
      _sum: { amount: true, paidAmount: true },
    });

    // Enrich debt stats with school names
    const schoolIds = debtStats.map(d => d.schoolId);
    const debtSchools = await db.school.findMany({
      where: { id: { in: schoolIds } },
      select: { id: true, name: true, shortName: true, city: true, studentCount: true },
    });

    const debtStatsEnriched = debtStats.map(d => {
      const school = debtSchools.find(s => s.id === d.schoolId);
      return {
        schoolId: d.schoolId,
        schoolName: school?.name || 'Inconnu',
        schoolShortName: school?.shortName || '',
        city: school?.city || '',
        studentCount: school?.studentCount || 0,
        debtCount: d._count.id,
        totalOwed: (d._sum.amount || 0) - (d._sum.paidAmount || 0),
        totalAmount: d._sum.amount || 0,
        totalPaid: d._sum.paidAmount || 0,
      };
    }).sort((a, b) => b.totalOwed - a.totalOwed);

    // ===== PAID STUDENTS STATS =====
    const paidStats = await db.paymentRecord.groupBy({
      by: ['schoolId'],
      where: { status: 'PAID' },
      _count: { id: true },
      _sum: { paidAmount: true },
    });

    const paidSchools = await db.school.findMany({
      where: { id: { in: paidStats.map(p => p.schoolId) } },
      select: { id: true, name: true, shortName: true, city: true, studentCount: true },
    });

    const paidStatsEnriched = paidStats.map(p => {
      const school = paidSchools.find(s => s.id === p.schoolId);
      return {
        schoolId: p.schoolId,
        schoolName: school?.name || 'Inconnu',
        schoolShortName: school?.shortName || '',
        city: school?.city || '',
        studentCount: school?.studentCount || 0,
        paidCount: p._count.id,
        totalPaid: p._sum.paidAmount || 0,
      };
    }).sort((a, b) => b.totalPaid - a.totalPaid);

    // ===== GET CITY SCHOOL IDS (for models without school relation) =====
    const citySchoolIds = city ? (await db.school.findMany({ where: { city }, select: { id: true } })).map(s => s.id) : null;

    // ===== BLACKLIST STATS PER SCHOOL =====
    const blacklistStats = await db.blacklist.groupBy({
      by: ['schoolId'],
      _count: { id: true },
    });

    const blacklistSchools = await db.school.findMany({
      where: { id: { in: blacklistStats.map(b => b.schoolId) } },
      select: { id: true, name: true, shortName: true, city: true },
    });

    const blacklistEnriched = blacklistStats.map(b => {
      const school = blacklistSchools.find(s => s.id === b.schoolId);
      return {
        schoolId: b.schoolId,
        schoolName: school?.name || 'Inconnu',
        schoolShortName: school?.shortName || '',
        city: school?.city || '',
        blacklistCount: b._count.id,
      };
    }).sort((a, b) => b.blacklistCount - a.blacklistCount);

    // ===== ALL BLACKLIST ENTRIES =====
    const blacklistEntries = await db.blacklist.findMany({
      where: citySchoolIds ? { schoolId: { in: citySchoolIds } } : {},
      include: {
        student: { select: { firstName: true, lastName: true, matricule: true, photoUrl: true } },
      },
      orderBy: { addedAt: 'desc' },
      take: 50,
    });

    // ===== GREYLIST ENTRIES =====
    const greylistEntries = await db.greylist.findMany({
      where: citySchoolIds ? { schoolId: { in: citySchoolIds } } : {},
      include: {
        student: { select: { firstName: true, lastName: true, matricule: true, photoUrl: true } },
      },
      orderBy: { addedAt: 'desc' },
      take: 50,
    });

    // ===== RECENT ACTIVITIES =====
    const recentPaymentsRaw = await db.paymentRecord.findMany({
      where: city ? { school: { city } } : {},
      include: {
        school: { select: { name: true, shortName: true, city: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    // Enrich payment records with student data
    const paymentStudentIds = [...new Set(recentPaymentsRaw.map(p => p.studentId))];
    const paymentStudents = await db.student.findMany({
      where: { id: { in: paymentStudentIds } },
      select: { id: true, firstName: true, lastName: true, matricule: true, photoUrl: true },
    });
    const recentPayments = recentPaymentsRaw.map(p => ({
      id: p.id,
      studentId: p.studentId,
      schoolId: p.schoolId,
      amount: p.amount,
      paidAmount: p.paidAmount,
      status: p.status,
      createdAt: p.createdAt,
      student: paymentStudents.find(s => s.id === p.studentId) || null,
      school: p.school,
    }));

    const recentDiscipline = await db.disciplineRecord.findMany({
      where: citySchoolIds ? { schoolId: { in: citySchoolIds } } : {},
      include: {
        student: { select: { firstName: true, lastName: true, matricule: true, photoUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    const recentStudents = await db.student.findMany({
      where: city ? { school: { city } } : {},
      include: {
        school: { select: { name: true, shortName: true, city: true } },
        class: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    // ===== MONTHLY REVENUE (last 12 months) =====
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const monthlyRevenue = await db.paymentRecord.groupBy({
      by: ['schoolId'],
      where: {
        status: 'PAID',
        paidAt: { gte: twelveMonthsAgo },
      },
      _sum: { paidAmount: true },
      _count: { id: true },
    });

    const revenueSchools = await db.school.findMany({
      where: { id: { in: monthlyRevenue.map(r => r.schoolId) } },
      select: { id: true, name: true, shortName: true, city: true },
    });

    const revenueEnriched = monthlyRevenue.map(r => {
      const school = revenueSchools.find(s => s.id === r.schoolId);
      return {
        schoolId: r.schoolId,
        schoolName: school?.name || 'Inconnu',
        schoolShortName: school?.shortName || '',
        city: school?.city || '',
        revenue: r._sum.paidAmount || 0,
        paymentCount: r._count.id,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // ===== TOTAL OVERDUE =====
    const overdueStats = await db.paymentRecord.aggregate({
      where: { status: 'OVERDUE' },
      _sum: { amount: true },
      _count: { id: true },
    });

    const partialStats = await db.paymentRecord.aggregate({
      where: { status: 'PARTIAL' },
      _sum: { amount: true, paidAmount: true },
      _count: { id: true },
    });

    const pendingStats = await db.paymentRecord.aggregate({
      where: { status: 'PENDING' },
      _sum: { amount: true },
      _count: { id: true },
    });

    return NextResponse.json({
      data: {
        overview: {
          totalSchools,
          totalStudents,
          totalUsers,
          totalRevenue: totalRevenue._sum.paidAmount || 0,
          overdue: {
            amount: overdueStats._sum.amount || 0,
            count: overdueStats._count.id,
          },
          partial: {
            owed: (partialStats._sum.amount || 0) - (partialStats._sum.paidAmount || 0),
            count: partialStats._count.id,
          },
          pending: {
            amount: pendingStats._sum.amount || 0,
            count: pendingStats._count.id,
          },
          totalDebt: (overdueStats._sum.amount || 0) + ((partialStats._sum.amount || 0) - (partialStats._sum.paidAmount || 0)) + (pendingStats._sum.amount || 0),
        },
        schoolsWithMostStudents,
        schoolsWithFewestStudents,
        schoolsByCity,
        subscriptionDistribution,
        debtStats: debtStatsEnriched,
        paidStats: paidStatsEnriched,
        blacklistStats: blacklistEnriched,
        blacklistEntries,
        greylistEntries,
        revenueBySchool: revenueEnriched,
        recentPayments,
        recentDiscipline,
        recentStudents,
      },
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
