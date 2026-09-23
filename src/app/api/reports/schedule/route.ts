import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { nextLagosOccurrence } from '@/lib/report-data';
import { runSchedule } from '@/lib/report-scheduler';

// ─── Automatisation des rapports (système agentique) ────────────────────────
// GET    /api/reports/schedule[?schoolId=…]       → liste des programmes
// POST   /api/reports/schedule                    → créer / mettre à jour
//        body: { id?, schoolId?, intervalDays, hour, minute, recipients[],
//                sendPdf, isActive, action?: 'run' }
//        action:'run' → exécute IMMÉDIATEMENT le programme (test utilisateur)
// DELETE /api/reports/schedule?id=…               → supprimer un programme
//
// Rôles : SUPER_ADMIN_GLOBAL (école via schoolId) et SCHOOL_ADMIN (son école).
// L'heure est interprétée en Africa/Lagos (UTC+1, pas d'heure d'hiver).

const SCHEDULE_ALLOWED_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN'];

const FREQ_LABELS: Record<number, string> = {
  1: 'Chaque jour',
  2: 'Tous les 2 jours',
  3: 'Tous les 3 jours',
  7: 'Chaque semaine',
};

function freqLabel(n: number): string {
  return FREQ_LABELS[n] || `Tous les ${n} jours`;
}

function serialize(s: {
  id: string; schoolId: string; intervalDays: number; hour: number; minute: number;
  recipients: string; sendPdf: boolean; isActive: boolean; lastRunAt: Date | null;
  nextRunAt: Date | null; lastStatus: string | null; lastDetail: string | null;
  runCount: number; createdBy: string; createdByName: string;
}) {
  return {
    id: s.id,
    schoolId: s.schoolId,
    intervalDays: s.intervalDays,
    freqLabel: freqLabel(s.intervalDays),
    hour: s.hour,
    minute: s.minute,
    timeLabel: `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`,
    recipients: JSON.parse(s.recipients || '[]') as string[],
    sendPdf: s.sendPdf,
    isActive: s.isActive,
    lastRunAt: s.lastRunAt?.toISOString() || null,
    nextRunAt: s.nextRunAt?.toISOString() || null,
    lastStatus: s.lastStatus,
    lastDetail: s.lastDetail,
    runCount: s.runCount,
    createdBy: s.createdBy,
    createdByName: s.createdByName,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    if (!SCHEDULE_ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    let schoolId: string;
    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      const requested = new URL(request.url).searchParams.get('schoolId') || '';
      if (!requested) return NextResponse.json({ error: 'schoolId requis' }, { status: 400 });
      if (!verifySchoolAccess(user, requested)) {
        return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
      }
      schoolId = requested;
    } else {
      if (!user.schoolId) return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      schoolId = user.schoolId;
    }

    const rows = await db.reportSchedule.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ data: rows.map(serialize) });
  } catch (error) {
    console.error('Error listing report schedules:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    if (!SCHEDULE_ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }
    if (!user.schoolId && user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const b = body as {
      id?: string; schoolId?: string; intervalDays?: number; hour?: number; minute?: number;
      recipients?: string[]; sendPdf?: boolean; isActive?: boolean; action?: string;
    };

    // ── École scellée ───────────────────────────────────────────────────────
    let schoolId: string;
    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      schoolId = String(b.schoolId || '');
      if (!schoolId) return NextResponse.json({ error: 'schoolId requis' }, { status: 400 });
      if (!verifySchoolAccess(user, schoolId)) {
        return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
      }
    } else {
      schoolId = user.schoolId as string;
      if (b.schoolId && b.schoolId !== schoolId) {
        return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
      }
    }

    // ── Exécution immédiate (bouton « Exécuter maintenant ») ────────────────
    if (b.action === 'run') {
      if (!b.id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
      const schedule = await db.reportSchedule.findFirst({
        where: { id: b.id, schoolId },
      });
      if (!schedule) return NextResponse.json({ error: 'Programme non trouvé' }, { status: 404 });
      const result = await runSchedule(schedule);
      const updated = await db.reportSchedule.findUnique({ where: { id: schedule.id } });
      return NextResponse.json({
        data: { run: result, schedule: updated ? serialize(updated) : null },
      });
    }

    // ── Création / mise à jour ──────────────────────────────────────────────
    const intervalDays = Math.max(1, Math.min(31, Math.round(Number(b.intervalDays) || 1)));
    const hour = Math.max(0, Math.min(23, Math.round(Number(b.hour ?? 8))));
    const minute = Math.max(0, Math.min(59, Math.round(Number(b.minute ?? 0))));
    const recipients = Array.isArray(b.recipients)
      ? b.recipients.map((x) => String(x).trim()).filter((x) => x.length >= 6).slice(0, 10)
      : [];
    const sendPdf = b.sendPdf !== false;
    const isActive = b.isActive !== false;

    if (!recipients.length) {
      return NextResponse.json({ error: 'Au moins un numéro WhatsApp destinataire est requis' }, { status: 400 });
    }

    const payload = {
      schoolId,
      createdBy: user.id,
      createdByName: user.name,
      intervalDays,
      hour,
      minute,
      recipients: JSON.stringify(recipients),
      sendPdf,
      isActive,
    };

    let schedule;
    if (b.id) {
      const existing = await db.reportSchedule.findFirst({ where: { id: b.id, schoolId } });
      if (!existing) return NextResponse.json({ error: 'Programme non trouvé' }, { status: 404 });
      // nextRunAt recalculé si l'heure/fréquence change, conservé sinon
      const timeChanged =
        existing.hour !== hour || existing.minute !== minute || existing.intervalDays !== intervalDays;
      schedule = await db.reportSchedule.update({
        where: { id: existing.id },
        data: {
          ...payload,
          nextRunAt: isActive
            ? (timeChanged || !existing.nextRunAt
                ? nextLagosOccurrence(hour, minute)
                : existing.nextRunAt)
            : null,
        },
      });
    } else {
      schedule = await db.reportSchedule.create({
        data: {
          ...payload,
          nextRunAt: isActive ? nextLagosOccurrence(hour, minute) : null,
        },
      });
    }

    return NextResponse.json({ data: serialize(schedule) });
  } catch (error) {
    console.error('Error saving report schedule:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    if (!SCHEDULE_ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const schedule = await db.reportSchedule.findUnique({ where: { id } });
    if (!schedule) return NextResponse.json({ error: 'Programme non trouvé' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN_GLOBAL' && schedule.schoolId !== user.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }
    await db.reportSchedule.delete({ where: { id } });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error('Error deleting report schedule:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
