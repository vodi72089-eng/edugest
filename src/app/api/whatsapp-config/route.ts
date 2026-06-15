import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';

const WHATSAPP_CONFIG_KEY = 'WHATSAPP_OFFICIAL_NUMBER';

/**
 * Masks an API key, showing only the last 4 characters, replacing the rest with asterisks.
 */
function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length <= 4) {
    return apiKey ? '****' : '';
  }
  return '*'.repeat(apiKey.length - 4) + apiKey.slice(-4);
}

// GET - require SUPER_ADMIN_GLOBAL role. CRITICAL: Mask the API key in response.
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const config = await db.globalApiConfig.findUnique({
      where: { key: WHATSAPP_CONFIG_KEY },
    });

    if (!config) {
      return NextResponse.json({
        data: {
          phoneNumber: '',
          apiKey: '',
          webhookUrl: '',
          isConfigured: false,
        },
      });
    }

    // Parse the JSON value stored in the config
    let parsedValue: { phoneNumber?: string; apiKey?: string; webhookUrl?: string } = {};
    try {
      parsedValue = JSON.parse(config.value);
    } catch {
      // If value is not valid JSON, treat it as just a phone number
      parsedValue = { phoneNumber: config.value };
    }

    const rawApiKey = parsedValue.apiKey || '';

    return NextResponse.json({
      data: {
        phoneNumber: parsedValue.phoneNumber || '',
        apiKey: maskApiKey(rawApiKey),
        webhookUrl: parsedValue.webhookUrl || '',
        isConfigured: !!(parsedValue.phoneNumber && rawApiKey),
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy,
      },
    });
  } catch (error) {
    console.error('[WhatsApp Config] Error fetching configuration:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

// POST/PUT - require SUPER_ADMIN_GLOBAL role. Derive userId from session, not request body.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { phoneNumber, apiKey, webhookUrl } = body;

    // Validate required fields
    if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
      return NextResponse.json(
        { error: 'Le numéro de téléphone WhatsApp est requis' },
        { status: 400 }
      );
    }

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return NextResponse.json(
        { error: 'La clé API WhatsApp est requise' },
        { status: 400 }
      );
    }

    // CRITICAL: Derive userId from the authenticated session, NOT from request body
    // The user is already authenticated and verified as SUPER_ADMIN_GLOBAL above

    // Store the config as a JSON string in the value field
    const configValue = JSON.stringify({
      phoneNumber: phoneNumber.trim(),
      apiKey: apiKey.trim(),
      webhookUrl: (webhookUrl && typeof webhookUrl === 'string') ? webhookUrl.trim() : '',
    });

    // Upsert the configuration
    const config = await db.globalApiConfig.upsert({
      where: { key: WHATSAPP_CONFIG_KEY },
      update: {
        value: configValue,
        description: 'Configuration du numéro WhatsApp officiel pour EduGest',
        updatedBy: user.name,
        updatedAt: new Date(),
      },
      create: {
        key: WHATSAPP_CONFIG_KEY,
        value: configValue,
        description: 'Configuration du numéro WhatsApp officiel pour EduGest',
        updatedBy: user.name,
      },
    });

    return NextResponse.json({
      data: {
        phoneNumber: phoneNumber.trim(),
        apiKey: maskApiKey(apiKey.trim()),
        webhookUrl: (webhookUrl && typeof webhookUrl === 'string') ? webhookUrl.trim() : '',
        isConfigured: true,
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy,
      },
      message: 'Configuration WhatsApp mise à jour avec succès',
    });
  } catch (error) {
    console.error('[WhatsApp Config] Error saving configuration:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
