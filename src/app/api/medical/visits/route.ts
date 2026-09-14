import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasFeatureAccess } from '@/lib/subscription';
import { notifyMedicalVisit } from '@/lib/whatsapp-agent';

// GET /api/medical/visits?studentId=...&schoolId=...
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

    const visits = await db.infirmaryVisit.findMany({
      where: whereClause,
      include: {
        student: {
          select: {
            id: true,
            matricule: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            class: { select: { id: true, name: true } },
            parent: { select: { id: true, name: true, phone: true } },
          },
        },
        recordedBy: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { visitDate: 'desc' },
      take: 200,
    });

    return NextResponse.json({ data: visits });
  } catch (error: any) {
    console.error('[Medical Visits API] GET error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/medical/visits — Enregistrement d'un passage à l'infirmerie
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await req.json();
    const {
      studentId,
      reason,
      symptoms,
      treatment,
      decision = 'RETURN_TO_CLASS',
      temperature,
      notes,
      notifyParent = true,
    } = body;

    if (!studentId || !reason) {
      return NextResponse.json({ error: 'Élève et motif requis' }, { status: 400 });
    }

    const student = await db.student.findUnique({
      where: { id: studentId },
      include: {
        school: { select: { id: true, name: true, subscriptionTier: true } },
        parent: { select: { id: true, name: true, phone: true } },
      },
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

    let parentNotified = false;
    let parentNotifiedAt: Date | null = null;

    // Tentative d'envoi de notification WhatsApp si demandé et si le parent a un numéro
    if (notifyParent && student.parent?.phone) {
      try {
        const sent = await notifyMedicalVisit({
          parentPhone: student.parent.phone,
          studentName: `${student.firstName} ${student.lastName}`,
          matricule: student.matricule,
          schoolName: student.school.name,
          schoolId: student.school.id,
          reason,
          decision,
          treatment,
          temperature: temperature ? parseFloat(temperature) : null,
        });
        if (sent) {
          parentNotified = true;
          parentNotifiedAt = new Date();
        }
      } catch (waErr) {
        console.error('[Medical Visit] WhatsApp notification failed:', waErr);
      }
    }

    const visit = await db.infirmaryVisit.create({
      data: {
        schoolId: student.schoolId,
        studentId,
        recordedById: user.id,
        reason,
        symptoms,
        treatment,
        decision,
        temperature: temperature ? parseFloat(temperature) : null,
        notes,
        parentNotified,
        parentNotifiedAt,
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

    return NextResponse.json({
      data: visit,
      message: 'Consultation enregistrée avec succès' + (parentNotified ? ' (Parent notifié par WhatsApp)' : ''),
    });
  } catch (error: any) {
    console.error('[Medical Visits API] POST error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
