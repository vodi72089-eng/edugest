import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { collectCashierReport } from '@/lib/cashier-report';

// ─── Aperçu du rapport de CAISSE ────────────────────────────────────────────
// GET /api/reports/cashier?intervalDays=3&hour=12&minute=0[&schoolId=…]
// Renvoie le rapport de caisse tel qu'il sera généré à l'heure programmée :
// paiements de l'intervalle jusqu'à l'heure d'envoi − 1 minute (12h00 →
// 11h59:59), décompte par heure, dettes et cas graves ↔ moindres.
// Rôles : SUPER_ADMIN_GLOBAL (école via schoolId), SCHOOL_ADMIN et CASHIER
// (leur école).

const CASHIER_REPORT_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'CASHIER'];

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    if (!CASHIER_REPORT_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const sp = new URL(request.url).searchParams;
    let schoolId: string;
    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      schoolId = sp.get('schoolId') || '';
      if (!schoolId) return NextResponse.json({ error: 'schoolId requis' }, { status: 400 });
      if (!verifySchoolAccess(user, schoolId)) {
        return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
      }
    } else {
      if (!user.schoolId) return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      schoolId = user.schoolId;
      const requested = sp.get('schoolId');
      if (requested && requested !== schoolId) {
        return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
      }
    }

    const intervalDays = Math.max(1, Math.min(31, Math.round(Number(sp.get('intervalDays')) || 1)));
    const hour = Math.max(0, Math.min(23, Math.round(Number(sp.get('hour') ?? 12))));
    const minute = Math.max(0, Math.min(59, Math.round(Number(sp.get('minute') ?? 0))));

    const data = await collectCashierReport(schoolId, intervalDays, hour, minute);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error collecting cashier report:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
