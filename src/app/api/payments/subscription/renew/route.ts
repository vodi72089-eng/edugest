import { db } from '@/lib/db';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { SUBSCRIPTION_PRICES } from '@/lib/subscription';

/**
 * POST /api/payments/subscription/renew
 * Allows a school to renew/activate their subscription.
 * Body: { tier: string, paymentMethod: string }
 *
 * ── SÉCURITÉ (P0) ── Avant, n'importe quel SECRETARY pouvait activer
 * n'importe quel tier (ENTERPRISE inclus) sans aucun paiement réel.
 * Désormais :
 *  - SUPER_ADMIN_GLOBAL : peut activer directement (validation hors-ligne).
 *  - SCHOOL_ADMIN : uniquement si une SubscriptionRequest de SON école pour
 *    CE tier existe avec le statut PAID (paiement passerelle reçu via le
 *    webhook signé) — sinon 403 avec guidage vers « Mon abonnement ».
 *  - Tous les autres rôles : refusés.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // Only school admins can renew
    if (!['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Seuls les administrateurs peuvent renouveler l\'abonnement' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { tier, paymentMethod } = body;

    // Note : SUBSCRIPTION_PRICES[tier] peut valoir 0 (FREEMIUM/CORPORATE) →
    // on teste la présence de la clé, pas la vérité de la valeur.
    if (!tier || SUBSCRIPTION_PRICES[tier] === undefined) {
      return NextResponse.json(
        { error: 'Formule d\'abonnement invalide' },
        { status: 400 }
      );
    }

    if (!user.schoolId) {
      return NextResponse.json({ error: 'Aucune école associée' }, { status: 400 });
    }

    const school = await db.school.findUnique({ where: { id: user.schoolId } });
    if (!school) {
      return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
    }

    // ── SÉCURITÉ : preuve de paiement requise pour les non-super-admins.
    if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      const paidRequest = await db.subscriptionRequest.findFirst({
        where: {
          schoolId: user.schoolId,
          requestedTier: tier,
          status: 'PAID',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!paidRequest) {
        return NextResponse.json(
          { error: 'Aucun paiement validé trouvé pour cette formule. Créez une demande d\'abonnement et réglez-la via une passerelle de paiement avant de l\'activer.' },
          { status: 403 }
        );
      }
    }

    const amount = SUBSCRIPTION_PRICES[tier];
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1); // 1 month subscription

    // Update school subscription
    await db.school.update({
      where: { id: user.schoolId },
      data: {
        subscriptionTier: tier,
        subscriptionStatus: 'ACTIVE',
        subscriptionStartDate: now,
        subscriptionEndDate: endDate,
      },
    });

    // Record payment (free for FREEMIUM, paid for others)
    if (amount > 0) {
      await db.paymentRecord.create({
        data: {
          studentId: '__subscription__',
          schoolId: user.schoolId,
          amount: amount * 100,
          paidAmount: amount * 100,
          trimester: 'ABONNEMENT',
          paymentMethod: paymentMethod || 'CASH',
          referenceNumber: `SUB-RENEW-${Date.now()}`,
          status: 'PAID',
          paidAt: now,
          receiptNumber: `REC-SUB-${Date.now().toString(36).toUpperCase()}`,
        },
      });
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'SUBSCRIPTION_RENEW',
        entityType: 'School',
        entityId: user.schoolId,
        details: `Abonnement ${tier} - ${amount}$ - expire le ${endDate.toLocaleDateString('fr-FR')}`,
      },
    });

    return NextResponse.json({
      data: {
        tier,
        status: 'ACTIVE',
        startDate: now,
        endDate,
        amount,
        message: `Abonnement ${tier} activé jusqu'au ${endDate.toLocaleDateString('fr-FR')}`,
      },
    });
  } catch (error) {
    console.error('Error renewing subscription:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
