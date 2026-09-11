import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, verifySchoolAccess } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('error' in authResult) return authResult.error
  const { user } = authResult

  const { searchParams } = new URL(req.url)
  const teacherId = searchParams.get('teacherId')

  const where: Record<string, string> = {}
  if (teacherId) where.teacherId = teacherId

  const assignments = await db.teacherAssignment.findMany({
    where,
    include: { class: true, subject: true, teacher: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json({ data: assignments })
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('error' in authResult) return authResult.error
  const { user } = authResult

  const { teacherId, classId, subjectId } = await req.json()
  if (!teacherId || !classId || !subjectId) {
    return NextResponse.json({ error: 'teacherId, classId, subjectId requis' }, { status: 400 })
  }

  // School-scope check: the class must belong to the caller's school (SUPER_ADMIN_GLOBAL bypasses)
  const targetClass = await db.class.findUnique({ where: { id: classId }, select: { schoolId: true } })
  if (!targetClass) {
    return NextResponse.json({ error: 'Classe introuvable' }, { status: 404 })
  }
  if (!verifySchoolAccess(user, targetClass.schoolId)) {
    return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 })
  }

  const existing = await db.teacherAssignment.findUnique({
    where: { teacherId_classId_subjectId: { teacherId, classId, subjectId } }
  })
  if (existing) {
    return NextResponse.json({ error: 'Cette assignation existe déjà' }, { status: 409 })
  }

  const assignment = await db.teacherAssignment.create({
    data: { teacherId, classId, subjectId },
    include: { class: true, subject: true, teacher: { select: { id: true, name: true } } }
  })

  return NextResponse.json({ data: assignment }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('error' in authResult) return authResult.error
  const { user } = authResult

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  await db.teacherAssignment.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
