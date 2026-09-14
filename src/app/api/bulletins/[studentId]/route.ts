import { db } from '@/lib/db';
import { requireAuth, verifySchoolAccess, verifyParentAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { generateBulletinPDF, BulletinError } from '@/lib/bulletin';
import { tierAllowsParentGrades } from '@/lib/subscription';

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { studentId } = await params;
    const { searchParams } = new URL(request.url);
    const trimester = searchParams.get('trimester') || 'T1';
    const schoolId = searchParams.get('schoolId') || user.schoolId;

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    // For PARENT, verify parent-child relationship
    if (user.role === 'PARENT') {
      // Forfait sans bulletins aux parents (Freemium, Essentiel) → interface retirée
      const school = await db.school.findUnique({ where: { id: schoolId }, select: { subscriptionTier: true } });
      if (!tierAllowsParentGrades(school?.subscriptionTier || 'FREEMIUM')) {
        return NextResponse.json(
          { error: `Le forfait ${school?.subscriptionTier || 'FREEMIUM'} de votre école n'inclut pas les bulletins pour les parents. La direction doit passer au forfait Standard ou supérieur.` },
          { status: 403 }
        );
      }
      const hasAccess = await verifyParentAccess(user, studentId);
      if (!hasAccess) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
    }

    const bulletin = await generateBulletinPDF(studentId, trimester, schoolId);

    return new NextResponse(new Uint8Array(bulletin.pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${bulletin.filename}"`,
        'Content-Length': bulletin.pdfBuffer.length.toString(),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    if (error instanceof BulletinError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error generating bulletin PDF:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
