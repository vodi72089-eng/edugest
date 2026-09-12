import { db } from '@/lib/db';
import { requirePermission, safeParseInt, sanitizeError } from '@/lib/auth';
import { getEffectiveStatus } from '@/lib/helpers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'stats:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const schoolYearId = searchParams.get('schoolYearId') || '';

    // For non-SUPER_ADMIN_GLOBAL, force schoolId to their own school
    const effectiveSchoolId = user.role !== 'SUPER_ADMIN_GLOBAL' ? user.schoolId : schoolId;

    // If no schoolId (SUPER_ADMIN_GLOBAL didn't specify one), return global stats
    if (!effectiveSchoolId) {
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
    const school = await db.school.findUnique({ where: { id: effectiveSchoolId } });
    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    // Get active school year
    let activeYearId = schoolYearId;
    if (!activeYearId) {
      const activeYear = await db.schoolYear.findFirst({
        where: { schoolId: effectiveSchoolId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
      activeYearId = activeYear?.id || '';
    }

    // Student stats
    const studentWhere: Record<string, unknown> = { schoolId: effectiveSchoolId };
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
      db.class.count({ where: { schoolId: effectiveSchoolId, schoolYearId: activeYearId || undefined } }),
      db.subject.count({ where: { schoolId: effectiveSchoolId, schoolYearId: activeYearId || undefined } }),
    ]);

    // Payment stats — compute effective status from paidAmount vs amount
    const paymentWhere: Record<string, unknown> = { schoolId: effectiveSchoolId };
    const allPayments = await db.paymentRecord.findMany({
      where: paymentWhere,
      select: { amount: true, paidAmount: true, status: true },
    });
    let totalPayments = allPayments.length;
    let paidPayments = 0;
    let pendingPayments = 0;
    let partialPayments = 0;
    let overduePayments = 0;
    let totalCollected = 0;
    for (const p of allPayments) {
      totalCollected += p.paidAmount;
      const eff = getEffectiveStatus(p.amount, p.paidAmount, p.status);
      if (eff === 'PAID') paidPayments++;
      else if (eff === 'PARTIAL') partialPayments++;
      else if (eff === 'OVERDUE') overduePayments++;
      else pendingPayments++;
    }

    // Calculate REAL expected amount from school fees × students per class
    const schoolFees = await db.schoolFee.findMany({
      where: { schoolId: effectiveSchoolId, isActive: true },
      select: { classId: true, amount: true },
    });
    const classesWithStudents = await db.class.findMany({
      where: { schoolId: effectiveSchoolId, schoolYearId: activeYearId || undefined },
      select: { id: true, _count: { select: { students: true } } },
    });
    const studentCountByClass = new Map(classesWithStudents.map(c => [c.id, c._count.students]));
    let totalExpected = 0;
    for (const fee of schoolFees) {
      const studentCount = studentCountByClass.get(fee.classId) || 0;
      totalExpected += fee.amount * studentCount;
    }

    // Discipline stats
    const disciplineWhere: Record<string, unknown> = { schoolId: effectiveSchoolId };
    const [
      totalDisciplineRecords,
      blacklistCount,
      greylistCount,
      whitelistCount,
    ] = await Promise.all([
      db.disciplineRecord.count({ where: disciplineWhere }),
      db.disciplineRecord.count({ where: { ...disciplineWhere, listType: 'BLACKLIST' } }),
      db.disciplineRecord.count({ where: { ...disciplineWhere, listType: 'GREYLIST' } }),
      db.disciplineRecord.count({ where: { ...disciplineWhere, listType: 'WHITELIST' } }),
    ]);

    // Communication stats
    const communicationStats = await db.communication.groupBy({
      by: ['type'],
      where: { schoolId: effectiveSchoolId },
      _count: true,
    });

    // Class distribution
    const classDistribution = await db.class.findMany({
      where: { schoolId: effectiveSchoolId, schoolYearId: activeYearId || undefined },
      select: {
        name: true,
        section: true,
        _count: { select: { students: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Recent students
    const recentStudents = await db.student.findMany({
      where: { schoolId: effectiveSchoolId },
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
    const expectedAmount = totalExpected;
    const collectedAmount = totalCollected;
    const collectionRate = expectedAmount > 0 ? Math.min((collectedAmount / expectedAmount) * 100, 100) : 0;

    return NextResponse.json({
      data: {
        schoolId: effectiveSchoolId,
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
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
