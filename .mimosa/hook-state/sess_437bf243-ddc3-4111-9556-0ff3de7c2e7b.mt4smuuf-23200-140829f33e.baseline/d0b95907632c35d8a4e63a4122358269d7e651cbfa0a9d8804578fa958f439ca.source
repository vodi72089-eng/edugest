import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySchoolAccess } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = verifySchoolAccess(req)
  if (!auth) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

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
  const auth = verifySchoolAccess(req)
  if (!auth) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { teacherId, classId, subjectId } = await req.json()
  if (!teacherId || !classId || !subjectId) {
    return NextResponse.json({ error: 'teacherId, classId, subjectId requis' }, { status: 400 })
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
  const auth = verifySchoolAccess(req)
  if (!auth) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  await db.teacherAssignment.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
