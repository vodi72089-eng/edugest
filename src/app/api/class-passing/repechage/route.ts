import { db } from '@/lib/db'
import { requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth'
import { resolveEventVisibility } from '@/lib/platform-events'
import { getSchoolTier } from '@/lib/subscription'
import { notify } from '@/lib/notify'
import { notifyRepechage } from '@/lib/whatsapp-agent'
import { NextRequest, NextResponse } from 'next/server'

const REPECHAGE_ROLES = [
  'SUPER_ADMIN_GLOBAL', 'SECRETARY',
  'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE',
  'HEAD_TEACHER'
]

const PREMIUM_TIERS = ['PREMIUM', 'ENTERPRISE', 'CORPORATE']

interface ParsedSubject {
  subjectId?: string | null
  name: string
  score?: number | null
}

function parseSubjects(raw: string): ParsedSubject[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * GET /api/class-passing/repechage?schoolId=&studentId=&search=
 * Liste des examens de repêchage (100 plus récents).
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, REPECHAGE_ROLES)
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const schoolId = searchParams.get('schoolId') || user.schoolId
    const studentId = searchParams.get('studentId') || ''
    const search = searchParams.get('search') || ''

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 })
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 })
    }

    // Gate forfait : PREMIUM minimum (SUPER_ADMIN_GLOBAL bypass)
    if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      const tier = await getSchoolTier(schoolId)
      if (!PREMIUM_TIERS.includes(tier)) {
        return NextResponse.json(
          {
            error: `La fonctionnalité repêchage requiert le forfait PREMIUM ou supérieur (forfait actuel : ${tier}).`,
            featureRequired: 'passage de classe',
            tierRequired: 'PREMIUM',
            currentTier: tier,
          },
          { status: 403 }
        )
      }
    }

    const where: Record<string, unknown> = { schoolId }

    if (studentId) {
      where.studentId = studentId
    } else if (search) {
      // Recherche insensible à la casse sur firstName/lastName (filtrage JS,
      // SQLite ne supporte pas mode: 'insensitive')
      const q = search.toLowerCase()
      const students = await db.student.findMany({
        where: { schoolId, isArchived: false },
        select: { id: true, firstName: true, lastName: true },
      })
      const matchedIds = students
        .filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q))
        .map(s => s.id)
      where.studentId = { in: matchedIds.length > 0 ? matchedIds : ['__none__'] }
    }

    const exams = await db.repechageExam.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            matricule: true,
            photoUrl: true,
            class: { select: { name: true } },
          },
        },
      },
    })

    return NextResponse.json({
      data: exams.map(e => ({
        id: e.id,
        studentId: e.studentId,
        student: {
          id: e.student.id,
          firstName: e.student.firstName,
          lastName: e.student.lastName,
          matricule: e.student.matricule,
          photoUrl: e.student.photoUrl,
          class: { name: e.student.class?.name ?? null },
        },
        subjects: parseSubjects(e.subjects),
        examDate: e.examDate,
        status: e.status,
        sentViaApp: e.sentViaApp,
        sentViaWhatsapp: e.sentViaWhatsapp,
        whatsappDetail: e.whatsappDetail,
        createdByName: e.createdByName,
        createdAt: e.createdAt,
      })),
    })
  } catch (error) {
    console.error('[Repechage] GET error:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}

/**
 * POST /api/class-passing/repechage
 * body: { studentId, schoolId?, subjects: [{subjectId,name,score}] | string[],
 *         examDate?, note?, sendWhatsApp? }
 * Crée UN examen de repêchage puis notifie les parents (in-app + WhatsApp).
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, REPECHAGE_ROLES)
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const { studentId, schoolId: bodySchoolId, subjects, examDate, note, sendWhatsApp } = body

    if (!studentId) {
      return NextResponse.json({ error: 'studentId est requis' }, { status: 400 })
    }

    if (!Array.isArray(subjects) || subjects.length === 0) {
      return NextResponse.json({ error: 'subjects est requis (liste de matières non vide)' }, { status: 400 })
    }

    // Normalisation des matières : [{subjectId,name,score}] | string[]
    const parsedSubjects: ParsedSubject[] = subjects
      .map((s: unknown) => {
        if (typeof s === 'string') return { subjectId: null, name: s.trim(), score: null }
        const obj = s as { subjectId?: string; name?: string; score?: number | string }
        const score =
          obj.score === undefined || obj.score === null || obj.score === ''
            ? null
            : typeof obj.score === 'number' ? obj.score : Number(obj.score)
        return {
          subjectId: obj.subjectId ?? null,
          name: String(obj.name ?? '').trim(),
          score: score !== null && isNaN(score) ? null : score,
        }
      })
      .filter(s => s.name)

    if (parsedSubjects.length === 0) {
      return NextResponse.json({ error: 'Aucune matière valide fournie' }, { status: 400 })
    }

    // Validation de l'élève et de son appartenance à l'école
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        parentId: true,
        classId: true,
        schoolYearId: true,
        schoolId: true,
        class: { select: { name: true } },
      },
    })

    if (!student) {
      return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 })
    }

    if (bodySchoolId && student.schoolId !== bodySchoolId) {
      return NextResponse.json({ error: "Cet élève n'appartient pas à cette école" }, { status: 400 })
    }

    if (!verifySchoolAccess(user, student.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 })
    }

    // Gate forfait : PREMIUM minimum (SUPER_ADMIN_GLOBAL bypass)
    if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      const tier = await getSchoolTier(student.schoolId)
      if (!PREMIUM_TIERS.includes(tier)) {
        return NextResponse.json(
          {
            error: `La fonctionnalité repêchage requiert le forfait PREMIUM ou supérieur (forfait actuel : ${tier}).`,
            featureRequired: 'passage de classe',
            tierRequired: 'PREMIUM',
            currentTier: tier,
          },
          { status: 403 }
        )
      }
    }

    const examDateDate = examDate ? new Date(examDate) : null
    if (examDate && examDateDate && isNaN(examDateDate.getTime())) {
      return NextResponse.json({ error: 'examDate invalide (date ISO attendue)' }, { status: 400 })
    }

    // ── Création de l'examen (UNE ligne) ─────────────────────────────────────
    let repechageExam = await db.repechageExam.create({
      data: {
        studentId: student.id,
        classId: student.classId,
        schoolId: student.schoolId,
        schoolYearId: student.schoolYearId,
        subjects: JSON.stringify(parsedSubjects),
        status: 'PLANNED',
        examDate: examDateDate,
        note: note || null,
        createdById: user.id,
        createdByName: user.name,
      },
    })

    // ── Notifications ────────────────────────────────────────────────────────
    let appSent = 0
    let whatsappSent = 0
    let whatsappDetail: string | null = null

    // a) In-app au(x) parent(s) lié(s) à l'élève (relation parentId)
    try {
      if (student.parentId) {
        const subjectNames = parsedSubjects.map(s => s.name).join(', ')
        const message =
          `${student.firstName} ${student.lastName} (${student.class?.name ?? 'classe non définie'}) doit repêcher les matières suivantes : ${subjectNames}.` +
          (examDateDate ? ` Date de l'examen : ${examDateDate.toLocaleDateString('fr-FR')}.` : '')
        await notify({
          data: {
            type: 'REPECHAGE',
            title: 'Examens de repêchage',
            message,
            userId: student.parentId,
            schoolId: student.schoolId,
            relatedId: repechageExam.id,
          },
        })
        appSent = 1
      }
    } catch (notifError) {
      console.error('[Repechage] In-app notification error (non-blocking):', notifError)
    }

    // b) WhatsApp au(x) parent(s) via notifyRepechage (pattern notifyBulletin)
    if (sendWhatsApp !== false) {
      try {
        const waResult = await notifyRepechage({
          student: {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            className: student.class?.name ?? null,
          },
          schoolId: student.schoolId,
          subjects: parsedSubjects,
          examDate: examDateDate,
          note: note || null,
        })
        whatsappSent = waResult.sent
        whatsappDetail = waResult.detail
      } catch (waError) {
        console.error('[Repechage] WhatsApp notification error (non-blocking):', waError)
        whatsappDetail = 'Erreur lors de l\'envoi WhatsApp'
      }
    } else {
      whatsappDetail = 'Envoi WhatsApp désactivé'
    }

    repechageExam = await db.repechageExam.update({
      where: { id: repechageExam.id },
      data: {
        sentViaApp: appSent > 0,
        sentViaWhatsapp: whatsappSent > 0,
        whatsappDetail,
      },
    })

    return NextResponse.json(
      {
        data: { ...repechageExam, subjects: parseSubjects(repechageExam.subjects) },
        notifications: { appSent, whatsappSent, whatsappDetail },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[Repechage] POST error:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}
