import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasFeatureAccess } from '@/lib/subscription';

// GET /api/medical/records?studentId=...&schoolId=...
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

    // Vérification de l'accès à la fonctionnalité médicale (Professionnel, Enterprise, Corporate)
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

    if (studentId) {
      const record = await db.medicalRecord.findUnique({
        where: { studentId },
        include: {
          student: {
            select: {
              id: true,
              matricule: true,
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              gender: true,
              photoUrl: true,
              class: { select: { id: true, name: true } },
              parent: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      });
      return NextResponse.json({ data: record });
    }

    // Liste des dossiers médicaux de l'école
    const records = await db.medicalRecord.findMany({
      where: {
        student: { schoolId },
      },
      include: {
        student: {
          select: {
            id: true,
            matricule: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            gender: true,
            photoUrl: true,
            class: { select: { id: true, name: true } },
            parent: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ data: records });
  } catch (error: any) {
    console.error('[Medical Records API] GET error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/medical/records — Création ou mise à jour de la fiche médicale
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await req.json();
    const {
      studentId,
      bloodGroup,
      allergies,
      chronicConditions,
      regularMedication,
      emergencyContactName,
      emergencyContactPhone,
      doctorName,
      doctorPhone,
      notes,
    } = body;

    if (!studentId) {
      return NextResponse.json({ error: 'Identifiant élève requis' }, { status: 400 });
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

    const record = await db.medicalRecord.upsert({
      where: { studentId },
      create: {
        studentId,
        bloodGroup,
        allergies,
        chronicConditions,
        regularMedication,
        emergencyContactName,
        emergencyContactPhone,
        doctorName,
        doctorPhone,
        notes,
      },
      update: {
        bloodGroup,
        allergies,
        chronicConditions,
        regularMedication,
        emergencyContactName,
        emergencyContactPhone,
        doctorName,
        doctorPhone,
        notes,
      },
    });

    return NextResponse.json({ data: record, message: 'Dossier médical enregistré avec succès' });
  } catch (error: any) {
    console.error('[Medical Records API] POST error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
