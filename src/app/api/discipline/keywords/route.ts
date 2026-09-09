import { db } from '@/lib/db'
import { requireAuth, verifySchoolAccess, sanitizeError } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/discipline/keywords?schoolId=...
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const schoolId = searchParams.get('schoolId') || user.schoolId

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 })
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const keywords = await db.disciplineKeyword.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ data: keywords })
  } catch (error) {
    console.error('[Keywords] Error:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}