import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, verifySchoolAccess } from '@/lib/auth'

// Rôles habilités à gérer les affectations enseignant↔classe
const ASSIGNMENT_MANAGE_ROLES = ['SCHOOL_ADMIN', 'DIRECTION', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE', 'SECRETARY', 'HEAD_TEACHER']

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('error' in authResult) return authResult.error
  const { user } = authResult

  const { searchParams } = new URL(req.url)
  const teacherId = searchParams.get('teacherId')

  // ── SÉCURITÉ (cross-tenant P1) : avant, TOUT utilisateur authentifié
  // (PARENT inclus) lisait les affectations de TOUTES les écoles.
  // Désormais : filtre par école de l'acteur (SUPER_ADMIN_GLOBAL voit tout).
  const assignments = user.role === 'SUPER_ADMIN_GLOBAL'
    ? await db.teacherAssignment.findMany({
        where: teacherId ? { teacherId } : {},
        include: { class: true, subject: true, teacher: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'desc' }
      })
    : await db.teacherAssignment.findMany({
        where: { ...(teacherId ? { teacherId } : {}), class: { schoolId: user.schoolId || '' } },
        include: { class: true, subject: true, teacher: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'desc' }
      })

  return NextResponse.json({ data: assignments })
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('error' in authResult) return authResult.error
  const { user } = authResult

  // ── SÉCURITÉ : réservé au personnel habilité (avant : tout user, PARENT inclus).
  if (!ASSIGNMENT_MANAGE_ROLES.includes(user.role) && user.role !== 'SUPER_ADMIN_GLOBAL') {
    return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
  }

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

  // ── SÉCURITÉ : le professeur doit appartenir à la même école que la classe
  // (avant : un professeur d'une autre école pouvait être affecté).
  const teacher = await db.user.findUnique({ where: { id: teacherId }, select: { schoolId: true, role: true } })
  if (!teacher) {
    return NextResponse.json({ error: 'Professeur introuvable' }, { status: 404 })
  }
  if (!['TEACHER', 'HEAD_TEACHER', 'EPS'].includes(teacher.role)) {
    return NextResponse.json({ error: 'Le compte ciblé n\'est pas un enseignant' }, { status: 400 })
  }
  if (user.role !== 'SUPER_ADMIN_GLOBAL' && teacher.schoolId !== targetClass.schoolId) {
    return NextResponse.json({ error: 'Ce professeur n\'appartient pas à cette école' }, { status: 403 })
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

  // ── SÉCURITÉ : réservé au personnel habilité.
  if (!ASSIGNMENT_MANAGE_ROLES.includes(user.role) && user.role !== 'SUPER_ADMIN_GLOBAL') {
    return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  // ── SÉCURITÉ (cross-tenant P1) : avant, n'importe quelle assignation de
  // n'importe quelle école pouvait être supprimée par id. Désormais : vérif.
  const assignment = await db.teacherAssignment.findUnique({
    where: { id },
    include: { class: { select: { schoolId: true } } },
  })
  if (!assignment) {
    return NextResponse.json({ error: 'Assignation introuvable' }, { status: 404 })
  }
  if (!verifySchoolAccess(user, assignment.class.schoolId)) {
    return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 })
  }

  await db.teacherAssignment.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
