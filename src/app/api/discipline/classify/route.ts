import { db } from '@/lib/db'
import { requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth'
import { classifyStudent } from '@/lib/discipline-classifier'
import { NextRequest, NextResponse } from 'next/server'

const CLASSIFY_ROLES = [
  'SUPER_ADMIN_GLOBAL', 'ADMIN', 'SECRETARY',
  'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE',
  'DISCIPLINE_MATERNELLE', 'DISCIPLINE_PRIMAIRE', 'DISCIPLINE_SECONDAIRE',
  'HEAD_TEACHER'
]

// POST /api/discipline/classify
// Trigger auto-classification for a student
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, CLASSIFY_ROLES)
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const { studentId, schoolId } = body

    if (!studentId || !schoolId) {
      return NextResponse.json(
        { error: 'studentId et schoolId sont requis' },
        { status: 400 }
      )
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 })
    }

    // Run classification (no schoolYearId needed)
    const result = await classifyStudent(studentId, schoolId)

    // Update the student's latest discipline record with the classified listType
    const latestRecord = await db.disciplineRecord.findFirst({
      where: { studentId, schoolId },
      orderBy: { createdAt: 'desc' }
    })

    if (latestRecord) {
      await db.disciplineRecord.update({
        where: { id: latestRecord.id },
        data: { listType: result.listType }
      })

      // Sync with list tables
      const reason = `${result.reason} (${result.details.totalPoints} pts)`

      if (result.listType === 'BLACKLIST') {
        await db.blacklist.create({
          data: { studentId, schoolId, reason, addedBy: user.name || user.id }
        })
      } else if (result.listType === 'WHITELIST') {
        await db.whitelist.create({
          data: { studentId, schoolId, reason, addedBy: user.name || user.id }
        })
      } else {
        await db.greylist.create({
          data: { studentId, schoolId, reason, addedBy: user.name || user.id }
        })
      }
    }

    return NextResponse.json({
      data: result,
      message: `Élève classifié en ${result.listType}`
    })
  } catch (error) {
    console.error('[Discipline] Classification error:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}