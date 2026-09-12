import { db } from '@/lib/db';
import { requireRole, sanitizeError } from '@/lib/auth';
import { getEffectiveStatus } from '@/lib/helpers';
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
    const [totalSchools, totalStudents, totalUsers] = await Promise.all([
      db.school.count({ where: schoolWhere }),
      db.student.count(),
      db.user.count({ where: { isActive: true } }),
    ]);

    // Fetch all payments once and compute effective status from amounts
    const allPayments = await db.paymentRecord.findMany({
      where: city ? { school: { city } } : {},
      select: { id: true, schoolId: true, studentId: true, amount: true, paidAmount: true, status: true, paidAt: true },
    });
    const paymentsWithEffective = allPayments.map(p => ({
      ...p,
      effectiveStatus: getEffectiveStatus(p.amount, p.paidAmount, p.status),
    }));

    // ===== SCHOOLS WITH MOST STUDENTS =====
    const schoolsWithMostStudentsRaw = await db.school.findMany({
      where: schoolWhere,
      select: {
        id: true,
        name: true,
        shortName: true,
        city: true,
        country: true,
        subscriptionTier: true,
        _count: { select: { students: true, classes: true, users: true } },
      },
      orderBy: { students: { _count: 'desc' } },
      take: 10,
    });
    const schoolsWithMostStudents = schoolsWithMostStudentsRaw.map(s => ({
      ...s,
      studentCount: s._count.students,
      classCount: s._count.classes,
    }));

    // ===== SCHOOLS WITH FEWEST STUDENTS =====
    const schoolsWithFewestStudentsRaw = await db.school.findMany({
      where: schoolWhere,
      select: {
        id: true,
        name: true,
        shortName: true,
        city: true,
        country: true,
        subscriptionTier: true,
        _count: { select: { students: true, classes: true, users: true } },
      },
      orderBy: { students: { _count: 'asc' } },
      take: 10,
    });
    const schoolsWithFewestStudents = schoolsWithFewestStudentsRaw.map(s => ({
      ...s,
      studentCount: s._count.students,
      classCount: s._count.classes,
    }));

    // ===== SCHOOLS BY CITY (real student counts) =====
    const citySchools = await db.school.findMany({
      where: schoolWhere,
      select: { city: true, _count: { select: { students: true } } },
    });
    const cityMap = new Map<string, { id: number; studentCount: number }>();
    for (const s of citySchools) {
      const cur = cityMap.get(s.city) || { id: 0, studentCount: 0 };
      cur.id += 1;
      cur.studentCount += s._count.students;
      cityMap.set(s.city, cur);
    }
    const schoolsByCity = [...cityMap.entries()]
      .map(([city, v]) => ({ city, _count: { id: v.id }, _sum: { studentCount: v.studentCount } }))
      .sort((a, b) => b._count.id - a._count.id);

    // ===== SUBSCRIPTION DISTRIBUTION =====
    const subscriptionDistribution = await db.school.groupBy({
      by: ['subscriptionTier'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // ===== STUDENTS WITH DEBTS (per school) — computed from effective status =====
    const debtPayments = paymentsWithEffective.filter(p => ['OVERDUE', 'PARTIAL', 'PENDING'].includes(p.effectiveStatus));
    const debtBySchool = new Map<string, { debtCount: number; totalOwed: number; totalAmount: number; totalPaid: number }>();
    for (const p of debtPayments) {
      const cur = debtBySchool.get(p.schoolId) || { debtCount: 0, totalOwed: 0, totalAmount: 0, totalPaid: 0 };
      cur.debtCount++;
      cur.totalAmount += p.amount;
      cur.totalPaid += p.paidAmount;
      cur.totalOwed += p.amount - p.paidAmount;
      debtBySchool.set(p.schoolId, cur);
    }

    // Enrich debt stats with school names
    const schoolIds = [...debtBySchool.keys()];
    const debtSchools = await db.school.findMany({
      where: { id: { in: schoolIds } },
      select: { id: true, name: true, shortName: true, city: true, _count: { select: { students: true } } },
    });

    const debtStatsEnriched = [...debtBySchool.entries()].map(([schoolId, v]) => {
      const school = debtSchools.find(s => s.id === schoolId);
      return {
        schoolId,
        schoolName: school?.name || 'Inconnu',
        schoolShortName: school?.shortName || '',
        city: school?.city || '',
        studentCount: school?._count?.students || 0,
        debtCount: v.debtCount,
        totalOwed: v.totalOwed,
        totalAmount: v.totalAmount,
        totalPaid: v.totalPaid,
      };
    }).sort((a, b) => b.totalOwed - a.totalOwed);

    // ===== PAID STUDENTS STATS — computed from effective status =====
    const paidPayments = paymentsWithEffective.filter(p => p.effectiveStatus === 'PAID');
    const paidBySchool = new Map<string, { paidCount: number; totalPaid: number }>();
    for (const p of paidPayments) {
      const cur = paidBySchool.get(p.schoolId) || { paidCount: 0, totalPaid: 0 };
      cur.paidCount++;
      cur.totalPaid += p.paidAmount;
      paidBySchool.set(p.schoolId, cur);
    }

    const paidSchools = await db.school.findMany({
      where: { id: { in: [...paidBySchool.keys()] } },
      select: { id: true, name: true, shortName: true, city: true, _count: { select: { students: true } } },
    });

    const paidStatsEnriched = [...paidBySchool.entries()].map(([schoolId, v]) => {
      const school = paidSchools.find(s => s.id === schoolId);
      return {
        schoolId,
        schoolName: school?.name || 'Inconnu',
        schoolShortName: school?.shortName || '',
        city: school?.city || '',
        studentCount: school?._count?.students || 0,
        paidCount: v.paidCount,
        totalPaid: v.totalPaid,
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
    const recentPaymentsRaw = paymentsWithEffective
      .sort((a, b) => (b.paidAt?.getTime() || 0) - (a.paidAt?.getTime() || 0))
      .slice(0, 15);

    // Enrich payment records with student data
    const paymentStudentIds = [...new Set(recentPaymentsRaw.map(p => p.studentId).filter(Boolean))];
    const paymentStudents = await db.student.findMany({
      where: { id: { in: paymentStudentIds } },
      select: { id: true, firstName: true, lastName: true, matricule: true, photoUrl: true },
    });

    // Get school data for recent payments
    const recentPaymentSchoolIds = [...new Set(recentPaymentsRaw.map(p => p.schoolId))];
    const recentPaymentSchools = await db.school.findMany({
      where: { id: { in: recentPaymentSchoolIds } },
      select: { id: true, name: true, shortName: true, city: true },
    });

    const recentPayments = recentPaymentsRaw.map(p => ({
      id: p.id,
      studentId: p.studentId,
      schoolId: p.schoolId,
      amount: p.amount,
      paidAmount: p.paidAmount,
      status: p.effectiveStatus,
      createdAt: p.paidAt || new Date(),
      student: paymentStudents.find(s => s.id === p.studentId) || null,
      school: recentPaymentSchools.find(s => s.id === p.schoolId) || null,
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

    // ===== MONTHLY REVENUE (last 12 months) — computed from effective status =====
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const recentPaidPayments = paymentsWithEffective.filter(
      p => p.effectiveStatus === 'PAID' && p.paidAt && p.paidAt >= twelveMonthsAgo
    );
    const revenueBySchool = new Map<string, { revenue: number; paymentCount: number }>();
    for (const p of recentPaidPayments) {
      const cur = revenueBySchool.get(p.schoolId) || { revenue: 0, paymentCount: 0 };
      cur.revenue += p.paidAmount;
      cur.paymentCount++;
      revenueBySchool.set(p.schoolId, cur);
    }

    const revenueSchools = await db.school.findMany({
      where: { id: { in: [...revenueBySchool.keys()] } },
      select: { id: true, name: true, shortName: true, city: true },
    });

    const revenueEnriched = [...revenueBySchool.entries()].map(([schoolId, v]) => {
      const school = revenueSchools.find(s => s.id === schoolId);
      return {
        schoolId,
        schoolName: school?.name || 'Inconnu',
        schoolShortName: school?.shortName || '',
        city: school?.city || '',
        revenue: v.revenue,
        paymentCount: v.paymentCount,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // ===== TOTAL OVERDUE/PARTIAL/PENDING — computed from effective status =====
    const overduePayments = paymentsWithEffective.filter(p => p.effectiveStatus === 'OVERDUE');
    const overdueStats = {
      amount: overduePayments.reduce((s, p) => s + p.amount, 0),
      count: overduePayments.length,
    };

    const partialPayments = paymentsWithEffective.filter(p => p.effectiveStatus === 'PARTIAL');
    const partialStats = {
      amount: partialPayments.reduce((s, p) => s + p.amount, 0),
      paidAmount: partialPayments.reduce((s, p) => s + p.paidAmount, 0),
      count: partialPayments.length,
    };

    const pendingPaymentsList = paymentsWithEffective.filter(p => p.effectiveStatus === 'PENDING');
    const pendingStats = {
      amount: pendingPaymentsList.reduce((s, p) => s + p.amount, 0),
      count: pendingPaymentsList.length,
    };

    // ===== TOTAL REVENUE (from effective PAID payments) =====
    const totalPaidPayments = paymentsWithEffective.filter(p => p.effectiveStatus === 'PAID');
    const totalRevenueComputed = totalPaidPayments.reduce((s, p) => s + p.paidAmount, 0);

    return NextResponse.json({
      data: {
        overview: {
          totalSchools,
          totalStudents,
          totalUsers,
          totalRevenue: totalRevenueComputed,
          overdue: {
            amount: overdueStats.amount,
            count: overdueStats.count,
          },
          partial: {
            owed: partialStats.amount - partialStats.paidAmount,
            count: partialStats.count,
          },
          pending: {
            amount: pendingStats.amount,
            count: pendingStats.count,
          },
          totalDebt: overdueStats.amount + (partialStats.amount - partialStats.paidAmount) + pendingStats.amount,
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
