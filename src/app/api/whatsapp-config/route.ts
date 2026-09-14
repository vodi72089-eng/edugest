import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || user.schoolId;

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
