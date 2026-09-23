import { db } from '@/lib/db';
import { ROLE_PERMISSIONS } from '@/lib/auth';

/**
 * NotificationRecipientResolver — résolution CENTRALISÉE des destinataires.
 *
 * UNE SEULE logique pour tous les canaux : notifications DB, Web Push,
 * Email, WhatsApp. Aucune route métier ne doit refaire sa propre requête
 * « qui prévenir ? » — elle appelle resolveNotificationRecipients(event).
 *
 * Politique de destinataires (stricte, appliquée par le resolver) :
 *
 *   PAIEMENT (PAYMENT_*)            → Parent de l'élève + CASHIER de l'école
 *                                     + SCHOOL_ADMIN de l'école
 *   NOTES (GRADE_*)                 → Parent + SCHOOL_ADMIN
 *   BULLETINS (BULLETIN_*)          → Parent + SCHOOL_ADMIN
 *   MÉDICAL (MEDICAL_*, DISPENSE)   → Parent + SCHOOL_ADMIN (+ EPS pour les
 *                                     dispenses : besoin métier sport)
 *   DISCIPLINE (DISCIPLINE_INCIDENT)→ Parent + DIRECTION_<cycle>
 *                                     + DISCIPLINE_<cycle> de l'école
 *   CONVOCATION                     → Parent + DIRECTION_<cycle>
 *                                     + DISCIPLINE_<cycle> + SCHOOL_ADMIN
 *                                     + SECRETARY
 *   CONVOCATION_RESPONSE/_RESCHEDULED → DIRECTION_<cycle> + DISCIPLINE_<cycle>
 *                                     + SCHOOL_ADMIN + SECRETARY (et Parent
 *                                     pour un report)
 *   HOMEWORK_ASSIGNED               → Parents de la classe + SCHOOL_ADMIN
 *                                     + DIRECTION_<cycle>
 *   STUDENT_ENROLLED / CLASS_CREATED→ SECRETARY + SCHOOL_ADMIN
 *                                     + DIRECTION_<cycle>
 *   COMMUNICATION_PENDING           → SCHOOL_ADMIN (+ SUPER_ADMIN_GLOBAL)
 *
 * Le resolver vérifie : type d'événement, schoolId, studentId (relation
 * parent-enfant réelle), cycle/section, rôle et permission associée.
 * AUCUNE notification sensible n'est broadcast à toute l'école.
 */

export interface NotificationEvent {
  /** Type d'événement (PAYMENT_CREATED, CONVOCATION, GRADE_CREATED…) */
  type: string;
  /** École cible — TOUS les destinataires sont scellés à cette école. */
  schoolId?: string | null;
  /** Élève concerné (détermine le parent + la classe/cycle). */
  studentId?: string | null;
  /** Classe concernée (devoirs). */
  classId?: string | null;
  /** Cycle explicite (MATERNELLE|PRIMAIRE|SECONDAIRE) si déjà connu. */
  section?: string | null;
  /** Auteur de l'action — exclu par défaut (il SAIT ce qu'il vient de faire). */
  actorId?: string | null;
  /** Exclusions additionnelles explicites. */
  excludeUserIds?: string[];
}

export interface ResolvedNotificationRecipient {
  userId: string;
  role: string;
  /** Pourquoi cette personne est destinataire (audit/debug). */
  reason: string;
}

/** Permission requise pour RECEVOIR chaque famille d'événements
 *  (filtrage final : un destinataire sans la permission est retiré). */
