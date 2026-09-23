import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { runSchedule } from '@/lib/report-scheduler';

// ─── Endpoint interne du planificateur (mini-service report-scheduler) ──────
// POST /api/reports/scheduler-run  { id }
// Header requis : x-scheduler-key = REPORT_SCHEDULER_KEY (ou clé de dev par
// défaut). Le mini-service (Bun, port 3002) balaie la base et appelle cet
// endpoint quand un programme ReportSchedule arrive à échéance — toute la
// logique (collecte, PDF, envoi WhatsApp) s'exécute dans l'app Node.

const SCHEDULER_KEY = process.env.REPORT_SCHEDULER_KEY || 'edugest-scheduler-key';

export async function POST(request: NextRequest) {
  try {
    const key = request.headers.get('x-scheduler-key') || '';
    if (key !== SCHEDULER_KEY) {
      return NextResponse.json({ error: 'Clé de planificateur invalide' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as { id?: string }));
    const id = String((body as { id?: string }).id || '');
    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }

    const schedule = await db.reportSchedule.findUnique({ where: { id } });
    if (!schedule) {
      return NextResponse.json({ error: 'Programme non trouvé' }, { status: 404 });
    }
    if (!schedule.isActive) {
      return NextResponse.json({ data: { skipped: true, reason: 'Programme désactivé' } });
    }

    const result = await runSchedule(schedule);
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('Error running scheduled report:', error);
    return NextResponse.json({ error: 'Erreur interne du planificateur' }, { status: 500 });
  }
}
