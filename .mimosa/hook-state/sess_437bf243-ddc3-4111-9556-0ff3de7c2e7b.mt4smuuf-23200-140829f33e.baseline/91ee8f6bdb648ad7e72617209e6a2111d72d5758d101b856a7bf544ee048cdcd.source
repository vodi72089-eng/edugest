import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySchoolAccess } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = verifySchoolAccess(req)
  if (!auth) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'PENDING'

  const approvals = await db.settingsApproval.findMany({
    where: { schoolId: auth.schoolId, status },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json({ data: approvals })
}

export async function POST(req: NextRequest) {
  const auth = verifySchoolAccess(req)
  if (!auth) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { changeType, changeData, currentData } = await req.json()
  if (!changeType || !changeData) {
    return NextResponse.json({ error: 'changeType et changeData requis' }, { status: 400 })
  }

  const approval = await db.settingsApproval.create({
    data: {
      schoolId: auth.schoolId,
      requestedBy: auth.userId,
      changeType,
      changeData: JSON.stringify(changeData),
      currentData: currentData ? JSON.stringify(currentData) : null,
    }
  })

  return NextResponse.json({ data: approval }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = verifySchoolAccess(req)
  if (!auth) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id, status } = await req.json()
  if (!id || !status) {
    return NextResponse.json({ error: 'id et status requis' }, { status: 400 })
  }

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return NextResponse.json({ error: 'Status invalide' }, { status: 400 })
  }

  const approval = await db.settingsApproval.update({
    where: { id },
    data: { status, reviewedBy: auth.userId, reviewedAt: new Date() }
  })

  return NextResponse.json({ data: approval })
}
