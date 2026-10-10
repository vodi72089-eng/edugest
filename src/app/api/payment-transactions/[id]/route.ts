import { db } from '@/lib/db';
import {
  requirePermission,
  verifySchoolAccess,
  sanitizeError,
} from '@/lib/auth';
import { checkTransactionStatus } from '@/lib/payment-gateway';
import { NextRequest, NextResponse } from 'next/server';

// Valid transaction statuses
const VALID_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED'];

// GET /api/payment-transactions/[id]
// Returns a single payment transaction by ID with student info (if any).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'payments:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    const transaction = await db.paymentTransaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction introuvable' },
        { status: 404 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, transaction.schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // For PARENT role, ensure the transaction belongs to one of their children
    if (user.role === 'PARENT' && transaction.studentId) {
      const student = await db.student.findUnique({
        where: { id: transaction.studentId },
        select: { parentId: true },
      });
      if (!student || student.parentId !== user.id) {
        return NextResponse.json(
          { error: 'Accès non autorisé à cette transaction' },
          { status: 403 }
        );
      }
    }

    // Enrich with student data when available
    let student: { id: string; firstName: string; lastName: string; matricule: string } | null = null;
    if (transaction.studentId) {
      student = await db.student.findUnique({
        where: { id: transaction.studentId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          matricule: true,
        },
      });
    }

    return NextResponse.json({
      data: {
        ...transaction,
        student,
      },
    });
  } catch (error) {
    console.error('[PaymentTransactions] Error fetching transaction:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

// PUT /api/payment-transactions/[id]
// Manually update a transaction's status (for manual verification by a
// cashier/admin). Optionally syncs status with the gateway first.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'payments:verify');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    const existing = await db.paymentTransaction.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Transaction introuvable' },
        { status: 404 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status, gatewayResponse, syncFromGateway } = body;

    const updateData: Record<string, unknown> = {};

    // Validate status if provided
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          {
            error: `Statut invalide: ${status}. Statuts valides: ${VALID_STATUSES.join(', ')}`,
          },
          { status: 400 }
        );
      }
      // ── SÉCURITÉ : le passage MANUEL à SUCCESS est une preuve d'encaissement.
      // Un caissier (permission payments:verify) pouvait fabriquer un paiement
      // reçu sans argent — y compris un paiement d'abonnement. Seul le super
      // admin plateforme peut forcer ce statut (correction manuelle/incident).
      if (status === 'SUCCESS' && existing.status !== 'SUCCESS' && user.role !== 'SUPER_ADMIN_GLOBAL') {
        return NextResponse.json(
          { error: "Le statut SUCCESS ne peut pas être posé manuellement : il provient du webhook de la passerelle (ou d'un super administrateur plateforme)." },
          { status: 403 }
        );
      }
      updateData.status = status;

      // Set completedAt when transitioning to SUCCESS
      if (status === 'SUCCESS' && existing.status !== 'SUCCESS') {
        updateData.completedAt = new Date();
      }
    }

    if (gatewayResponse !== undefined) {
      // Store as a JSON string if it's an object, otherwise store as string
      updateData.gatewayResponse =
        typeof gatewayResponse === 'object'
          ? JSON.stringify(gatewayResponse)
          : String(gatewayResponse);
    }

    // Optional: sync the status from the gateway before applying manual update
    if (syncFromGateway && existing.gatewayTransactionId) {
      try {
        const statusResult = await checkTransactionStatus(id);
        if (statusResult.success && statusResult.transaction) {
          // If gateway confirms a terminal state, prefer that over the manual one
          if (
            statusResult.transaction.status === 'SUCCESS' ||
            statusResult.transaction.status === 'FAILED'
          ) {
            updateData.status = statusResult.transaction.status;
            if (
              statusResult.transaction.status === 'SUCCESS' &&
              existing.status !== 'SUCCESS'
            ) {
              updateData.completedAt = new Date();
            }
          }
        }
      } catch (syncError) {
        console.warn(
          '[PaymentTransactions] Failed to sync from gateway:',
          syncError
        );
        // Continue with manual update even if sync fails
      }
    }

    const transaction = await db.paymentTransaction.update({
      where: { id },
      data: updateData,
    });

    // Enrich with student data when available
    let student: { id: string; firstName: string; lastName: string; matricule: string } | null = null;
    if (transaction.studentId) {
      student = await db.student.findUnique({
        where: { id: transaction.studentId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          matricule: true,
        },
      });
    }

    return NextResponse.json({
      data: {
        ...transaction,
        student,
      },
      message: 'Transaction mise à jour avec succès',
    });
  } catch (error) {
    console.error('[PaymentTransactions] Error updating transaction:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
