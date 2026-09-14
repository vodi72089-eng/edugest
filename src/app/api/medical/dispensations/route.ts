import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasFeatureAccess } from '@/lib/subscription';

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

    return NextResponse.json({ data: dispensation, message: 'Dispense médicale enregistrée' });
  } catch (error: any) {
    console.error('[Medical Dispensations API] POST error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
