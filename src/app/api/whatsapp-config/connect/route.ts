import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { getWhatsAppLiveStatus } from '@/lib/whatsapp-agent';

// POST /api/whatsapp-config/connect
// Lie réellement l'agent WhatsApp connecté (mini-service Baileys) à l'école.
// Vérifie le statut temps-réel : si l'agent n'est pas connecté, la liaison échoue
// avec un message clair (jamais de « isConnected: true » de façade).
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.schoolId) {
      return NextResponse.json(
        { error: 'Aucune école rattachée à votre compte' },
        { status: 400 }
      );
    }

    // 1. Statut temps-réel du serveur WhatsApp
    const live = await getWhatsAppLiveStatus();
    if (live.status !== 'connected' || !live.connectedPhone) {
      return NextResponse.json(
        {
          error:
            "L'agent WhatsApp n'est pas connecté. Générez un code de parrainage dans « Connexion WhatsApp » et terminez l'appairage sur votre téléphone, puis réessayez.",
          waStatus: live.status,
        },
        { status: 503 }
      );
    }

    // 2. Liaison du numéro réellement connecté à l'école
    const configKey = `WHATSAPP_SCHOOL_CONFIG_${user.schoolId}`;
    const existing = await db.globalApiConfig.findUnique({ where: { key: configKey } });
    let parsed: Record<string, unknown> = {};
    try { parsed = existing ? JSON.parse(existing.value) : {}; } catch { /* reset */ }

    const updatedConfig = {
      ...parsed,
      phoneNumber: live.connectedPhone,
      isConnected: true,
      connectedAt: new Date().toISOString(),
    };

    await db.globalApiConfig.upsert({
      where: { key: configKey },
      create: {
        key: configKey,
        value: JSON.stringify(updatedConfig),
        description: 'Agent WhatsApp de l\'école (numéro réellement connecté)',
        updatedBy: user.id,
      },
      update: {
        value: JSON.stringify(updatedConfig),
        updatedBy: user.id,
      },
    });

    return NextResponse.json({
      data: updatedConfig,
      message: `Agent WhatsApp +${live.connectedPhone} lié à votre école`,
    });
  } catch (error) {
    console.error('Error connecting whatsapp:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
