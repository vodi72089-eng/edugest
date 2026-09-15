import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, verifySchoolAccess } from '@/lib/auth';
import { hasFeatureAccess } from '@/lib/subscription';
import { registerDocument, qrDataUrlForDocument } from '@/lib/document-verify';
import { buildMedicalDocumentPDF, MedicalPdfContent } from '@/lib/pdf-medical';

/**
 * PDF d'un document médical — GET /api/medical/documents/[id]/pdf
 * Design gianelli identique aux reçus et bulletins ; QR de vérification
 * + marqueur caché EDUGEST-ID:{docCode} pour l'import dans « Vérification ».
 */

const ALLOWED_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'MEDICAL'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Accès réservé à l\'administration et au service médical' }, { status: 403 });
    }

    const { id } = await params;

    const doc = await db.medicalDocument.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            firstName: true, lastName: true, matricule: true,
            class: { select: { name: true } },
          },
        },
        school: {
          select: {
            name: true, shortName: true, email: true, phone: true,
            address: true, city: true, province: true, country: true,
            logo: true, subscriptionTier: true,
          },
        },
      },
    });

    if (!doc) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
    }

    if (!verifySchoolAccess(user, doc.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    // Gating abonnement (super admin exempté)
    if (user.role !== 'SUPER_ADMIN_GLOBAL' && !hasFeatureAccess(doc.school.subscriptionTier || 'FREEMIUM', 'medical')) {
      return NextResponse.json(
        { error: 'Module médical réservé aux offres Professionnel et plus.', tierRequired: 'PREMIUM' },
        { status: 403 }
      );
    }

    // Logo de l'école en base64
    let schoolLogoBase64: string | null = null;
    if (doc.school.logo) {
      try {
        const logoUrl = doc.school.logo.startsWith('http')
          ? doc.school.logo
          : `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${doc.school.logo}`;
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const logoBuffer = Buffer.from(await logoRes.arrayBuffer());
          const mimeType = logoUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';
          schoolLogoBase64 = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
        }
      } catch { /* logo ignoré */ }
    }

    // ── Enregistrement du document officiel + QR code unique ─────────
    const studentName = doc.student ? `${doc.student.firstName} ${doc.student.lastName}` : null;
    const docRecord = await registerDocument({
      type: 'MEDICAL',
      schoolId: doc.schoolId,
      studentId: doc.studentId,
      metadata: {
        docCode: doc.docCode,
        docType: doc.type,
        title: doc.title,
        studentName,
        matricule: doc.student?.matricule || null,
        className: doc.student?.class?.name || null,
      },
    });
    const qrCodeDataUrl = await qrDataUrlForDocument(docRecord.id);

    let content: MedicalPdfContent = {};
    try { content = JSON.parse(doc.content || '{}') as MedicalPdfContent; } catch { content = {}; }

    const pdfBuffer = buildMedicalDocumentPDF(
      {
        docCode: doc.docCode,
        type: doc.type,
        title: doc.title,
        content,
        createdAt: doc.createdAt,
      },
      doc.student,
      doc.school,
      schoolLogoBase64,
      qrCodeDataUrl
    );

    const filename = `${doc.docCode.toLowerCase()}-${doc.type.toLowerCase().replace(/_/g, '-')}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('[Medical Document PDF API] GET error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
