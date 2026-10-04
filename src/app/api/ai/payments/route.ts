import { NextRequest, NextResponse } from 'next/server';
import { auditAgentAction, requireAgent } from '@/lib/ai-agent';
import { db } from '@/lib/db';

// ─── GET /api/ai/payments — Statut et statistiques paiements ────────────────
// Query : ?schoolId=… (optionnel : global si absent) &days=… (1-90, défaut 30)

export async function GET(request: NextRequest) {
  const guard = requireAgent(request);
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId')?.trim() || '';
  const daysParam = Number.parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(90, daysParam)) : 30;
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const scope = schoolId ? { schoolId } : {};

  const [
    totalRecords,
    paidRecords,
    pendingRecords,
    collected,
    transactions,
    byGateway,
  ] = await Promise.all([
    db.paymentRecord.count({ where: scope }),
    db.paymentRecord.count({ where: { ...scope, status: 'PAID' } }),
    db.paymentRecord.count({ where: { ...scope, status: 'PENDING' } }),
    db.paymentRecord.aggregate({
      _sum: { paidAmount: true },
      where: { ...scope, paidAt: { gte: since } },
    }),
    db.paymentTransaction.findMany({
      where: { ...scope, initiatedAt: { gte: since } },
      orderBy: { initiatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        reference: true,
        gatewayType: true,
        amount: true,
        currency: true,
        status: true,
        paymentMethod: true,
        customerName: true,
        initiatedAt: true,
        completedAt: true,
      },
    }),
    db.paymentTransaction.groupBy({
      by: ['gatewayType', 'status'],
      where: { ...scope, initiatedAt: { gte: since } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  await auditAgentAction(
    'AI_AGENT_PAYMENTS_READ',
    'PaymentRecord',
    null,
    `Statistiques paiements ${days} jour(s) ${schoolId ? `(${schoolId})` : '(global)'}.`,
    schoolId || null,
  );

  return NextResponse.json({
    scope: schoolId ? { schoolId } : { global: true },
    periodDays: days,
    summary: {
      totalRecords,
      paidRecords,
      pendingRecords,
      collectedInPeriod: collected._sum.paidAmount ?? 0,
    },
    recentTransactions: transactions,
    byGatewayAndStatus: byGateway.map((g) => ({
      gateway: g.gatewayType,
      status: g.status,
      count: g._count._all,
      totalAmount: g._sum.amount ?? 0,
    })),
    timestamp: new Date().toISOString(),
  });
}
