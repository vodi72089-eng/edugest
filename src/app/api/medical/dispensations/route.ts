import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasFeatureAccess } from '@/lib/subscription';
import { generateDocCode } from '@/lib/doc-codes';

// GET /api/medical/dispensations?studentId=...&schoolId=...
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const schoolId = user.schoolId || searchParams.get('schoolId');

    if (!schoolId) {
      return NextResponse.json({ error: 'École non spécifiée' }, { status: 400 });
    }

    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { subscriptionTier: true },
    });
    const tier = school?.subscriptionTier || 'FREEMIUM';
    if (!hasFeatureAccess(tier, 'medical') && user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json(
        { error: 'Le module Médical est réservé aux offres Professionnel, Enterprise et Corporate.', tierRequired: 'PREMIUM' },
        { status: 403 }
      );
    }

    const whereClause: any = { schoolId };
    if (studentId) whereClause.studentId = studentId;

    const dispensations = await db.medicalDispensation.findMany({
      where: whereClause,
      include: {
        student: {
          select: {
            id: true,
            matricule: true,
            firstName: true,
            lastName: true,
            class: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { endDate: 'desc' },
    });

    return NextResponse.json({ data: dispensations });
  } catch (error: any) {
    console.error('[Medical Dispensations API] GET error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/medical/dispensations — Création d'une dispense médicale
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await req.json();
    const {
      studentId,
      type = 'EPS',
      startDate,
      endDate,
      reason,
      doctorName,
      certificateUrl,
    } = body;

    if (!studentId || !startDate || !endDate || !reason) {
      return NextResponse.json({ error: 'Champs obligatoires manquants (élève, dates, motif)' }, { status: 400 });
    }

    const student = await db.student.findUnique({
      where: { id: studentId },
      include: { school: { select: { id: true, subscriptionTier: true } } },
    });

    if (!student) {
      return NextResponse.json({ error: 'Élève introuvable' }, { status: 404 });
    }

    const tier = student.school.subscriptionTier || 'FREEMIUM';
    if (!hasFeatureAccess(tier, 'medical') && user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json(
        { error: 'Le module Médical est réservé aux offres Professionnel, Enterprise et Corporate.', tierRequired: 'PREMIUM' },
        { status: 403 }
      );
    }

    const dispensation = await db.medicalDispensation.create({
      data: {
        schoolId: student.schoolId,
        studentId,
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        doctorName,
        certificateUrl,
      },
      include: {
        student: {
          select: {
            id: true,
            matricule: true,
            firstName: true,
            lastName: true,
            class: { select: { id: true, name: true } },
          },
        },
      },
    });

    // ── Génération automatique du document officiel (PDF gianelli) ──
    // Chaque dispense créée produit une fiche stockée dans « Gestion des
    // fiches médicales » avec un code unique DIS-{AA}-{NNNN}.
    let medicalDocument = null;
    try {
      const docCode = await generateDocCode('DIS');
      medicalDocument = await db.medicalDocument.create({
        data: {
          docCode,
          type: 'DISPENSE_MEDICALE',
          title: `Dispense ${type} - ${dispensation.student.lastName} ${dispensation.student.firstName}`,
          schoolId: student.schoolId,
          studentId,
          sourceId: dispensation.id,
          content: JSON.stringify({
            dispensationType: type,
            startDate,
            endDate,
            reason,
            doctorName: doctorName || null,
            certificateUrl: certificateUrl || null,
          }),
          createdById: user.id,
        },
      });
    } catch (docError) {
      console.error('[Medical Dispensations API] auto-document error:', docError);
      // non bloquant : la dispense reste créée même si la fiche échoue
    }

    return NextResponse.json({ data: dispensation, document: medicalDocument, message: 'Dispense médicale enregistrée' + (medicalDocument ? ` (fiche ${medicalDocument.docCode})` : '') });
  } catch (error: any) {
    console.error('[Medical Dispensations API] POST error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
