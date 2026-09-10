import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { getWhatsAppLiveStatus } from '@/lib/whatsapp-agent';

// GET /api/whatsapp-config/status
// Statut de l'agent WhatsApp de l'école : configuration enregistrée + statut
// temps-réel du serveur Baileys (jamais de valeur de façade).
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // Statut temps-réel du mini-service WhatsApp (session appairée)
    const live = await getWhatsAppLiveStatus();

    const config = await db.globalApiConfig.findUnique({
      where: { key: `WHATSAPP_SCHOOL_CONFIG_${user.schoolId}` },
    });

    if (!config) {
      return NextResponse.json({
        data: {
          isConfigured: false,
          // Le serveur peut être connecté sans liaison explicite (auto-liaison
          // possible) — on expose quand même le statut réel.
          isConnected: live.status === 'connected',
          connectedPhone: live.connectedPhone,
          phoneNumber: live.connectedPhone,
          agentStatus: live.status,
        },
      });
    }

    const parsed = JSON.parse(config.value);
    return NextResponse.json({
      data: {
        isConfigured: true,
        // Statut RÉEL du serveur WhatsApp, pas la valeur enregistrée
        isConnected: live.status === 'connected',
        agentStatus: live.status,
        connectedPhone: live.connectedPhone,
        phoneNumber: parsed.phoneNumber,
        boundPhone: parsed.phoneNumber,
        lastConnectedAt: parsed.connectedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching whatsapp status:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