const EVENT_PERMISSION: Record<string, string> = {
  PAYMENT_CREATED: 'payments:read',
  PAYMENT_APPROVED: 'payments:read',
  PAYMENT_REJECTED: 'payments:read',
  PAYMENT_PARTIAL: 'payments:read',
  GRADE_CREATED: 'grades:read',
  GRADE_UPDATED: 'grades:read',
  BULLETIN_UPDATED: 'grades:read',
  BULLETIN_AVAILABLE: 'grades:read',
  REPECHAGE: 'grades:read',
  DISCIPLINE_INCIDENT: 'discipline:read',
  CONVOCATION: 'convocations:read',
  CONVOCATION_RESPONSE: 'convocations:read',
  CONVOCATION_RESCHEDULED: 'convocations:read',
  HOMEWORK_ASSIGNED: 'homework:read',
  STUDENT_ENROLLED: 'students:read',
  CLASS_CREATED: 'classes:read',
  MEDICAL_VISIT: 'students:read',
  MEDICAL_DOCUMENT: 'students:read',
  DISPENSE: 'dispenses:read',
  COMMUNICATION_PENDING: 'communications:read',
};

function roleHasPermission(role: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes('*') || perms.includes(permission);
}

/** Rôles DIRECTION + DISCIPLINE scellés au cycle d'une section.
 *  Section inconnue → les deux familles complètes (comportement historique
 *  des écoles sans section renseignée). */
function cycleRolesForSection(section: string | null | undefined): string[] {
  const cycle = (section || '').toUpperCase();
  const matched: string[] = [];
  const add = (base: 'DIRECTION' | 'DISCIPLINE') => {
    const suffixed = ['MATERNELLE', 'PRIMAIRE', 'SECONDAIRE']
      .map((c) => `${base}_${c}`)
      .filter((r) => !cycle || r.endsWith(`_${cycle}`));
    if (suffixed.length) matched.push(...suffixed);
    // Rôle générique (écoles non segmentées) + le super admin de l'école n'est PAS ici.
    if (cycle) matched.push(base); // générique : couvre tous les cycles
    else matched.push(base);
  };
  add('DIRECTION');
  add('DISCIPLINE');
  return matched;
}

function excludeIds(event: NotificationEvent): Set<string> {
  const set = new Set<string>(event.excludeUserIds || []);
  if (event.actorId) set.add(event.actorId);
  return set;
}

async function push(list: ResolvedNotificationRecipient[], r: ResolvedNotificationRecipient | null) {
  if (r && !list.some((x) => x.userId === r.userId)) list.push(r);
}

async function resolveParent(event: NotificationEvent, reason: string): Promise<ResolvedNotificationRecipient | null> {
  if (!event.studentId) return null;
  const student = await db.student.findUnique({
    where: { id: event.studentId },
    select: { parentId: true },
  });
  if (!student?.parentId) return null;
  return { userId: student.parentId, role: 'PARENT', reason };
}

async function resolveStaffByRoles(
  event: NotificationEvent,
  roles: string[],
  reason: string
): Promise<ResolvedNotificationRecipient[]> {
  if (!event.schoolId || roles.length === 0) return [];
  const users = await db.user.findMany({
    where: { schoolId: event.schoolId, role: { in: roles }, isActive: true },
    select: { id: true, role: true },
  });
  return users.map((u) => ({ userId: u.id, role: u.role, reason }));
}

async function resolveParentsOfClass(event: NotificationEvent): Promise<ResolvedNotificationRecipient[]> {
  if (!event.classId) return [];
  const students = await db.student.findMany({
    where: { classId: event.classId, parentId: { not: null }, isArchived: false },
    select: { parentId: true },
  });
  const out: ResolvedNotificationRecipient[] = [];
  for (const s of students) {
    if (s.parentId) await push(out, { userId: s.parentId, role: 'PARENT', reason: 'PARENT_OF_CLASS_STUDENT' });
  }
  return out;
}

/** Cycle de l'élève (section de sa classe) — utile quand `section` n'est pas fourni. */
async function studentSection(studentId: string): Promise<string | null> {
  const s = await db.student.findUnique({
    where: { id: studentId },
    select: { class: { select: { section: true } } },
  });
  return s?.class?.section ?? null;
}

/**
 * Résout les destinataires d'un événement selon la politique ci-dessus.
 * Toujours : scellé à schoolId, dédupliqué, filtré par permission requise,
 * auteur exclu.
 */
