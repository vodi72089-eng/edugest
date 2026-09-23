import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

// Rôles habilités à lire/configurer la connexion agent WhatsApp de l'école.
// (Avant : requireAuth seul + schoolId du query honoré pour tous → IDOR :
// un PARENT d'une autre école pouvait lire la config WhatsApp de n'importe
// quelle école via GET ?schoolId=X.)
const WHATSAPP_CONFIG_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'SECRETARY'];

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!WHATSAPP_CONFIG_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    // SÉCURITÉ : le schoolId du query n'est honoré que pour le super admin.
    const { searchParams } = new URL(request.url);
    const schoolId = user.role === 'SUPER_ADMIN_GLOBAL'
      ? (user.schoolId || searchParams.get('schoolId'))
      : user.schoolId;

    if (!schoolId) {
      return NextResponse.json({ error: 'École non spécifiée' }, { status: 400 });
    }

    const config = await db.globalApiConfig.findUnique({
      where: { key: `WHATSAPP_SCHOOL_CONFIG_${schoolId}` },
    });

    if (!config) {
      return NextResponse.json({ data: null });
    }

    const parsed = JSON.parse(config.value);
    return NextResponse.json({ data: parsed });
  } catch (error) {
    console.error('Error fetching whatsapp config:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!WHATSAPP_CONFIG_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const body = await request.json();
    const { phoneNumber } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'phoneNumber requis' },
        { status: 400 }
      );
    }

    const config = {
      phoneNumber,
      isConnected: false,
      connectedAt: null,
    };

    await db.globalApiConfig.upsert({
      where: { key: `WHATSAPP_SCHOOL_CONFIG_${user.schoolId}` },
      create: {
        key: `WHATSAPP_SCHOOL_CONFIG_${user.schoolId}`,
        value: JSON.stringify(config),
        updatedBy: user.id,
      },
      update: {
        value: JSON.stringify(config),
        updatedBy: user.id,
      },
    });

    return NextResponse.json({
      data: config,
      message: 'Configuration WhatsApp sauvegardée',
    });
  } catch (error) {
    console.error('Error saving whatsapp config:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
