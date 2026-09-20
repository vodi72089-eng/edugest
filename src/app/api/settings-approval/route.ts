import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, verifySchoolAccess, getRoleCycle } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { notifyEvent } from '@/lib/notification-service'
import crypto from 'crypto'

// Rôles habilités à créer des demandes (school_info, qr_create, class_delete…).
// Avant : tout utilisateur authentifié (PARENT inclus) pouvait créer ET
// s'auto-approuver un changement de paramètres de l'école.
// SECRETARY n'y figure plus : le compte secrétaire n'a plus AUCUN accès aux
// paramètres de l'école ni aux demandes associées.
const SETTINGS_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE']

// Seuls l'admin de l'école (admin général) et le super admin global peuvent
// approuver/rejeter — une direction ne peut pas approuver sa propre demande.
const APPROVER_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN']

// Le secrétaire peut uniquement DEMANDER un QR code (pas toucher aux paramètres)
const QR_REQUEST_ROLES = [...SETTINGS_ROLES, 'SECRETARY']

const CHANGE_TYPES = ['school_info', 'school_fee', 'currency', 'qr_create', 'class_delete', 'class_create']

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

  // Le secrétaire ne peut créer QUE des demandes de QR code ;
  // les autres demandes restent réservées aux rôles SETTINGS_ROLES.
  const allowedForType = changeType === 'qr_create' ? QR_REQUEST_ROLES : SETTINGS_ROLES
  if (!allowedForType.includes(user.role)) {
    return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
  }
  if (!changeType || !changeData) {
    return NextResponse.json({ error: 'changeType et changeData requis' }, { status: 400 })
  }
  if (!CHANGE_TYPES.includes(changeType)) {
    return NextResponse.json({ error: 'Type de demande invalide' }, { status: 400 })
  }

  const schoolId = user.schoolId || ''

  // Pas de doublon : une seule demande PENDING par type + cible
  const pendingSame = await db.settingsApproval.findFirst({
    where: { schoolId, status: 'PENDING', changeType }
  })
  if (pendingSame && ['qr_create', 'class_delete', 'class_create'].includes(changeType)) {
    const pendingData = JSON.parse(pendingSame.changeData || '{}')
    const sameTarget = changeType === 'class_delete'
      ? pendingData?.classId === changeData?.classId
      : changeType === 'class_create'
        ? (pendingData?.name || '').trim().toLowerCase() === (changeData?.name || '').trim().toLowerCase()
        : (pendingData?.label || '') === (changeData?.label || '')
    if (sameTarget) {
      return NextResponse.json({ error: 'Une demande similaire est déjà en attente d\u2019approbation' }, { status: 409 })
    }
  }

  const approval = await db.settingsApproval.create({
    data: {
      schoolId,
      requestedBy: user.id,
      changeType,
      changeData: JSON.stringify(changeData),
      currentData: currentData ? JSON.stringify(currentData) : null,
    }
  })

  // Notifier les approbateurs (admin général de l'école + super admin global)
  try {
    const approvers = await db.user.findMany({
      where: { schoolId, role: { in: APPROVER_ROLES }, isActive: true, id: { not: user.id } },
      select: { id: true },
    })
    const requesterName = user.name || 'Un membre du personnel'
    let title = 'Nouvelle demande d\u2019approbation'
    let message = `${requesterName} demande une approbation (${changeType}).`
    if (changeType === 'qr_create') {
      title = 'Demande de création de QR code'
      message = `${requesterName} demande la création d\u2019un QR code parent${changeData?.label ? ` « ${changeData.label} »` : ''}.`
    } else if (changeType === 'class_delete') {
      title = 'Demande de suppression de classe'
      message = `${requesterName} demande la suppression de la classe « ${changeData?.className || changeData?.classId} ».`
    } else if (changeType === 'class_create') {
      title = 'Demande de création de classe'
      message = `${requesterName} demande la création de la classe « ${changeData?.name || '?'} » (capacité ${changeData?.capacity || 40}).`
    }
    for (const approver of approvers) {
      await notify({
        data: {
          type: 'APPROVAL_REQUESTED',
          title,
          message,
          userId: approver.id,
          schoolId,
          relatedId: approval.id,
        },
      })
    }
  } catch { /* notification failed, non-critical */ }

  return NextResponse.json({ data: approval }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth(req)
  if ('error' in authResult) return authResult.error
  const { user } = authResult

  // Seul l'admin de l'école (ou le super admin global) peut approuver/rejeter.
  if (!APPROVER_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Seul l\u2019admin de l\u2019école peut approuver ou rejeter une demande' }, { status: 403 })
  }

  const { id, status } = await req.json()
  if (!id || !status) {
    return NextResponse.json({ error: 'id et status requis' }, { status: 400 })
  }

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return NextResponse.json({ error: 'Status invalide' }, { status: 400 })
  }

  // Only the school owning the approval (or the global super admin) may review it
  const existing = await db.settingsApproval.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
  }
  if (!verifySchoolAccess(user, existing.schoolId)) {
    return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 })
  }
  if (existing.status !== 'PENDING') {
    return NextResponse.json({ error: 'Cette demande a déjà été traitée' }, { status: 409 })
  }

  // ── Exécution serveur à l'approbation ───────────────────────────────────
  // qr_create   → le QR code est créé immédiatement côté serveur
  // class_delete→ la classe est supprimée (si vide) côté serveur
  // class_create→ la classe est créée (section imposée du cycle du demandeur)
  if (status === 'APPROVED' && existing.changeType === 'qr_create') {
    const data = JSON.parse(existing.changeData || '{}')
    let expiresAt: Date
    if (data.expiresAt) {
      expiresAt = new Date(data.expiresAt)
    } else if (data.durationHours) {
      expiresAt = new Date(Date.now() + Number(data.durationHours) * 3600 * 1000)
    } else if (data.durationDays) {
      expiresAt = new Date(Date.now() + Number(data.durationDays) * 24 * 3600 * 1000)
    } else {
      expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    }
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() > Date.now() + 366 * 24 * 3600 * 1000) {
      return NextResponse.json({ error: 'Durée de vie du QR code invalide (max 1 an)' }, { status: 400 })
    }
    await db.schoolQrCode.create({
      data: {
        schoolId: existing.schoolId,
        token: crypto.randomBytes(24).toString('base64url'),
        label: data.label ? String(data.label).slice(0, 80) : null,
        expiresAt,
        createdBy: user.name || user.id,
      },
    })
  }

  if (status === 'APPROVED' && existing.changeType === 'class_delete') {
    const data = JSON.parse(existing.changeData || '{}')
    const cls = await db.class.findUnique({
      where: { id: data.classId },
      include: { _count: { select: { students: true } } },
    })
    if (!cls || cls.schoolId !== existing.schoolId) {
      return NextResponse.json({ error: 'Classe introuvable dans cette école' }, { status: 404 })
    }
    if (cls._count.students > 0) {
      return NextResponse.json(
        { error: `Impossible d'approuver : ${cls._count.students} élève(s) encore inscrit(s) dans « ${cls.name} »` },
        { status: 400 }
      )
    }
    await db.class.delete({ where: { id: cls.id } })
    await db.school.update({
      where: { id: existing.schoolId },
      data: { classCount: { decrement: 1 } },
    })
  }

  if (status === 'APPROVED' && existing.changeType === 'class_create') {
    const data = JSON.parse(existing.changeData || '{}')
    const className = (data.name || '').trim()
    if (!className || !data.schoolYearId) {
      return NextResponse.json({ error: 'Demande de création incomplète (nom / année scolaire manquants)' }, { status: 400 })
    }
    // Section IMPOSÉE : cycle du demandeur (une direction ne crée que dans son cycle)
    const requester = await db.user.findUnique({ where: { id: existing.requestedBy }, select: { role: true } })
    const imposedSection = getRoleCycle(requester?.role) || data.section || null
    const year = await db.schoolYear.findUnique({ where: { id: data.schoolYearId }, select: { schoolId: true } })
    if (!year || year.schoolId !== existing.schoolId) {
      return NextResponse.json({ error: 'Année scolaire invalide pour cette école' }, { status: 400 })
    }
    const duplicate = await db.class.findUnique({
      where: { name_schoolYearId: { name: className, schoolYearId: data.schoolYearId } },
    })
    if (duplicate) {
      return NextResponse.json({ error: `Impossible d'approuver : la classe « ${className} » existe déjà pour cette année scolaire` }, { status: 400 })
    }
    const created = await db.class.create({
      data: {
        name: className,
        section: imposedSection,
        level: null,
        capacity: Number(data.capacity) > 0 ? Math.round(Number(data.capacity)) : 40,
        schoolId: existing.schoolId,
        schoolYearId: data.schoolYearId,
      },
    })
    await db.school.update({
      where: { id: existing.schoolId },
      data: { classCount: { increment: 1 } },
    })
    try {
      await notifyEvent(
        { type: 'CLASS_CREATED', schoolId: existing.schoolId, classId: created.id, actorId: user.id, section: imposedSection },
        {
          title: 'Nouvelle classe créée',
          message: `Classe « ${className} » - ${imposedSection || ''} - Capacité: ${created.capacity}`,
          relatedId: created.id,
        }
      )
    } catch { /* notification failed, non-critical */ }
  }

  const approval = await db.settingsApproval.update({
    where: { id },
    data: { status, reviewedBy: user.id, reviewedAt: new Date() }
  })

  // Informer le demandeur de la décision
  try {
    const decisionTitle = status === 'APPROVED' ? 'Demande approuvée' : 'Demande rejetée'
    const decisionMsg =
      existing.changeType === 'qr_create'
        ? `Votre demande de QR code a été ${status === 'APPROVED' ? 'approuvée — le QR code est disponible' : 'rejetée'}.`
        : existing.changeType === 'class_delete'
          ? `Votre demande de suppression de classe a été ${status === 'APPROVED' ? 'approuvée — la classe a été supprimée' : 'rejetée'}.`
          : existing.changeType === 'class_create'
            ? `Votre demande de création de classe a été ${status === 'APPROVED' ? 'approuvée — la classe a été créée' : 'rejetée'}.`
            : `Votre demande (${existing.changeType}) a été ${status === 'APPROVED' ? 'approuvée' : 'rejetée'}.`
    await notify({
      data: {
        type: 'APPROVAL_DECIDED',
        title: decisionTitle,
        message: decisionMsg,
        userId: existing.requestedBy,
        schoolId: existing.schoolId,
        relatedId: approval.id,
      },
    })
  } catch { /* notification failed, non-critical */ }

  return NextResponse.json({ data: approval })
}
