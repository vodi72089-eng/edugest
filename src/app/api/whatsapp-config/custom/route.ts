import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { getTierLimits } from '@/lib/subscription';

// GET /api/whatsapp-config/custom — Récupère la config WhatsApp et les quotas de l'école
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(req.url);
    const schoolId = user.schoolId || searchParams.get('schoolId');

    if (!schoolId) {
      return NextResponse.json({ error: 'École non spécifiée' }, { status: 400 });
    }

    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        subscriptionTier: true,
        whatsappCustomEnabled: true,
        whatsappApiType: true,
        whatsappMetaPhoneId: true,
        whatsappMetaWabaId: true,
        whatsappCustomEndpoint: true,
        whatsappMonthlyUsed: true,
        whatsappMonthlyReset: true,
      },
    });

    if (!school) {
      return NextResponse.json({ error: 'École introuvable' }, { status: 404 });
    }

    const tier = school.subscriptionTier || 'FREEMIUM';
    const limits = getTierLimits(tier);

    // Calcul du restant
    const monthlyLimit = limits.whatsappMonthly;
    const used = school.whatsappMonthlyUsed || 0;
    const remaining = school.whatsappCustomEnabled
      ? 'Illimité (Votre propre API)'
      : monthlyLimit >= 999999
      ? 'Illimité'
      : Math.max(0, monthlyLimit - used);

    return NextResponse.json({
      data: {
        schoolId: school.id,
        schoolName: school.name,
        tier,
        customEnabled: school.whatsappCustomEnabled,
        apiType: school.whatsappApiType || 'META_CLOUD',
        metaPhoneId: school.whatsappMetaPhoneId || '',
        metaWabaId: school.whatsappMetaWabaId || '',
        customEndpoint: school.whatsappCustomEndpoint || '',
        monthlyLimit,
        used,
        remaining,
        percentUsed: monthlyLimit > 0 && monthlyLimit < 999999 ? Math.min(100, Math.round((used / monthlyLimit) * 100)) : 0,
      },
    });
  } catch (error: any) {
    console.error('[WhatsApp Config Custom] GET error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/whatsapp-config/custom — Sauvegarde de la configuration WhatsApp ou Test
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await req.json();
    const {
      schoolId: requestedSchoolId,
      customEnabled,
      apiType,
      metaToken,
      metaPhoneId,
      metaWabaId,
      customEndpoint,
      action,
      testPhone,
    } = body;

    const schoolId = user.schoolId || requestedSchoolId;
    if (!schoolId) {
      return NextResponse.json({ error: 'École non spécifiée' }, { status: 400 });
    }

    // Action de test de message
    if (action === 'test') {
      if (!testPhone) {
        return NextResponse.json({ error: 'Numéro de téléphone de test requis' }, { status: 400 });
      }

      const school = await db.school.findUnique({
        where: { id: schoolId },
      });

      if (customEnabled && metaToken && metaPhoneId) {
        // Test via Meta Cloud API directement
        try {
          const metaRes = await fetch(`https://graph.facebook.com/v19.0/${metaPhoneId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${metaToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: testPhone.replace(/[^0-9]/g, ''),
              type: 'text',
              text: { body: `🎉 Test réussi ! Connexion WhatsApp API validée avec succès pour l'école ${school?.name || ''}.` },
            }),
          });
          const metaData = await metaRes.json();
          if (!metaRes.ok) {
            return NextResponse.json({
              error: `Erreur Meta Cloud API: ${metaData.error?.message || 'Identifiants invalides'}`,
            }, { status: 400 });
          }
          return NextResponse.json({ message: 'Message test envoyé avec succès via Meta Cloud API !' });
        } catch (e: any) {
          return NextResponse.json({ error: `Échec d'envoi Meta: ${e.message}` }, { status: 500 });
        }
      } else {
        return NextResponse.json({
          message: 'Veuillez renseigner le Token d\'accès et le Phone Number ID avant de tester.',
        }, { status: 400 });
      }
    }

    // Sauvegarde de la configuration
    const updateData: any = {
      whatsappCustomEnabled: !!customEnabled,
      whatsappApiType: apiType || 'META_CLOUD',
      whatsappMetaPhoneId: metaPhoneId || null,
      whatsappMetaWabaId: metaWabaId || null,
      whatsappCustomEndpoint: customEndpoint || null,
    };

    if (metaToken && metaToken.trim()) {
      updateData.whatsappMetaToken = metaToken.trim();
    }

    const updated = await db.school.update({
      where: { id: schoolId },
      data: updateData,
    });

    return NextResponse.json({
      data: updated,
      message: customEnabled
        ? 'Propre API WhatsApp activée avec succès. Aucune limite de messages sur EduGest.'
        : 'Passerelle WhatsApp partagée configurée.',
    });
  } catch (error: any) {
    console.error('[WhatsApp Config Custom] POST error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
