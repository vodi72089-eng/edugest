import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

const WHATSAPP_CONFIG_KEY = 'WHATSAPP_OFFICIAL_NUMBER';

export async function GET() {
  try {
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

    return NextResponse.json({
      data: {
        phoneNumber: parsedValue.phoneNumber || '',
        apiKey: parsedValue.apiKey || '',
        webhookUrl: parsedValue.webhookUrl || '',
        isConfigured: !!(parsedValue.phoneNumber && parsedValue.apiKey),
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy,
      },
    });
  } catch (error) {
    console.error('[WhatsApp Config] Error fetching configuration:', error);
    return NextResponse.json(
      { error: 'Échec de la récupération de la configuration WhatsApp' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, apiKey, webhookUrl, userId } = body;

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

    // Validate the user is SUPER_ADMIN_GLOBAL
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'ID utilisateur requis pour la vérification des permissions' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 404 }
      );
    }

    if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      return NextResponse.json(
        { error: 'Seul un Super Admin Global peut configurer les paramètres WhatsApp' },
        { status: 403 }
      );
    }

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
        apiKey: apiKey.trim(),
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
      { error: 'Échec de la sauvegarde de la configuration WhatsApp' },
      { status: 500 }
    );
  }
}
