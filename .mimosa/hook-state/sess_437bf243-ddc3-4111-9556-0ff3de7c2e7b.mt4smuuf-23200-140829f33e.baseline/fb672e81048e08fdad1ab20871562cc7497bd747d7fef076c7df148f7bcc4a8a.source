import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Reset interdit en production' }, { status: 403 });
    }

    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    // Delete in correct order (respect foreign keys)
    await db.gradeRead.deleteMany();
    await db.grade.deleteMany();
    await db.disciplineRecord.deleteMany();
    await db.disciplineKeyword.deleteMany();
    await db.blacklist.deleteMany();
    await db.greylist.deleteMany();
    await db.whitelist.deleteMany();
    await db.paymentTransaction.deleteMany();
    await db.paymentRecord.deleteMany();
    await db.schoolFee.deleteMany();
    await db.communicationRead.deleteMany();
    await db.communication.deleteMany();
    await db.convocationRead.deleteMany();
    await db.convocation.deleteMany();
    await db.homeworkRead.deleteMany();
    await db.homework.deleteMany();
    await db.reportCard.deleteMany();
    await db.schoolComment.deleteMany();
    await db.notification.deleteMany();
    await db.student.deleteMany();
    await db.teacherAssignment.deleteMany();
    await db.subject.deleteMany();
    await db.class.deleteMany();
    await db.schoolYear.deleteMany();
    await db.user.deleteMany();
    await db.auditLog.deleteMany();
    await db.globalApiConfig.deleteMany();
    await db.pricingPlan.deleteMany();
    await db.paymentGatewayConfig.deleteMany();
    await db.schoolCurrencyConfig.deleteMany();
    await db.exchangeRate.deleteMany();
    await db.settingsApproval.deleteMany();
    await db.school.deleteMany();

    return NextResponse.json({ message: 'Database reset successfully' });
  } catch (error) {
    console.error('Reset error:', error);
    return NextResponse.json({ error: 'Failed to reset database' }, { status: 500 });
  }
}
