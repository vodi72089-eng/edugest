import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';
import { db } from '@/lib/db';
import { getPlatformEmailAddresses, savePlatformEmailAddresses, sendPlatformEmail, PLATFORM_EMAILS_KEY } from '@/lib/platform-email';
import { logAudit } from '@/lib/audit';

// ═══════════════════════════════════════════════════════════════════════════
// NOS EMAILS PLATEFORME — adresses officielles + boîte d'envoi (SAG)
//   noreply@edugest.app | support@edugest.app | contact@edugest.app
// Envois journalisés dans EmailMessage (SIMULÉ en dev, SENT via Resend en
// production dès que la clé API Resend est configurée dans Communications).
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/platform-emails?tab=addresses|outbox
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { searchParams } = new URL(request.url);

    const addresses = await getPlatformEmailAddresses();
    const resendCfg = await db.globalApiConfig.findUnique({ where: { key: 'RESEND_EMAIL_CONFIG' } });
    let resend: { configured: boolean; enabled: boolean; fromEmail: string } | null = null;
    try {
      if (resendCfg) {
        const p = JSON.parse(resendCfg.value);
        resend = { configured: !!p.apiKey, enabled: !!p.enabled, fromEmail: p.fromEmail || '' };
      }
    } catch { /* ignore */ }

    const tab = searchParams.get('tab');
    if (tab === 'addresses') {
      return NextResponse.json({ data: { addresses, resend } });
    }

    const outbox = await db.emailMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const counts = await db.emailMessage.groupBy({ by: ['status'], _count: true });

    return NextResponse.json({
      data: {
        addresses,
        resend,
        key: PLATFORM_EMAILS_KEY,
        outbox: outbox.map(m => ({
          id: m.id, toEmail: m.toEmail, subject: m.subject, template: m.template,
          fromKey: m.fromKey, status: m.status, error: m.error,
          sentAt: m.sentAt, createdAt: m.createdAt,
        })),
        counts: Object.fromEntries(counts.map(c => [c.status, c._count])),
      },
    });
  } catch (error) {
    console.error('[PlatformEmails] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// PUT /api/platform-emails — met à jour les adresses officielles
// Body: { addresses: [{ key, address }] }
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    if (!Array.isArray(body.addresses)) {
      return NextResponse.json({ error: 'Format invalide (addresses attendu)' }, { status: 400 });
    }
    const addresses = await savePlatformEmailAddresses(body.addresses);

    await logAudit({
      action: 'EMAILS_UPDATED',
      userId: user.id, userName: user.name, userRole: user.role,
      entityType: 'PlatformEmails', entityId: PLATFORM_EMAILS_KEY,
      details: `Adresses email plateforme mises à jour : ${addresses.map(a => a.address).join(', ')}`,
      meta: { addresses },
    });

    return NextResponse.json({ data: { addresses } });
  } catch (error) {
    console.error('[PlatformEmails] PUT error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// POST /api/platform-emails — email de test depuis une adresse officielle
// Body: { fromKey, to }
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const to = String(body.to || '').trim();
    const fromKey = ['noreply', 'support', 'contact'].includes(body.fromKey) ? body.fromKey : 'noreply';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: 'Adresse destinataire invalide' }, { status: 400 });
    }

    const result = await sendPlatformEmail({
      to,
      fromKey,
      template: 'TEST',
      subject: 'Test — emails officiels EduGest',
      html: `<p>Email de test envoyé depuis l'adresse officielle <b>${fromKey}@edugest.app</b>.</p><p>Si vous lisez ce message dans une vraie boîte mail, l'acheminement Resend est opérationnel.</p>`,
    });

    await logAudit({
      action: 'EMAIL_SENT',
      userId: user.id, userName: user.name, userRole: user.role,
      entityType: 'PlatformEmails', entityId: null,
      details: `Email de test ${result.status} → ${to} (depuis ${fromKey})`,
      meta: { ...result },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[PlatformEmails] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
