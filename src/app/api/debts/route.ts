import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, verifySchoolAccess } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'payments:read')
    if ('error' in authResult) return authResult.error

    const { searchParams } = new URL(request.url)
    const schoolId = searchParams.get('schoolId')

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId required' }, { status: 400 })
    }

    if (!verifySchoolAccess(authResult.user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const payments = await db.paymentRecord.findMany({
      where: {
        schoolId,
        status: { notIn: ['PAID', 'CANCELLED', 'REFUNDED'] },
      },
      orderBy: { createdAt: 'desc' },
    })

    const studentIds = [...new Set(payments.map(p => p.studentId))]
    const students = await db.student.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        matricule: true,
        photoUrl: true,
        parentId: true,
        parent: {
          select: { id: true, name: true, phone: true },
        },
        class: {
          select: { id: true, name: true, section: true },
        },
      },
    })

    const studentMap = new Map(students.map(s => [s.id, s]))

    const debts = payments
      .filter((p) => p.paidAmount < p.amount)
      .map((p) => ({
        id: p.id,
        student: studentMap.get(p.studentId) || null,
        amount: p.amount,
        paidAmount: p.paidAmount,
        remaining: p.amount - p.paidAmount,
        trimester: p.trimester,
        status: p.status,
        paymentMethod: p.paymentMethod,
        createdAt: p.createdAt,
      }))

    return NextResponse.json(debts)
  } catch (error) {
    console.error('GET /api/debts error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
