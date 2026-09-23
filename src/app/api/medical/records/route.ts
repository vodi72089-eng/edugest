import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, verifySchoolAccess, verifyParentAccess } from '@/lib/auth';
import { hasFeatureAccess } from '@/lib/subscription';

// Rôles habilités à consulter les dossiers médicaux (le PARENT est traité à
// part : uniquement les enfants qui lui appartiennent).
const MEDICAL_READ_ROLES = ['MEDICAL', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE', 'SECRETARY'];
const MEDICAL_WRITE_ROLES = ['MEDICAL', 'SCHOOL_ADMIN'];

// GET /api/medical/records?studentId=...&schoolId=...
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');

    if (studentId) {
      // ── SÉCURITÉ (IDOR P0) : avant, TOUT utilisateur authentifié pouvait
      // lire le dossier médical de N'IMPORTE QUEL élève (toutes écoles) en
      // passant simplement un studentId. Désormais : vérification école +
      // ownership parent + rôles habilités.
      const student = await db.student.findUnique({
        where: { id: studentId },
        select: { schoolId: true },
      });
      if (!student) {
        return NextResponse.json({ error: 'Élève introuvable' }, { status: 404 });
      }
      const isAuthorized =
        user.role === 'SUPER_ADMIN_GLOBAL' ||
        (user.role === 'PARENT' && (await verifyParentAccess(user, studentId))) ||
        (MEDICAL_READ_ROLES.includes(user.role) && verifySchoolAccess(user, student.schoolId));
      if (!isAuthorized) {
        return NextResponse.json({ error: 'Accès non autorisé à ce dossier médical' }, { status: 403 });
      }

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

    // Liste des dossiers médicaux de l'école — réservée au personnel habilité,
    // JAMAIS aux parents (qui passent par studentId + ownership).
    if (user.role === 'PARENT' || !MEDICAL_READ_ROLES.includes(user.role)) {
      if (user.role !== 'SUPER_ADMIN_GLOBAL') {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
    }
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

    // ── SÉCURITÉ (P0) : avant, TOUT utilisateur authentifié (PARENT inclus)
    // pouvait créer/modifier des dossiers médicaux cross-écoles.
    if (!MEDICAL_WRITE_ROLES.includes(user.role) && user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

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

    // ── SÉCURITÉ : l'élève doit appartenir à l'école de l'acteur.
    if (!verifySchoolAccess(user, student.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
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
