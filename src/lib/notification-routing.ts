/**
 * Routage centralisé des notifications EduGest.
 *
 * SINGLE SOURCE OF TRUTH (client + serveur) :
 *   notificationType → vue cible PAR RÔLE → URL réelle (VIEW_PATHS).
 *
 * Règle d'or : une notification ne doit JAMAIS ouvrir une vue inexistante ou
 * inaccessible pour le rôle du destinataire (ex. un Parent vers `payments`,
 * un DISCIPLINE_* vers `convocation`). Chaque couple (type, rôle) est donc
 * résolu explicitement ci-dessous, avec repli systématique sur `dashboard`.
 *
 * Utilisé par :
 *   - le serveur (notification-service.ts) : URL des payloads Web Push ;
 *   - le client (page.tsx Topbar) : navigation au clic sur une notification.
 *
 * Ce module ne dépend d'aucune couche serveur (pas de Prisma) : il est
 * importable tel quel dans le bundle client comme dans les routes API.
 */

import { viewToPath } from '@/lib/view-paths';

/** Vues accessibles aux rôles qui reçoivent des notifications.
 *  Aligné sur VIEWS_BY_ROLE (page.tsx) — miroir minimal volontaire pour
 *  rester importable côté serveur. Toute divergence est couverte par le
 *  repli `dashboard` du client (canAccessView). */
const ROLE_VIEWS: Record<string, ReadonlySet<string>> = {
  PARENT: new Set(['dashboard', 'grades', 'bulletin', 'online-payment', 'payment-verification', 'discipline', 'homework', 'communications', 'convocation', 'school-reviews', 'profile']),
  TEACHER: new Set(['dashboard', 'classes', 'grades', 'homework', 'communications', 'profile']),
  HEAD_TEACHER: new Set(['dashboard', 'classes', 'grades', 'homework', 'bulletin', 'communications', 'profile']),
  SECRETARY: new Set(['dashboard', 'students', 'classes', 'convocation', 'discipline', 'payments', 'finance', 'communications', 'payment-verification', 'class-passing', 'parent-qr', 'settings', 'profile']),
  CASHIER: new Set(['dashboard', 'payments', 'finance', 'payment-verification', 'debts', 'communications', 'profile']),
  DIRECTION: new Set(['dashboard', 'students', 'classes', 'discipline', 'payment-verification', 'convocation', 'communications', 'settings', 'profile']),
  DISCIPLINE: new Set(['dashboard', 'discipline', 'communications', 'profile']),
  SCHOOL_ADMIN: new Set(['dashboard', 'students', 'classes', 'personnel', 'grades', 'payments', 'finance', 'payment-verification', 'payment-config', 'discipline', 'convocation', 'communications', 'homework', 'class-passing', 'bulletin', 'medical', 'medical-records', 'parent-qr', 'parents', 'personalization', 'whatsapp-config', 'settings', 'profile']),
  MEDICAL: new Set(['dashboard', 'medical', 'medical-records', 'students', 'communications', 'profile']),
  EPS: new Set(['dashboard', 'students', 'classes', 'grades', 'communications', 'profile']),
  ADMIN_FREEMIUM: new Set(['dashboard', 'students', 'classes', 'payments', 'payment-verification', 'payment-config', 'settings', 'profile']),
  // Le super admin plateforme peut tout ouvrir.
  SUPER_ADMIN_GLOBAL: new Set(['*']),
};

const EVERYWHERE = ROLE_VIEWS.SUPER_ADMIN_GLOBAL;

function roleKey(role: string): string {
  if (ROLE_VIEWS[role]) return role;
  // Familles de rôles à suffixe de cycle (DIRECTION_PRIMAIRE, DISCIPLINE_MATERNELLE…)
  if (role.startsWith('DIRECTION')) return 'DIRECTION';
  if (role.startsWith('DISCIPLINE')) return 'DISCIPLINE';
  return role;
}

/** Le rôle peut-il ouvrir cette vue ? (décision de routage notification uniquement) */
function roleHasView(role: string | null | undefined, view: string): boolean {
  if (!role) return false;
  const set = ROLE_VIEWS[roleKey(role)];
  if (!set) return false;
  return set.has('*') ? true : set.has(view);
}

/** Vue par défaut d'un type de notification (pour les rôles « génériques »).
 *  Per-role: voir NOTIF_VIEW_BY_ROLE. */
const NOTIF_BASE_VIEW: Record<string, string> = {
  PAYMENT_CREATED: 'payments',
  PAYMENT_APPROVED: 'payments',
  PAYMENT_REJECTED: 'payments',
  PAYMENT_PARTIAL: 'payments',
  GRADE_CREATED: 'grades',
  GRADE_UPDATED: 'grades',
  BULLETIN_UPDATED: 'bulletin',
  BULLETIN_AVAILABLE: 'bulletin',
  CLASS_PASSING: 'class-passing',
  REPECHAGE: 'grades',
  DISCIPLINE_INCIDENT: 'discipline',
  CONVOCATION: 'convocation',
  CONVOCATION_RESPONSE: 'convocation',
  CONVOCATION_RESCHEDULED: 'convocation',
  HOMEWORK_ASSIGNED: 'homework',
  STUDENT_ENROLLED: 'students',
  STUDENT_ENROLLED_PARENT: 'students',
  CLASS_CREATED: 'classes',
  MEDICAL_VISIT: 'medical',
  MEDICAL_DOCUMENT: 'medical-records',
  DISPENSE: 'medical',
  COMMUNICATION: 'communications',
  COMMUNICATION_PENDING: 'communications',
  COMMUNICATION_APPROVED: 'communications',
  COMMUNICATION_REJECTED: 'communications',
  PLATFORM_ANNOUNCEMENT: 'communications',
  APPROVAL_REQUESTED: 'settings',
  APPROVAL_DECIDED: 'parent-qr',
  SUBSCRIPTION_EXPIRING: 'my-subscription',
  SUBSCRIPTION_PAYMENT: 'my-subscription',
};

