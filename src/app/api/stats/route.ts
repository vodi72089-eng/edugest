import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const role = searchParams.get('role') || '';
    const schoolYearId = searchParams.get('schoolYearId') || '';

    // If no schoolId, return global stats
    if (!schoolId) {
      const [totalSchools, totalStudents, totalUsers] = await Promise.all([
        db.school.count({ where: { isActive: true } }),
        db.student.count(),
        db.user.count({ where: { isActive: true } }),
      ]);

      return NextResponse.json({
        data: {
          totalSchools,
          totalStudents,
          totalUsers,
          global: true,
        },
      });
    }

    // School-specific stats
    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    // Get active school year
    let activeYearId = schoolYearId;
    if (!activeYearId) {
      const activeYear = await db.schoolYear.findFirst({
        where: { schoolId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
      activeYearId = activeYear?.id || '';
    }

    // Student stats
    const studentWhere: Record<string, unknown> = { schoolId };
    if (activeYearId) studentWhere.schoolYearId = activeYearId;

    const [
      totalStudents,
      maleStudents,
      femaleStudents,
      excludedStudents,
      totalClasses,
      totalSubjects,
    ] = await Promise.all([
      db.student.count({ where: studentWhere }),
      db.student.count({ where: { ...studentWhere, gender: 'M' } }),
      db.student.count({ where: { ...studentWhere, gender: 'F' } }),
      db.student.count({ where: { ...studentWhere, isExcluded: true } }),
      db.class.count({ where: { schoolId, schoolYearId: activeYearId || undefined } }),
      db.subject.count({ where: { schoolId, schoolYearId: activeYearId || undefined } }),
    ]);

    // Payment stats
    const paymentWhere: Record<string, unknown> = { schoolId };
    const [
      totalPayments,
      paidPayments,
      pendingPayments,
      partialPayments,
      overduePayments,
      totalExpected,
      totalCollected,
    ] = await Promise.all([
      db.paymentRecord.count({ where: paymentWhere }),
      db.paymentRecord.count({ where: { ...paymentWhere, status: 'PAID' } }),
      db.paymentRecord.count({ where: { ...paymentWhere, status: 'PENDING' } }),
      db.paymentRecord.count({ where: { ...paymentWhere, status: 'PARTIAL' } }),
      db.paymentRecord.count({ where: { ...paymentWhere, status: 'OVERDUE' } }),
      db.paymentRecord.aggregate({ where: paymentWhere, _sum: { amount: true } }),
      db.paymentRecord.aggregate({ where: paymentWhere, _sum: { paidAmount: true } }),
    ]);

    // Discipline stats
    const disciplineWhere: Record<string, unknown> = { schoolId };
    const [
      totalDisciplineRecords,
      blacklistCount,
      greylistCount,
      whitelistCount,
    ] = await Promise.all([
      db.disciplineRecord.count({ where: disciplineWhere }),
      db.blacklist.count({ where: { schoolId } }),
      db.greylist.count({ where: { schoolId } }),
      db.whitelist.count({ where: { schoolId } }),
    ]);

    // Communication stats
    const communicationStats = await db.communication.groupBy({
      by: ['type'],
      where: { schoolId },
      _count: true,
    });

    // Class distribution
    const classDistribution = await db.class.findMany({
      where: { schoolId, schoolYearId: activeYearId || undefined },
      select: {
        name: true,
        section: true,
        _count: { select: { students: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Recent students
    const recentStudents = await db.student.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        matricule: true,
        createdAt: true,
        class: { select: { name: true } },
      },
    });

    // Payment collection rate
    const expectedAmount = totalExpected._sum.amount || 0;
    const collectedAmount = totalCollected._sum.paidAmount || 0;
    const collectionRate = expectedAmount > 0 ? (collectedAmount / expectedAmount) * 100 : 0;

    return NextResponse.json({
      data: {
        schoolId,
        schoolName: school.name,
        schoolShortName: school.shortName,
        activeYearId,
        students: {
          total: totalStudents,
          male: maleStudents,
          female: femaleStudents,
          excluded: excludedStudents,
          genderRatio: totalStudents > 0 ? `${((maleStudents / totalStudents) * 100).toFixed(1)}% / ${((femaleStudents / totalStudents) * 100).toFixed(1)}%` : 'N/A',
        },
        classes: {
          total: totalClasses,
          distribution: classDistribution,
        },
        subjects: {
          total: totalSubjects,
        },
        payments: {
          total: totalPayments,
          paid: paidPayments,
          pending: pendingPayments,
          partial: partialPayments,
          overdue: overduePayments,
          expectedAmount,
          collectedAmount,
          collectionRate: parseFloat(collectionRate.toFixed(1)),
        },
        discipline: {
          total: totalDisciplineRecords,
          blacklist: blacklistCount,
          greylist: greylistCount,
          whitelist: whitelistCount,
        },
        communications: communicationStats,
        recentStudents,
      },
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
