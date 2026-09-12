import { db } from '@/lib/db';
import { requireRole, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Require SUPER_ADMIN_GLOBAL role only — this changes school subscription tier (extremely sensitive)
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { schoolId, amount, subscriptionTier, paymentMethod, description } = body;

    if (!schoolId || !amount || !subscriptionTier) {
      return NextResponse.json(
        { error: 'Missing required fields: schoolId, amount, subscriptionTier' },
        { status: 400 }
      );
    }

    // Vérifier que l'école existe
    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
    }

    // Mettre à jour le tier d'abonnement de l'école
    await db.school.update({
      where: { id: schoolId },
      data: { subscriptionTier, subscriptionStatus: 'ACTIVE' },
    });

    // Créer un enregistrement de paiement pour l'abonnement
    const payment = await db.paymentRecord.create({
      data: {
        studentId: '__subscription__',
        schoolId,
        amount: amount * 100, // Convertir en centimes pour cohérence avec le schéma existant
        paidAmount: amount * 100,
        trimester: 'ABONNEMENT',
        paymentMethod: paymentMethod || 'CASH',
        referenceNumber: `SUB-${Date.now()}`,
        status: 'PAID',
        paidAt: new Date(),
        receiptNumber: `REC-SUB-${Date.now().toString(36).toUpperCase()}`,
      },
    });

    // Enregistrer dans l'audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'SUBSCRIPTION_PAYMENT',
        entityType: 'School',
        entityId: schoolId,
        details: `${description || `Abonnement ${subscriptionTier}`} - ${amount}$ en ${paymentMethod || 'liquide'}`,
      },
    });

    return NextResponse.json({
      data: {
        paymentId: payment.id,
        receiptNumber: payment.receiptNumber,
        amount,
        subscriptionTier,
        paymentMethod: paymentMethod || 'CASH',
        schoolName: school.name,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error recording subscription payment:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
