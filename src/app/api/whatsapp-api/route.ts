import { db } from '@/lib/db';
import { requireAuth, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { encryptSecret, decryptSecret } from '@/lib/gateway-keys';
import { invalidateWhatsappApiConfigCache } from '@/lib/whatsapp-api';
import { getWhatsappUsage } from '@/lib/whatsapp-usage';
import { getTierLimits } from '@/lib/subscription';
import { NextRequest, NextResponse } from 'next/server';

// ─── API WhatsApp personnelle de l'école (Meta WhatsApp Cloud API) ──────────
// Le client branche son propre numéro + token Meta : les messages partent via
// SON API → plus de limite mensuelle EduGest (limité par ses tokens Meta).

const CONFIG_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'CASHIER'];

function maskSensitive(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return '*'.repeat(Math.max(4, value.length - 4)) + value.slice(-4);
}

function sanitizeConfig(row: any) {
  return {
    id: row.id,
    schoolId: row.schoolId,
    provider: row.provider,
    phoneNumberId: row.phoneNumberId || '',
    businessAccountId: row.businessAccountId || '',
    webhookVerifyToken: row.webhookVerifyToken ? maskSensitive(row.webhookVerifyToken) : '',
    hasAccessToken: Boolean(row.accessToken),
    accessTokenPreview: row.accessToken ? maskSensitive(row.accessToken.slice(0, 8)) : '',
    isActive: row.isActive,
    lastTestAt: row.lastTestAt,
    lastTestOk: row.lastTestOk,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET /api/whatsapp-api?schoolId=... — config (masquée) + usage temps réel
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || user.schoolId;
    if (!schoolId) return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    const [row, usage] = await Promise.all([
      db.whatsappApiConfig.findUnique({ where: { schoolId } }),
      getWhatsappUsage(schoolId),
    ]);

    return NextResponse.json({
      data: {
        config: row ? sanitizeConfig(row) : null,
        usage,
        // Le forfait autorise-t-il la configuration d'une API perso ?
        tierAllowsCustomApi: getTierLimits(usage.tier).canUseCustomWhatsappApi,
      },
    });
  } catch (error) {
    console.error('[WhatsApp API] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// PUT /api/whatsapp-api — créer/mettre à jour la config API WhatsApp de l'école
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    if (!CONFIG_ROLES.includes(user.role)) {
      return NextResponse.json(
        { error: 'Seuls SUPER_ADMIN_GLOBAL, SCHOOL_ADMIN ou CASHIER peuvent configurer l\'API WhatsApp' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const schoolId: string = body.schoolId || user.schoolId;
    if (!schoolId) return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    // Vérifier que le forfait autorise une API perso
    const school = await db.school.findUnique({ where: { id: schoolId }, select: { subscriptionTier: true } });
    const tier = school?.subscriptionTier || 'FREEMIUM';
    if (!getTierLimits(tier).canUseCustomWhatsappApi) {
      return NextResponse.json(
        { error: `Le forfait ${tier} ne permet pas de connecter une API WhatsApp personnelle. Passez au forfait Standard ou supérieur.` },
        { status: 403 }
      );
    }

    const phoneNumberId: string = (body.phoneNumberId || '').trim();
    const accessToken: string = (body.accessToken || '').trim();
    const businessAccountId: string | null = (body.businessAccountId || '').trim() || null;
    const webhookVerifyToken: string | null = (body.webhookVerifyToken || '').trim() || null;
    const isActive: boolean = body.isActive === true;

    const existing = await db.whatsappApiConfig.findUnique({ where: { schoolId } });
    if (!phoneNumberId || (!accessToken && !existing)) {
      return NextResponse.json({ error: 'Phone Number ID et Access Token sont requis' }, { status: 400 });
    }

    const data: Record<string, unknown> = {
      phoneNumberId,
      businessAccountId,
      webhookVerifyToken: webhookVerifyToken ? encryptSecret(webhookVerifyToken) : null,
      isActive,
      // Nouveau test requis après modification
      lastTestAt: null,
      lastTestOk: null,
    };
    // Token : chiffré au repos. Vide → conserver l'existant.
    if (accessToken) data.accessToken = encryptSecret(accessToken);

    const config = await db.whatsappApiConfig.upsert({
      where: { schoolId },
      create: {
        schoolId,
        phoneNumberId,
        accessToken: (accessToken ? encryptSecret(accessToken) : existing?.accessToken) ?? '',
        businessAccountId,
        webhookVerifyToken: webhookVerifyToken ? encryptSecret(webhookVerifyToken) : null,
        isActive,
      },
      update: data,
    });

    invalidateWhatsappApiConfigCache(schoolId);

    // Vérification d'intégrité : le token doit être déchiffrable
    try {
      if (config.accessToken) decryptSecret(config.accessToken);
    } catch {
      return NextResponse.json({ error: 'Configurée mais token illisible — resaisissez-le' }, { status: 500 });
    }

    return NextResponse.json({ data: sanitizeConfig(config) });
  } catch (error) {
    console.error('[WhatsApp API] PUT error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// DELETE /api/whatsapp-api?schoolId=... — désactiver la config (retour à l'agent EduGest)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    if (!CONFIG_ROLES.includes(user.role)) {
      return NextResponse.json(
        { error: 'Seuls SUPER_ADMIN_GLOBAL, SCHOOL_ADMIN ou CASHIER peuvent modifier cette configuration' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || user.schoolId;
    if (!schoolId) return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    await db.whatsappApiConfig.updateMany({ where: { schoolId }, data: { isActive: false } });
    invalidateWhatsappApiConfigCache(schoolId);

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error('[WhatsApp API] DELETE error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