export async function resolveNotificationRecipients(event: NotificationEvent): Promise<ResolvedNotificationRecipient[]> {
  const excluded = excludeIds(event);
  const list: ResolvedNotificationRecipient[] = [];

  const add = async (r: ResolvedNotificationRecipient | null | ResolvedNotificationRecipient[]) => {
    if (!r) return;
    for (const one of Array.isArray(r) ? r : [r]) {
      if (!excluded.has(one.userId)) await push(list, one);
    }
  };

  const staff = (roles: string[], reason: string) => resolveStaffByRoles(event, roles, reason);

  switch (event.type) {
    // ── PAIEMENT : Parent + CASHIER + SCHOOL_ADMIN (même école) ─────────────
    case 'PAYMENT_CREATED':
    case 'PAYMENT_APPROVED':
    case 'PAYMENT_REJECTED':
    case 'PAYMENT_PARTIAL':
      await add(await resolveParent(event, 'PARENT_OF_STUDENT'));
      await add(await staff(['CASHIER'], 'CASHIER_OF_SCHOOL'));
      await add(await staff(['SCHOOL_ADMIN'], 'SCHOOL_ADMIN_OF_SCHOOL'));
      break;

    // ── NOTES : Parent + SCHOOL_ADMIN ────────────────────────────────────────
    case 'GRADE_CREATED':
    case 'GRADE_UPDATED':
    case 'BULLETIN_UPDATED':
    case 'BULLETIN_AVAILABLE':
    case 'REPECHAGE':
      await add(await resolveParent(event, 'PARENT_OF_STUDENT'));
      await add(await staff(['SCHOOL_ADMIN'], 'SCHOOL_ADMIN_OF_SCHOOL'));
      break;

    // ── DISCIPLINE : Parent + DIRECTION_<cycle> + DISCIPLINE_<cycle> ─────────
    case 'DISCIPLINE_INCIDENT': {
      await add(await resolveParent(event, 'PARENT_OF_STUDENT'));
      const section = event.section || (event.studentId ? await studentSection(event.studentId) : null);
      await add(await staff(cycleRolesForSection(section), 'DIRECTION_OR_DISCIPLINE_OF_CYCLE'));
      break;
    }

    // ── CONVOCATION : Parent + DIRECTION_<cycle> + DISCIPLINE_<cycle>
    //    + SCHOOL_ADMIN + SECRETARY ────────────────────────────────────────────
    case 'CONVOCATION': {
      await add(await resolveParent(event, 'PARENT_OF_STUDENT'));
      const section = event.section || (event.studentId ? await studentSection(event.studentId) : null);
      await add(await staff(cycleRolesForSection(section), 'DIRECTION_OR_DISCIPLINE_OF_CYCLE'));
      await add(await staff(['SCHOOL_ADMIN'], 'SCHOOL_ADMIN_OF_SCHOOL'));
      await add(await staff(['SECRETARY'], 'SECRETARY_OF_SCHOOL'));
      break;
    }

    // ── RÉPONSE / REPORT : staff de suivi (+ Parent pour un report) ──────────
    case 'CONVOCATION_RESPONSE': {
      const section = event.section || (event.studentId ? await studentSection(event.studentId) : null);
      await add(await staff(cycleRolesForSection(section), 'DIRECTION_OR_DISCIPLINE_OF_CYCLE'));
      await add(await staff(['SCHOOL_ADMIN'], 'SCHOOL_ADMIN_OF_SCHOOL'));
      await add(await staff(['SECRETARY'], 'SECRETARY_OF_SCHOOL'));
      break;
    }
    case 'CONVOCATION_RESCHEDULED': {
      await add(await resolveParent(event, 'PARENT_OF_STUDENT'));
      const section = event.section || (event.studentId ? await studentSection(event.studentId) : null);
      await add(await staff(cycleRolesForSection(section), 'DIRECTION_OR_DISCIPLINE_OF_CYCLE'));
      await add(await staff(['SCHOOL_ADMIN'], 'SCHOOL_ADMIN_OF_SCHOOL'));
      await add(await staff(['SECRETARY'], 'SECRETARY_OF_SCHOOL'));
      break;
    }

    // ── MÉDICAL : Parent + SCHOOL_ADMIN (+ EPS pour dispenses) ───────────────
    case 'MEDICAL_VISIT':
    case 'MEDICAL_DOCUMENT':
      await add(await resolveParent(event, 'PARENT_OF_STUDENT'));
      await add(await staff(['SCHOOL_ADMIN'], 'SCHOOL_ADMIN_OF_SCHOOL'));
      break;
    case 'DISPENSE':
      await add(await resolveParent(event, 'PARENT_OF_STUDENT'));
      await add(await staff(['SCHOOL_ADMIN'], 'SCHOOL_ADMIN_OF_SCHOOL'));
      await add(await staff(['EPS'], 'EPS_OF_SCHOOL'));
      break;

    // ── DEVOIRS : Parents de la classe + SCHOOL_ADMIN + DIRECTION_<cycle> ────
    case 'HOMEWORK_ASSIGNED': {
      await add(await resolveParentsOfClass(event));
      await add(await staff(['SCHOOL_ADMIN'], 'SCHOOL_ADMIN_OF_SCHOOL'));
      const section = event.section || (event.classId ? (await db.class.findUnique({ where: { id: event.classId }, select: { section: true } }))?.section ?? null : null);
      await add(await staff(directionOnly(section), 'DIRECTION_OF_CYCLE'));
      break;
    }

    // ── INSCRIPTIONS / CLASSES : SECRETARY + SCHOOL_ADMIN + DIRECTION_<cycle> ─
    case 'STUDENT_ENROLLED':
    case 'CLASS_CREATED': {
      await add(await staff(['SECRETARY'], 'SECRETARY_OF_SCHOOL'));
      await add(await staff(['SCHOOL_ADMIN'], 'SCHOOL_ADMIN_OF_SCHOOL'));
      const section = event.section
        || (event.classId ? (await db.class.findUnique({ where: { id: event.classId }, select: { section: true } }))?.section ?? null : null)
        || (event.studentId ? await studentSection(event.studentId) : null);
      await add(await staff(directionOnly(section), 'DIRECTION_OF_CYCLE'));
      break;
    }

    // ── VALIDATION DE COMMUNICATION : SCHOOL_ADMIN (+ plateforme) ────────────
    case 'COMMUNICATION_PENDING':
      await add(await staff(['SCHOOL_ADMIN'], 'SCHOOL_ADMIN_OF_SCHOOL'));
      await add(await staff(['SUPER_ADMIN_GLOBAL'], 'PLATFORM_APPROVER'));
      break;

    default:
      // Famille inconnue : aucun destinataire implicite. Les événements à
      // destinataire explicite (plateforme, abonnement, approbations) ne
      // passent PAS par le resolver — ils notifient des userId précis.
      break;
  }

  // Filtre final par permission requise pour CE type d'événement.
  const required = EVENT_PERMISSION[event.type];
  return required ? list.filter((r) => roleHasPermission(r.role, required)) : list;
}

/** Rôles DIRECTION uniquement (sans DISCIPLINE) scellés au cycle. */
function directionOnly(section: string | null | undefined): string[] {
  return cycleRolesForSection(section).filter((r) => r.startsWith('DIRECTION'));
}

/**
 * Variante "parent lié par relation Parent-Child" pour les écoles qui
 * relient plusieurs enfants à un parent — utilisée par les tests de
 * scellement parent/enfant.
 */
export async function isParentOfStudent(parentId: string, studentId: string): Promise<boolean> {
  const s = await db.student.findFirst({ where: { id: studentId, parentId }, select: { id: true } });
  return Boolean(s);
}
