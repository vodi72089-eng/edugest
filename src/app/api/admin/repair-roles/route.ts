import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { repairPlatformAdminIntegrity } from '@/lib/role-repair';

/**
 * POST /api/admin/repair-roles
 *
 * Réparation structurelle des rôles administratifs (idempotente) :
 *   1. SUPER_ADMIN_GLOBAL → schoolId = null
 *   2. Chaque école a au moins un SCHOOL_ADMIN actif
 *
 * Hors du hot-path de login (coûteux en CPU) — appeler manuellement depuis
 * le dashboard admin ou via cron trigger.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) {
    return auth.error;
  }
  if (auth.user.role !== 'SUPER_ADMIN_GLOBAL') {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 });
  }

  try {
    const result = await repairPlatformAdminIntegrity();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
