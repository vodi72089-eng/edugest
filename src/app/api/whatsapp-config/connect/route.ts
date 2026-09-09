import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const config = await db.globalApiConfig.findUnique({
      where: { key: `WHATSAPP_SCHOOL_CONFIG_${user.schoolId}` },
    });

    if (!config) {
      return NextResponse.json(
        { error: 'Configurez d\'abord le numéro WhatsApp' },
        { status: 400 }
      );
    }

    const parsed = JSON.parse(config.value);

    const updatedConfig = {
      ...parsed,
      isConnected: true,
      connectedAt: new Date().toISOString(),
    };

    await db.globalApiConfig.update({
      where: { key: `WHATSAPP_SCHOOL_CONFIG_${user.schoolId}` },
      data: { value: JSON.stringify(updatedConfig) },
    });

    return NextResponse.json({
      data: updatedConfig,
      message: 'Connexion WhatsApp établie',
    });
  } catch (error) {
    console.error('Error connecting whatsapp:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
