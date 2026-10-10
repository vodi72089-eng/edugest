import { db } from '@/lib/db';
import { requireAuth, verifySchoolAccess, verifyParentAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { generateBulletinPDF, BulletinError } from '@/lib/bulletin';
import { sendWhatsAppDocument, getSchoolWhatsAppNumber, getWhatsAppLiveStatus } from '@/lib/whatsapp-agent';
import { getSchoolTier } from '@/lib/subscription-server';
import { hasFeatureAccess, tierAllowsParentGrades } from '@/lib/subscription';

// Rôles autorisés à envoyer le bulletin d'un élève aux parents via WhatsApp
const STAFF_ROLES = [
  'SUPER_ADMIN_GLOBAL',
  'ADMIN',
  'SECRETARY',
  'DIRECTION_MATERNELLE',
  'DIRECTION_PRIMAIRE',
  'DIRECTION_SECONDAIRE',
  'HEAD_TEACHER',
  'TEACHER',
];

// POST /api/bulletins/[studentId]/whatsapp
// Génère le bulletin PDF et l'envoie au parent via l'agent WhatsApp de l'école.
// Body (optionnel) : { phone: string } — numéro de remplacement (staff uniquement,
// ex. un autre tuteur). Par défaut : le parent rattaché à l'élève.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { studentId } = await params;
    const body = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const trimester = searchParams.get('trimester') || body?.trimester || 'T1';
    const schoolId = searchParams.get('schoolId') || user.schoolId;

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    // ── Forfait : MÊMES règles que la route GET jumelle (bulletins/[studentId]).
    // Cette route n'avait aucun contrôle de forfait : une école ESSENTIEL
    // produisait ET envoyait des bulletins officiels (STANDARD+) aux parents.
    if (user.role !== 'PARENT' && user.role !== 'SUPER_ADMIN_GLOBAL') {
      const tier = await getSchoolTier(user.schoolId || schoolId);
      if (!hasFeatureAccess(tier, 'report_cards')) {
        return NextResponse.json(
          { error: `Le forfait ${tier} de votre école n'inclut pas les bulletins officiels. Passez au forfait Standard ou supérieur.`, featureRequired: 'report_cards', currentTier: tier },
          { status: 403 }
        );
      }
    }
    if (user.role === 'PARENT') {
      const schoolTier = await db.school.findUnique({ where: { id: schoolId }, select: { subscriptionTier: true } });
      if (!tierAllowsParentGrades(schoolTier?.subscriptionTier || 'FREEMIUM')) {
        return NextResponse.json(
          { error: `Le forfait ${schoolTier?.subscriptionTier || 'FREEMIUM'} de votre école n'inclut pas les bulletins pour les parents.` },
          { status: 403 }
        );
      }
    }

    const isStaff = STAFF_ROLES.includes(user.role);
    const isParent = user.role === 'PARENT';

    // Parents can only send their own children's bulletin
    if (isParent) {
      const hasAccess = await verifyParentAccess(user, studentId);
      if (!hasAccess) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
    } else if (!isStaff) {
      return NextResponse.json({ error: 'Rôle non autorisé pour cette action' }, { status: 403 });
    }

    // 1. L'agent WhatsApp de l'école doit être connecté
    const live = await getWhatsAppLiveStatus();
    if (live.status !== 'connected') {
      return NextResponse.json(
        {
          error:
            "L'agent WhatsApp de l'école n'est pas connecté. Connectez-le dans « Connexion WhatsApp » (code de parrainage ou QR) puis réessayez.",
          waStatus: live.status,
        },
        { status: 503 }
      );
    }

    const schoolPhone = await getSchoolWhatsAppNumber(schoolId);
    if (!schoolPhone) {
      return NextResponse.json(
        { error: "Aucun agent WhatsApp lié à cette école. Connectez-le d'abord." },
        { status: 503 }
      );
    }

    // 2. Déterminer le destinataire
    let targetPhone: string | null = null;
    if (isParent) {
      targetPhone = user.phone || null;
    } else {
      targetPhone = body?.phone || null;
      if (!targetPhone) {
        const student = await db.student.findUnique({
          where: { id: studentId },
          select: { parentId: true },
        });
        if (student?.parentId) {
          const parent = await db.user.findUnique({
            where: { id: student.parentId },
            select: { phone: true },
          });
          targetPhone = parent?.phone || null;
        }
      }
    }

    if (!targetPhone) {
      return NextResponse.json(
        { error: "Aucun numéro WhatsApp trouvé pour le parent de cet élève. Renseignez le numéro du parent (ou passez-le dans le champ phone)." },
        { status: 400 }
      );
    }

    // 3. Générer le bulletin PDF (partagé avec le téléchargement)
    const bulletin = await generateBulletinPDF(studentId, trimester, schoolId);

    const studentName = `${bulletin.student.firstName} ${bulletin.student.lastName}`;
    const caption =
      `📊 *BULLETIN — ${bulletin.trimester}*\n\n` +
      `Élève : *${studentName}*\n` +
      `Classe : ${bulletin.className}\n` +
      `Moyenne : ${bulletin.average.toFixed(2)}/20\n` +
      `École : ${bulletin.school.name}\n\n` +
      `Le bulletin complet est joint en PDF.\n\n` +
      `_EduGest - ${bulletin.school.name}_`;

    // 4. Envoi du document via le mini-service WhatsApp
    const ok = await sendWhatsAppDocument({
      phone: targetPhone,
      fileBase64: bulletin.pdfBuffer.toString('base64'),
      filename: bulletin.filename,
      mimetype: 'application/pdf',
      caption,
      schoolId,
    });

    if (!ok) {
      return NextResponse.json(
        { error: "Échec de l'envoi WhatsApp du bulletin. Vérifiez que l'agent est toujours connecté et le numéro valide." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      data: {
        sent: true,
        phone: targetPhone,
        studentName,
        trimester: bulletin.trimester,
        average: bulletin.average,
        filename: bulletin.filename,
      },
      message: `Bulletin envoyé sur WhatsApp à ${targetPhone}`,
    });
  } catch (error) {
    if (error instanceof BulletinError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error sending bulletin via WhatsApp:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
