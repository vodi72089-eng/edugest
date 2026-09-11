import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, verifySchoolAccess } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('error' in authResult) return authResult.error
  const { user } = authResult

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'PENDING'

  const approvals = await db.settingsApproval.findMany({
    where: { schoolId: user.schoolId || '', status },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json({ data: approvals })
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('error' in authResult) return authResult.error
  const { user } = authResult

  const { changeType, changeData, currentData } = await req.json()
  if (!changeType || !changeData) {
    return NextResponse.json({ error: 'changeType et changeData requis' }, { status: 400 })
  }

  const approval = await db.settingsApproval.create({
    data: {
      schoolId: user.schoolId || '',
      requestedBy: user.id,
      changeType,
      changeData: JSON.stringify(changeData),
      currentData: currentData ? JSON.stringify(currentData) : null,
    }
  })

  return NextResponse.json({ data: approval }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('error' in authResult) return authResult.error
  const { user } = authResult

  const { id, status } = await req.json()
  if (!id || !status) {
    return NextResponse.json({ error: 'id et status requis' }, { status: 400 })
  }

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return NextResponse.json({ error: 'Status invalide' }, { status: 400 })
  }

  // Only the school owning the approval (or the global super admin) may review it
  const existing = await db.settingsApproval.findUnique({ where: { id }, select: { schoolId: true } })
  if (!existing) {
    return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
  }
  if (!verifySchoolAccess(user, existing.schoolId)) {
    return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 })
  }

  const approval = await db.settingsApproval.update({
    where: { id },
    data: { status, reviewedBy: user.id, reviewedAt: new Date() }
  })

  return NextResponse.json({ data: approval })
}
