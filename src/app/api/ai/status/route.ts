import { NextRequest, NextResponse } from 'next/server';
import { APP_NAME, AI_ENDPOINTS, getAgentQuota, requireAgent } from '@/lib/ai-agent';
import { db } from '@/lib/db';

// ─── GET /api/ai/status — Statut connexion + base de données (protégé) ──────

export async function GET(request: NextRequest) {
  const guard = requireAgent(request);
  if (guard) return guard;

  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  try {
    const [schools, students, users, classes, unreadNotifications, recentTransactions, infirmaryVisits7d] =
      await Promise.all([
        db.school.count(),
        db.student.count({ where: { isArchived: false } }),
        db.user.count(),
        db.class.count(),
        db.notification.count({ where: { isRead: false } }),
        db.paymentTransaction.count({ where: { initiatedAt: { gte: since7d } } }),
        db.infirmaryVisit.count({ where: { visitDate: { gte: since7d } } }),
      ]);

    return NextResponse.json({
      status: 'ok',
      app: APP_NAME,
      database: { status: 'up', provider: 'sqlite (prisma)' },
      runtime: {
        node: process.version,
        env: process.env.NODE_ENV ?? 'development',
        uptimeSeconds: Math.round(process.uptime()),
      },
      counts: {
        schools,
        students,
        users,
        classes,
        unreadNotifications,
        transactionsLast7d: recentTransactions,
        infirmaryVisitsLast7d: infirmaryVisits7d,
      },
      quotas: getAgentQuota(),
      endpoints: AI_ENDPOINTS,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        status: 'degraded',
        app: APP_NAME,
        database: { status: 'down', error: e instanceof Error ? e.message : 'Erreur inconnue' },
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
