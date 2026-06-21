import { db } from '@/lib/db'
import { requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_ROLES = ['SUPER_ADMIN_GLOBAL', 'ADMIN', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE']

// DELETE /api/discipline/keywords/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(request, ADMIN_ROLES)
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    const { id } = await params

    const keyword = await db.disciplineKeyword.findUnique({ where: { id } })
    if (!keyword) {
      return NextResponse.json({ error: 'Mot-clé non trouvé' }, { status: 404 })
    }

    if (!verifySchoolAccess(user, keyword.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    await db.disciplineKeyword.delete({ where: { id } })

    return NextResponse.json({ message: 'Mot-clé supprimé' })
  } catch (error) {
    console.error('[Keywords] Delete error:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}