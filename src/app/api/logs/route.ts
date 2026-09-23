import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, sanitizeError } from '@/lib/auth';
import { listAuditLogs } from '@/lib/audit';

// ─── /api/logs — journal d'activité plateforme (SAG + support) ─────────────
// Les entrées sont reliées à l'agent Hermes en PRODUCTION (webhook + HMAC,
// clé GlobalApiConfig « HERMES_AGENT_CONFIG »). En dev : lecture locale.

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'logs:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 300);

    const logs = await listAuditLogs({ action, limit });

    // Configuration Hermes renvoyée pour l'affichage admin (jamais le secret)
    const hermesRow = await import('@/lib/db').then(({ db }) =>
      db.globalApiConfig.findUnique({ where: { key: 'HERMES_AGENT_CONFIG' } })
    );
    let hermes: { enabled: boolean; webhookUrl: string } | null = null;
    try {
      if (hermesRow) {
        const parsed = JSON.parse(hermesRow.value);
        hermes = { enabled: !!parsed?.enabled, webhookUrl: parsed?.webhookUrl || '' };
      }
    } catch { /* ignore */ }

    return NextResponse.json({
      data: logs.map(l => ({
        id: l.id,
        userId: l.userId,
        userName: l.userName,
        userRole: l.userRole,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        details: l.details,
        schoolId: l.schoolId,
        meta: l.meta ? (() => { try { return JSON.parse(l.meta); } catch { return null; } })() : null,
        createdAt: l.createdAt,
      })),
      hermes,
      viewer: { role: user.role },
    });
  } catch (error) {
    console.error('[Logs] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// PUT /api/logs — configure le relais Hermes (SAG uniquement, prévu PROD)
// Body: { webhookUrl, secret?, enabled } — secret stocké, jamais renvoyé
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'logs:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json({ error: 'Réservé à l\u2019administrateur plateforme' }, { status: 403 });
    }

    const body = await request.json();
    const value = JSON.stringify({
      enabled: !!body.enabled,
      webhookUrl: String(body.webhookUrl || ''),
      secret: String(body.secret || ''),
      minLevel: String(body.minLevel || 'INFO'),
    });
    const { db } = await import('@/lib/db');
    const existing = await db.globalApiConfig.findUnique({ where: { key: 'HERMES_AGENT_CONFIG' } });
    if (existing) {
      const prev = JSON.parse(existing.value || '{}');
      // Conserver le secret existant si non fourni
      if (!body.secret && prev.secret) {
        await db.globalApiConfig.update({
          where: { key: 'HERMES_AGENT_CONFIG' },
          data: { value: JSON.stringify({ ...JSON.parse(value), secret: prev.secret }), updatedBy: user.id },
        });
      } else {
        await db.globalApiConfig.update({ where: { key: 'HERMES_AGENT_CONFIG' }, data: { value, updatedBy: user.id } });
      }
    } else {
      await db.globalApiConfig.create({ data: { key: 'HERMES_AGENT_CONFIG', value, updatedBy: user.id } });
    }
    const { invalidateHermesConfigCache } = await import('@/lib/audit');
    invalidateHermesConfigCache();

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error('[Logs] PUT error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
