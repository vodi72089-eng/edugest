import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const config = await db.globalApiConfig.findUnique({
      where: { key: `WHATSAPP_SCHOOL_CONFIG_${user.schoolId}` },
    });

    if (!config) {
      return NextResponse.json({
        data: {
          isConfigured: false,
          isConnected: false,
          phoneNumber: null,
        },
      });
    }

    const parsed = JSON.parse(config.value);
    return NextResponse.json({
      data: {
        isConfigured: true,
        isConnected: parsed.isConnected || false,
        phoneNumber: parsed.phoneNumber,
        connectedAt: parsed.connectedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching whatsapp status:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