/** Surcharges PAR RÔLE : le même événement n'ouvre pas la même vue selon
 *  qui le reçoit (ex. un paiement → `payments` pour la caisse, mais
 *  `payment-verification` pour un parent — le parent n'a PAS de vue `payments`). */
const NOTIF_VIEW_BY_ROLE: Record<string, Record<string, string>> = {
  // ── Paiements ────────────────────────────────────────────────────────────
  PAYMENT_CREATED: { PARENT: 'payment-verification', SECRETARY: 'payments', CASHIER: 'payments', SCHOOL_ADMIN: 'payments', DIRECTION: 'payment-verification' },
  PAYMENT_APPROVED: { PARENT: 'payment-verification', SECRETARY: 'payment-verification', CASHIER: 'payment-verification', SCHOOL_ADMIN: 'payment-verification', DIRECTION: 'payment-verification' },
  PAYMENT_REJECTED: { PARENT: 'payment-verification', SECRETARY: 'payment-verification', CASHIER: 'payment-verification', SCHOOL_ADMIN: 'payment-verification', DIRECTION: 'payment-verification' },
  PAYMENT_PARTIAL: { PARENT: 'payment-verification', SECRETARY: 'payments', CASHIER: 'payments', SCHOOL_ADMIN: 'payments', DIRECTION: 'payment-verification' },
  // ── Convocations : les rôles DISCIPLINE_* gèrent les convocations depuis
  //    leur vue `discipline` (aucune vue `convocation` pour eux) ─────────────
  CONVOCATION: { DISCIPLINE: 'discipline' },
  CONVOCATION_RESPONSE: { DISCIPLINE: 'discipline' },
  CONVOCATION_RESCHEDULED: { DISCIPLINE: 'discipline' },
  // ── Médical : le parent n'a pas de vue médical → dashboard (détails dans
  //    l'app derrière les permissions) ───────────────────────────────────────
  MEDICAL_VISIT: { PARENT: 'dashboard' },
  MEDICAL_DOCUMENT: { PARENT: 'dashboard' },
  DISPENSE: { EPS: 'dashboard', PARENT: 'dashboard' },
  // ── Approbations ─────────────────────────────────────────────────────────
  APPROVAL_REQUESTED: { SECRETARY: 'settings', SCHOOL_ADMIN: 'settings' },
  APPROVAL_DECIDED: { SECRETARY: 'parent-qr', SCHOOL_ADMIN: 'parent-qr', SUPER_ADMIN_GLOBAL: 'parent-qr' },
  // ── Abonnement ───────────────────────────────────────────────────────────
  SUBSCRIPTION_EXPIRING: { SCHOOL_ADMIN: 'my-subscription' },
  SUBSCRIPTION_PAYMENT: { SUPER_ADMIN_GLOBAL: 'schools', SCHOOL_ADMIN: 'my-subscription' },
  // ── Passage de classe : staff de l'école ─────────────────────────────────
  CLASS_PASSING: { SECRETARY: 'class-passing', SCHOOL_ADMIN: 'class-passing', SUPER_ADMIN_GLOBAL: 'class-passing' },
};

/**
 * Résout la vue cible d'une notification pour un type + un rôle donnés.
 * Retourne TOUJOURS une vue ouverte au rôle (repli `dashboard`).
 */
export function resolveNotifView(type: string, role: string | null | undefined): string {
  const perRole = NOTIF_VIEW_BY_ROLE[type]?.[role || ''];
  if (perRole && roleHasView(role, perRole)) return perRole;

  const base = NOTIF_BASE_VIEW[type] || 'dashboard';
  if (roleHasView(role, base)) return base;

  // Repli générique : communications pour les événements de validation,
  // dashboard pour tout le reste.
  const fallback = type.includes('COMMUNICATION') ? 'communications' : 'dashboard';
  return roleHasView(role, fallback) ? fallback : 'dashboard';
}

/**
 * URL réelle (chemin navigateur) d'une notification pour un rôle —
 * utilisée dans les payloads Web Push (sw.js → notificationclick).
 */
export function notifUrlForRole(type: string, role: string | null | undefined): string {
  return viewToPath(resolveNotifView(type, role));
}

/** Catégorie de priorité sonore dérivée du type (client uniquement —
 *  le modèle Notification n'a pas de champ priorité ; on n'en prétend pas). */
export type NotifSoundLevel = 'NORMAL' | 'HIGH';

export function notifSoundLevel(type: string): NotifSoundLevel {
  if (
    type.startsWith('CONVOCATION') ||
    type === 'APPROVAL_REQUESTED' ||
    type === 'SUBSCRIPTION_EXPIRING' ||
    type.startsWith('MEDICAL')
  ) return 'HIGH';
  return 'NORMAL';
}
