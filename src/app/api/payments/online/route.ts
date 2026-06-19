import { db } from '@/lib/db'
import { requireAuth, verifyParentAccess, sanitizeError } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

// POST /api/payments/online
// Parent initiates an online payment (creates PENDING payment record)
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    if (user.role !== 'PARENT') {
      return NextResponse.json({ error: 'Accès réservé aux parents' }, { status: 403 })
    }

    const body = await request.json()
    const { studentId, amount, paymentMethod, phone, trimester } = body

    if (!studentId || !amount || !paymentMethod) {
      return NextResponse.json(
        { error: 'Champs requis: studentId, amount, paymentMethod' },
        { status: 400 }
      )
    }

    if (Number(amount) <= 0) {
      return NextResponse.json({ error: 'Le montant doit être supérieur à 0' }, { status: 400 })
    }

    const validMethods = ['ORANGE_MONEY', 'MPESA', 'AIRTEL_MONEY']
    if (!validMethods.includes(paymentMethod)) {
      return NextResponse.json(
        { error: 'Méthode invalide. Utilisez: ORANGE_MONEY, MPESA, ou AIRTEL_MONEY' },
        { status: 400 }
      )
    }

    // Verify parent owns this student
    const hasAccess = await verifyParentAccess(user, studentId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Cet élève ne vous appartient pas' }, { status: 403 })
    }

    // Get student and school info
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true, matricule: true, schoolId: true },
    })
    if (!student) {
      return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 })
    }

    // Generate unique reference
    const ref = `EP-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`
    const receiptNum = `REC-ONL-${Date.now().toString(36).toUpperCase()}`

    // Create payment record with PENDING status
    const payment = await db.paymentRecord.create({
      data: {
        studentId,
        schoolId: student.schoolId,
        amount: Number(amount),
        paidAmount: 0,
        trimester: trimester || 'T1',
        paymentMethod,
        referenceNumber: ref,
        status: 'PENDING',
        receiptNumber: receiptNum,
        paidAt: null,
      },
    })

    // Try to notify cashier via WhatsApp
    try {
      const whatsappServerUrl = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001'
      const cashierPhone = process.env.CASHIER_PHONE || ''
      if (cashierPhone) {
        const msg = `💰 *Nouveau paiement en ligne*\n\nÉlève: ${student.firstName} ${student.lastName}\nMatricule: ${student.matricule}\nMontant: ${Number(amount).toLocaleString('fr-FR')} CDF\nMéthode: ${paymentMethod}\nRéférence: ${ref}\n\nVeuillez vérifier et confirmer ce paiement.`
        await fetch(`${whatsappServerUrl}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cashierPhone, message: msg }),
          signal: AbortSignal.timeout(10000),
        })
      }
    } catch { /* notification best-effort */ }

    return NextResponse.json({
      data: {
        ...payment,
        student: { id: student.id, firstName: student.firstName, lastName: student.lastName, matricule: student.matricule },
      },
      message: 'Paiement enregistré. En attente de confirmation par le caissier.',
    })
  } catch (error) {
    console.error('[PaymentsOnline] Error:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}
