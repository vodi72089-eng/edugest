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

    // Get active school year
    const activeYear = await db.schoolYear.findFirst({
      where: { schoolId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })

    // Get all school fees for this school
    const schoolFees = await db.schoolFee.findMany({
      where: { schoolId, isActive: true },
      select: { classId: true, trimester: true, amount: true },
    })

    // Group fees by classId → trimester → amount
    const feeByClassTrimester = new Map<string, Map<string, number>>()
    for (const fee of schoolFees) {
      if (!feeByClassTrimester.has(fee.classId)) {
        feeByClassTrimester.set(fee.classId, new Map())
      }
      feeByClassTrimester.get(fee.classId)!.set(fee.trimester, fee.amount)
    }

    // Get all students in this school (active year)
    const studentWhere: Record<string, unknown> = { schoolId }
    if (activeYear) studentWhere.schoolYearId = activeYear.id

    const students = await db.student.findMany({
      where: studentWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        matricule: true,
        photoUrl: true,
        classId: true,
        parentId: true,
        parent: {
          select: { id: true, name: true, phone: true },
        },
        class: {
          select: { id: true, name: true, section: true },
        },
      },
    })

    // Get all payments for this school
    const payments = await db.paymentRecord.findMany({
      where: { schoolId },
      select: { studentId: true, trimester: true, paidAmount: true },
    })

    // Sum paidAmount per student per trimester
    const paidByStudentTrimester = new Map<string, Map<string, number>>()
    for (const p of payments) {
      if (!paidByStudentTrimester.has(p.studentId)) {
        paidByStudentTrimester.set(p.studentId, new Map())
      }
      const triMap = paidByStudentTrimester.get(p.studentId)!
      triMap.set(p.trimester, (triMap.get(p.trimester) || 0) + p.paidAmount)
    }

    // Calculate debts per student per trimester
    const allTrimesters = ['T1', 'T2', 'T3']
    const debts: Array<{
      id: string
      student: typeof students[0] | null
      amount: number
      paidAmount: number
      remaining: number
      trimester: string
      status: string
      paymentMethod: null
      createdAt: Date
    }> = []

    for (const student of students) {
      const fees = feeByClassTrimester.get(student.classId)
      if (!fees) continue

      const paidMap = paidByStudentTrimester.get(student.id)

      for (const trimester of allTrimesters) {
        const feeAmount = fees.get(trimester)
        if (!feeAmount) continue

        const paid = paidMap?.get(trimester) || 0
        const remaining = feeAmount - paid

        if (remaining > 0) {
          const status = paid >= feeAmount ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING'
          debts.push({
            id: `${student.id}-${trimester}`,
            student,
            amount: feeAmount,
            paidAmount: paid,
            remaining,
            trimester,
            status,
            paymentMethod: null,
            createdAt: new Date(),
          })
        }
      }
    }

    // Sort by remaining descending
    debts.sort((a, b) => b.remaining - a.remaining)

    return NextResponse.json(debts)
  } catch (error) {
    console.error('GET /api/debts error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
