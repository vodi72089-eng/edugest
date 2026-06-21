import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const schoolId = searchParams.get('schoolId')

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId required' }, { status: 400 })
    }

    const payments = await prisma.paymentRecord.findMany({
      where: {
        schoolId,
        status: { not: 'PAID' },
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            matricule: true,
            photoUrl: true,
            parentId: true,
            parent: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            class: {
              select: {
                id: true,
                name: true,
                section: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const debts = payments
      .filter((p) => p.paidAmount < p.amount)
      .map((p) => ({
        id: p.id,
        student: p.student,
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
