import { NextRequest, NextResponse } from 'next/server';
import { auditAgentAction, consumeAgentQuota, getAgentQuota, requireAgent } from '@/lib/ai-agent';
import { collectDetailedReport } from '@/lib/report-data';
import { buildReportPdf } from '@/lib/report-pdf';
import { getEduGestLogoBuffer, fetchSchoolLogoBuffer } from '@/lib/pdf-brand';
import { db } from '@/lib/db';

// ─── GET /api/ai/pdf — Génération PDF (rapport détaillé) pour l'agent IA ────
// Query : ?schoolId=… (requis) &days=… (1-31, défaut 7)
// Renvoie un PDF A4 (bandeau vert/or) avec effectifs, paiements, discipline,
// présences, communications… Réutilise le moteur PDF interne de la plateforme.

export async function GET(request: NextRequest) {
  const guard = requireAgent(request);
  if (guard) return guard;

  if (!consumeAgentQuota()) {
    return NextResponse.json({ error: 'Quota quotidien atteint.', quotas: getAgentQuota() }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId')?.trim() || '';
  if (!schoolId) {
    return NextResponse.json({ error: 'Paramètre « schoolId » requis.' }, { status: 400 });
  }

  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, logo: true },
  });
  if (!school) {
    return NextResponse.json({ error: 'École introuvable.' }, { status: 404 });
  }

  const daysParam = Number.parseInt(searchParams.get('days') || '7', 10);
  const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(31, daysParam)) : 7;

  const data = await collectDetailedReport(schoolId, days);

  const [schoolLogo, eduGestLogo] = await Promise.all([
    fetchSchoolLogoBuffer(school.logo).catch(() => null),
    Promise.resolve(getEduGestLogoBuffer()),
  ]);
  const assets = { schoolLogo, eduGestLogo };

  const pdf = await buildReportPdf(data, 'AGENT IA', assets);

  await auditAgentAction(
    'AI_AGENT_PDF_GENERATE',
    'DetailedReport',
    schoolId,
    `Rapport PDF ${days} jour(s) généré pour « ${school.name} ».`,
    schoolId,
    { days },
  );

  const fileName = `rapport-${school.name.replace(/[^a-zA-Z0-9]+/g, '-')}-${days}j.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
