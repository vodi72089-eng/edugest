import { db } from './db';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { normalizeClientIp } from './geo';

// ─── Session store (DB — Node + Cloudflare Workers) ────────────────────────
// Session shape (v2 — supports connected-devices feature):
//   {
//     sid: string          // session id (crypto.randomUUID), safe to expose to UI
//     userId: string
//     expiresAt: number    // epoch ms
//     createdAt: number    // epoch ms
//     lastUsedAt: number   // epoch ms, refreshed (throttled) on validateSession
//     userAgent: string    // from request headers at creation
//     ip: string           // from request headers at creation
//   }
// Store en base (modèle Session) : workerd n'a pas de système de fichiers.
// Durée de session : 24 h sur le web. L'app desktop surcharge via
// EDUGEST_SESSION_DAYS (ex: 30) pour rester connectée, MAJ incluses.
// Exportée : la durée du cookie httpOnly DOIT être alignée sur celle de la
// session en base (un cookie plus court déconnecte avant l'expiration DB ;
// un cookie plus long envoie un token déjà révoqué/expiré).
export const SESSION_DURATION_MS =
  (Number.parseInt(process.env.EDUGEST_SESSION_DAYS || '', 10) || 1) * 24 * 60 * 60 * 1000;
// Throttle: only persist lastUsedAt if it's older than this, to avoid a write
// on every single API request.
const LAST_USED_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface GeoLocation {
  city: string;
  region: string;
  country: string;
  isp: string;
  lat: number;
  lon: number;
}

export interface SessionData {
  sid: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  lastUsedAt: number;
  userAgent: string;
  ip: string;
  // ── Enrichissement appareil (optionnel, écrit par /api/sessions/device) ──
  fingerprintId?: string;
  screen?: string;
  gpu?: string;
  battery?: string;
  languages?: string;
  timezone?: string;
  memory?: string;
  cores?: string;
  network?: string;
  location?: GeoLocation | null;
}

export interface SessionListItem {
  sid: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  userAgent: string;
  ip: string;
  isCurrent: boolean;
  fingerprintId?: string;
  screen?: string;
  gpu?: string;
  battery?: string;
  languages?: string;
  timezone?: string;
  memory?: string;
  cores?: string;
  network?: string;
  location?: GeoLocation | null;
}

// ── Helpers de conversion (DB ↔ forme SessionData) ───────────────────────
function toSessionData(s: {
  sid: string; userId: string; expiresAt: Date; createdAt: Date; lastUsedAt: Date;
  userAgent: string; ip: string; fingerprintId: string; screen: string; gpu: string;
  battery: string; languages: string; timezone: string; memory: string; cores: string;
  network: string; location: unknown;
}): SessionData {
  return {
    sid: s.sid,
    userId: s.userId,
    expiresAt: s.expiresAt.getTime(),
    createdAt: s.createdAt.getTime(),
    lastUsedAt: s.lastUsedAt.getTime(),
    userAgent: s.userAgent,
    ip: s.ip,
    fingerprintId: s.fingerprintId,
    screen: s.screen,
    gpu: s.gpu,
    battery: s.battery,
    languages: s.languages,
    timezone: s.timezone,
    memory: s.memory,
    cores: s.cores,
    network: s.network,
    location: (s.location && typeof s.location === 'object' ? s.location : null) as GeoLocation | null,
  };
}

export async function createSession(userId: string, meta: SessionMeta = {}): Promise<string> {
  const token = crypto.randomUUID();
  const now = new Date();
  await db.session.create({
    data: {
      token,
      sid: crypto.randomUUID(),
      userId,
      expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
      createdAt: now,
      lastUsedAt: now,
      userAgent: meta.userAgent || '',
      ip: meta.ip || '',
    },
  });
  return token;
}

export async function validateSession(token: string): Promise<{ userId: string } | null> {
  const s = await db.session.findUnique({ where: { token } });
  if (!s) return null;
  if (Date.now() > s.expiresAt.getTime()) {
    await db.session.delete({ where: { token } }).catch(() => {});
    return null;
  }
  // Throttled refresh of lastUsedAt — avoids a write on every request.
  const now = Date.now();
  if (s.lastUsedAt.getTime() === 0 || now - s.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
    await db.session.update({ where: { token }, data: { lastUsedAt: new Date(now) } });
  }
  return { userId: s.userId };
}

// ─── Session enumeration & revocation (connected-devices feature) ─────────
// Liste les sessions appartenant à `userId`. `currentToken` (optionnel) marque
// la session appelante comme isCurrent.
export async function listUserSessions(userId: string, currentToken?: string): Promise<SessionListItem[]> {
  const sessions = await db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
  });
  return sessions.map((s) => ({
    sid: s.sid || s.token.slice(0, 8),
    createdAt: s.createdAt.getTime(),
    lastUsedAt: s.lastUsedAt.getTime(),
    expiresAt: s.expiresAt.getTime(),
    userAgent: s.userAgent,
    ip: s.ip,
    isCurrent: !!currentToken && s.token === currentToken,
  }));
}

// Revoke a session by its token (used by /api/auth/logout).
export async function revokeSessionByToken(token: string): Promise<boolean> {
  const res = await db.session.deleteMany({ where: { token } });
  return res.count > 0;
}

// Write device-enrichment fields (fingerprint + hardware signals) into the
// session for a given token. Only known string fields are accepted.
export async function updateSessionDeviceData(token: string, device: Record<string, unknown>): Promise<boolean> {
  const allowed = ['fingerprintId', 'screen', 'gpu', 'battery', 'languages', 'timezone', 'memory', 'cores', 'network'] as const;
  const data: Record<string, string> = {};
  for (const key of allowed) {
    const value = device[key];
    if (typeof value === 'string' && value.trim() !== '') data[key] = value;
  }
  if (Object.keys(data).length === 0) return true;
  const res = await db.session.updateMany({ where: { token }, data });
  return res.count > 0;
}

// Persist the resolved IP geolocation into the session matching `sid`.
// (sid is safe to expose, tokens never leave the server.)
export async function updateSessionLocationBySid(userId: string, sid: string, location: GeoLocation | null): Promise<boolean> {
  const res = await db.session.updateMany({
    where: { userId, sid },
    data: { location: location === null ? { set: null } : (location as unknown as Prisma.InputJsonValue) },
  });
  return res.count > 0;
}

// Revoke a specific session by its sid (safe — the actual auth token never
// leaves the server). Returns true if a session was found & deleted.
export async function revokeSessionBySid(userId: string, sid: string): Promise<boolean> {
  const res = await db.session.deleteMany({ where: { userId, sid } });
  return res.count > 0;
}

// Revoke ALL sessions for a user EXCEPT the current token. Used after a
// password change to force re-login on other devices.
export async function revokeAllUserSessionsExcept(userId: string, exceptToken: string): Promise<number> {
  const res = await db.session.deleteMany({
    where: { userId, token: { not: exceptToken } },
  });
  return res.count;
}

// Extract the bearer token from a request (for marking isCurrent in list).
export function getTokenFromRequest(request: NextRequest): string | null {
  return getAuthTokenFromRequest(request);
}

/**
 * Extrait le token de session d'une requête — COOKIE httpOnly D'ABORD, puis
 * en-tête Authorization: Bearer (compatibilité clients non-navigateurs :
 * app mobile, scripts).
 * SÉCURITÉ : le cookie est httpOnly → le JavaScript ne peut pas le lire ni le
 * voler via XSS ; SameSite=Lax bloque les envois cross-site (CSRF) ; Secure
 * en production force le chiffrement du transport.
 */
export function getAuthTokenFromRequest(request: NextRequest): string | null {
  const cookieToken = request.cookies?.get('edugest_token')?.value;
  if (cookieToken) return cookieToken;
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

// Best-effort client IP extraction from common proxy headers.
export function getClientIp(request: NextRequest): string {
  // Normalisation centralisée (geo.ts) : 1re IP d'un x-forwarded-for CSV,
  // retrait du préfixe ::ffff: et des crochets [IPv6] — sans cela une IP
  // LAN « ::ffff:192.168.x » passait le garde-fou d'IP privée côté géoloc.
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = normalizeClientIp(xff);
    if (first) return first;
  }
  const xreal = request.headers.get('x-real-ip');
  if (xreal) return normalizeClientIp(xreal);
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return normalizeClientIp(cf);
  return '';
}

export function getUserAgentFromRequest(request: NextRequest): string {
  return request.headers.get('user-agent') || '';
}

export async function createToken(userData: {
  id: string; name: string; email: string | null; phone: string | null;
  role: string; schoolId: string | null; isActive: boolean;
}, meta: SessionMeta = {}): Promise<string> {
  return await createSession(userData.id, meta);
}

export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  return await validateSession(token);
}

// ─── Auth helpers ──────────────────────────────────────────────────────────
export interface AuthUser {
  id: string; name: string; email: string | null; phone: string | null;
  role: string; schoolId: string | null; isActive: boolean;
}

export async function requireAuth(request: NextRequest): Promise<{ user: AuthUser } | { error: Response }> {
  // Cookie httpOnly en priorité, Authorization: Bearer en repli (clients API).
  const token = getAuthTokenFromRequest(request);
  if (!token) {
    return { error: Response.json({ error: 'Authentification requise' }, { status: 401 }) };
  }
  const session = await validateSession(token);
  if (!session) return { error: Response.json({ error: 'Session expirée ou invalide' }, { status: 401 }) };
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, phone: true, role: true, schoolId: true, isActive: true },
  });
  if (!user || !user.isActive) return { error: Response.json({ error: 'Compte désactivé ou introuvable' }, { status: 401 }) };
  return { user };
}

export async function requireRole(request: NextRequest, allowedRoles: string[]): Promise<{ user: AuthUser } | { error: Response }> {
  const authResult = await requireAuth(request);
  if ('error' in authResult) return authResult;
  if (!allowedRoles.includes(authResult.user.role)) return { error: Response.json({ error: 'Accès non autorisé' }, { status: 403 }) };
  return authResult;
}

// ─── Cycle mapping pour les rôles DIRECTION_* et DISCIPLINE_* ───────────────
// Un rôle DIRECTION_* ou DISCIPLINE_* est automatiquement lié à UN cycle
// unique : la direction/discipline maternelle ne voit que la maternelle, etc.
// Ce mapping est la source de vérité partagée par les routes API (scoping
// serveur) — les comptes DISCIPLINE_* voyaient autrefois TOUS les élèves de
// l'école quelle que soit leur variante de cycle.
export const ROLE_CYCLE_MAP: Record<string, string> = {
  DIRECTION_MATERNELLE: 'MATERNELLE',
  DIRECTION_PRIMAIRE: 'PRIMAIRE',
  DIRECTION_SECONDAIRE: 'SECONDAIRE',
  DISCIPLINE_MATERNELLE: 'MATERNELLE',
  DISCIPLINE_PRIMAIRE: 'PRIMAIRE',
  DISCIPLINE_SECONDAIRE: 'SECONDAIRE',
};

// Renvoie le cycle imposé par le rôle ('MATERNELLE'|'PRIMAIRE'|'SECONDAIRE') ou null
export function getRoleCycle(role: string | null | undefined): string | null {
  if (!role) return null;
  return ROLE_CYCLE_MAP[role] || null;
}

// Variantes de casse d'un cycle : la base contient un mélange historique
// (« MATERNELLE », « Maternelle », « PrImAiRe »…). SQLite n'a pas de
// comparaison insensible à la casse fiable via Prisma → on filtre avec `in`.
export function sectionVariantsForCycle(cycle: string): string[] {
  const c = (cycle || '').toUpperCase();
  if (!c) return [];
  const title = c.charAt(0) + c.slice(1).toLowerCase();
  return Array.from(new Set([c, title, c.toLowerCase()]));
}

// Filtre Prisma `section` pour un cycle donné (toutes les casses connues)
export function sectionFilterForCycle(cycle: string): { in: string[] } | Record<string, never> {
  const variants = sectionVariantsForCycle(cycle);
  return variants.length ? { in: variants } : {};
}

// ─── Filtre cycle TOLÉRANT (maternelle) ──────────────────────────────────────
// Les classes maternelle sont parfois créées SANS section (ou « Préscolaire ») :
// le filtre par section seule rendait alors tous les élèves invisibles aux
// comptes DISCIPLINE_MATERNELLE / DIRECTION_MATERNELLE (recherche vide,
// convocation impossible). On élargit le maternelle au NOM de la classe :
// M1/M2/M3, PS/MS/GS (petite/moyenne/grande section), Préscolaire, Maternelle.
const MATERNELLE_NAME_PREFIXES = ['M1', 'M2', 'M3', 'PS', 'MS', 'GS'];
const MATERNELLE_NAME_CONTAINS = ['maternelle', 'préscolaire', 'prescolaire', 'PRESCOLAIRE', 'MATERNELLE'];

export function classFilterForCycle(cycle: string): Record<string, unknown> {
  const c = (cycle || '').toUpperCase();
  const sectionFilter = sectionFilterForCycle(c);
  if (c !== 'MATERNELLE') return { section: sectionFilter };
  return {
    OR: [
      { section: sectionFilter },
      ...MATERNELLE_NAME_PREFIXES.map(p => ({ name: { startsWith: p } })),
      ...MATERNELLE_NAME_PREFIXES.map(p => ({ name: { startsWith: p.toLowerCase() } })),
      ...MATERNELLE_NAME_CONTAINS.map(n => ({ name: { contains: n } })),
    ],
  };
}

/** Vérif JS côté écriture : une classe (section + nom) appartient-elle au cycle ? */
export function classMatchesCycle(
  section: string | null | undefined,
  className: string | null | undefined,
  cycle: string
): boolean {
  const c = (cycle || '').toUpperCase();
  const s = (section || '').toUpperCase();
  if (s === c) return true;
  if (c !== 'MATERNELLE') return false;
  const nu = (className || '').toUpperCase();
  if (!nu) return false;
  if (MATERNELLE_NAME_PREFIXES.some(p => nu.startsWith(p))) return true;
  if (MATERNELLE_NAME_CONTAINS.some(k => nu.includes(k.toUpperCase()))) return true;
  return false;
}

// Rôles DIRECTION destinataires pour une section de classe donnée.
// Section inconnue/vide → toutes les directions (comportement historique).
export function directionRolesForSection(section: string | null | undefined): string[] {
  const cycle = (section || '').toUpperCase();
  const matched = Object.entries(ROLE_CYCLE_MAP)
    .filter(([, c]) => c === cycle)
    .map(([r]) => r);
  return matched.length ? matched : Object.keys(ROLE_CYCLE_MAP);
}

// ─── Permission-based auth ─────────────────────────────────────────────────
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN_GLOBAL: ['*'],
  DIRECTION: [
    'users:read', 'users:create', 'users:update',
    'students:read', 'students:create', 'students:update',
    'payments:read', 'payments:create',
    'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'classes:create', 'classes:update',
    'subjects:read', 'subjects:create',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'stats:read', 'profile:read', 'profile:update',
    'schools:read',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
    'notifications:read',
  ],
  SECRETARY: [
    'school:read',
    'users:read', 'users:create', 'users:update',
    'students:read', 'students:create', 'students:update', 'students:delete',
    'classes:read', 'classes:create', 'classes:update',
    'subjects:read', 'subjects:create',
    'grades:read',
    'payments:read', 'payments:verify', 'payments:create', 'payments:update',
    'discipline:read', 'communications:read', 'communications:create',
    'homework:read', 'convocations:read', 'convocations:create',
    'stats:read', 'profile:read', 'profile:update',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
    'notifications:read',
  ],
  ADMIN_FREEMIUM: [
    'school:read',
    'users:read', 'users:create', 'users:update',
    'students:read', 'students:create', 'students:update',
    'classes:read', 'classes:create',
    'subjects:read', 'subjects:create',
    'grades:read',
    'profile:read', 'profile:update',
    'notifications:read',
  ],
  CASHIER: [
    'school:read',
    'students:read',
    'payments:read', 'payments:create', 'payments:update', 'payments:verify',
    'communications:read',
    'stats:read', 'profile:read', 'profile:update',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
    'notifications:read',
  ],
  DIRECTION_MATERNELLE: [
    'school:read', 'users:read', 'students:read', 'students:update', 'students:create',
    'classes:read', 'classes:create', 'classes:update', 'classes:delete',
    'subjects:read', 'subjects:create', 'grades:read', 'grades:create', 'grades:update',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update',
    'notifications:read',
  ],
  DIRECTION_PRIMAIRE: [
    'school:read', 'users:read', 'students:read', 'students:update', 'students:create',
    'classes:read', 'classes:create', 'classes:update', 'classes:delete',
    'subjects:read', 'subjects:create', 'grades:read', 'grades:create', 'grades:update',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
    'notifications:read',
  ],
  DIRECTION_SECONDAIRE: [
    'school:read', 'users:read', 'students:read', 'students:update', 'students:create',
    'classes:read', 'classes:create', 'classes:update', 'classes:delete',
    'subjects:read', 'subjects:create', 'grades:read', 'grades:create', 'grades:update',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
    'notifications:read',
  ],
  DISCIPLINE_MATERNELLE: [
    'school:read', 'students:read', 'classes:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'attendance:read', 'attendance:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read',
    'profile:read', 'profile:update', 'notifications:read',
  ],
  DISCIPLINE_PRIMAIRE: [
    'school:read', 'students:read', 'classes:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'attendance:read', 'attendance:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read',
    'profile:read', 'profile:update', 'notifications:read',
  ],
  DISCIPLINE_SECONDAIRE: [
    'school:read', 'students:read', 'classes:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'attendance:read', 'attendance:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read',
    'profile:read', 'profile:update', 'notifications:read',
  ],
  HEAD_TEACHER: [
    'students:read', 'students:create', 'students:update',
    'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'classes:update',
    'subjects:read',
    'discipline:read', 'discipline:create',
    // Convocations retirées : seuls les PARENTS, la DIRECTION, la DISCIPLINE,
    // l'ADMIN DE L'ÉCOLE et le SECRÉTAIRE voient les convocations. Un professeur
    // (titulaire inclus) ne voit que les notes et les communications reçues.
    'homework:read', 'homework:create',
    'communications:read',
    'stats:read',
    'notifications:read',
  ],
  TEACHER: [
    'students:read',
    'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'subjects:read',
    'homework:read', 'homework:create',
    'discipline:read',
    // Conduite : le prof soumet des demandes de points (création) —
    // l'approbation reste réservée au disciplinaire (discipline:update).
    'discipline:create',
    'communications:read',
    'notifications:read',
  ],
  PARENT: [
    'students:read', 'payments:read', 'grades:read', 'convocations:read', 'convocations:update', 'profile:read', 'profile:update',
    'communications:read', 'homework:read', 'discipline:read', 'stats:read',
    'classes:read', 'subjects:read', 'school:read',
    'notifications:read',
  ],
  DISCIPLINE: [
    'students:read', 'classes:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create',
    'communications:read',
    'stats:read', 'notifications:read',
  ],
  EPS: [
    'school:read', 'students:read', 'classes:read', 'grades:read', 'subjects:read',
    'dispenses:read', 'communications:read', 'homework:read',
    'profile:read', 'profile:update', 'notifications:read',
  ],
  MEDICAL: [
    'school:read', 'students:read', 'students:update', 'classes:read',
    'dispenses:read', 'dispenses:create', 'dispenses:update',
    'communications:read', 'communications:create',
    'profile:read', 'profile:update', 'notifications:read',
  ],
  SCHOOL_ADMIN: [
    'school:read',
    'comments:approve', 'comments:delete', // modération des avis de sa propre école
    'users:read', 'users:create', 'users:update', 'users:delete',
    'students:read', 'students:create', 'students:update', 'students:delete',
    'payments:read', 'payments:create', 'payments:update', 'payments:verify',
    'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'classes:create', 'classes:update', 'classes:delete',
    'subjects:read', 'subjects:create',
    'discipline:read', 'discipline:create', 'discipline:update',
    'attendance:read', 'attendance:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'stats:read', 'profile:read', 'profile:update',
    'schools:read',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
    'notifications:read',
    // Support EduGest : l'admin d'école peut ouvrir des tickets et discuter
    // avec le support client / l'agent IA.
    'support:read', 'support:create',
  ],
  // ── Compte CORPORATE (client multi-écoles) : hors école (schoolId null),
  // voit SES écoles agrégées. Différent d'un compte école par conception. ──
  CORPORATE_ADMIN: [
    'corporate:read', 'corporate-schools:read',
    'support:read', 'support:create', // tickets + agent IA
    'stats:read', 'profile:read', 'profile:update', 'notifications:read',
  ],
  // ── Support client EduGest : accomplit les tâches avec les corporates
  // (tickets, réponses, relances) + lecture du journal d'activité. ──
  SUPPORT_AGENT: [
    'support:read', 'support:create', 'support:handle', // file complète + réponses + statuts
    'corporate:read', 'corporate-schools:read', // contexte client pour traiter les demandes
    'logs:read',
    'profile:read', 'profile:update',
  ],
};

// ─── School-tier-aware permission resolution ─────────────────────────────────
// Tier ESSENTIEL: Élèves, Classes, Notes, Parents, Paiements, Devoirs, Discipline
// Tier STANDARD: Tout Essentiel + Bulletins, Communications, Convocations
// Tier FREEMIUM: Élèves, Classes, Notes, Paiements (le plus limité)

// Permissions RESTREINTES au tier ESSENTIEL (retirées par rapport à STANDARD+)
const ESSENTIEL_DENIED = [
  'communications:read', 'communications:create',
  'convocations:read', 'convocations:create', 'convocations:update',
  'payments:verify', // Pas de vérification de paiements côté admin essentiel
  'school:update', 'users:delete', // Pas de suppression d'utilisateurs
  'payment-gateways:manage', 'currency:manage', 'transactions:read', // Pas de config paiements
]

// Permissions RESTREINTES au tier FREEMIUM (le plus limité)
const FREEMIUM_DENIED = [
  ...ESSENTIEL_DENIED,
  'payments:create', 'payments:update', 'payments:verify',
  'homework:create', 'homework:read',
  'discipline:create', 'discipline:update',
  'subjects:create',
  'users:create', 'users:delete',
  'school:update',
]

// Permissions ajoutées aux DIRECTION_* en FREEMIUM (bonus)
const FREEMIUM_ADMIN_ROLES = ['DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE']

async function getEffectivePermissions(role: string, schoolId: string | null): Promise<string[]> {
  const base = ROLE_PERMISSIONS[role] || []
  if (!schoolId) return base

  const school = await db.school.findUnique({ where: { id: schoolId }, select: { subscriptionTier: true } })
  const tier = school?.subscriptionTier || 'FREEMIUM'

  // --- Rôles DIRECTION_* d'une école FREEMIUM : bonus SECRETARY (gérance de
  // leur école) — comportement produit conservé, la matrice des features
  // (requireFeature) continue de s'appliquer par ailleurs ---
  if (FREEMIUM_ADMIN_ROLES.includes(role) && tier === 'FREEMIUM') {
    const secretaryPerms = ROLE_PERMISSIONS['SECRETARY'] || []
    const merged = [...new Set([...base, ...secretaryPerms])]
    merged.push('school:update')
    return merged
  }

  // --- TOUS les rôles rattachés à une école : restrictions de forfait
  // appliquées côté serveur (SCHOOL_ADMIN, ADMIN_FREEMIUM, DIRECTION*,
  // SECRETARY, CASHIER, TEACHER…). Une fonctionnalité masquée dans l'UI
  // doit l'être aussi dans l'API. ---
  const denied = tier === 'FREEMIUM' ? FREEMIUM_DENIED : tier === 'ESSENTIEL' ? ESSENTIEL_DENIED : []
  if (denied.length === 0) return base
  return base.filter(p => !denied.includes(p))
}

export async function requirePermission(request: NextRequest, permission: string): Promise<{ user: AuthUser } | { error: Response }> {
  const authResult = await requireAuth(request);
  if ('error' in authResult) return authResult;
  const perms = await getEffectivePermissions(authResult.user.role, authResult.user.schoolId)
  if (!perms.includes('*') && !perms.includes(permission)) {
    return { error: Response.json({ error: 'Permission insuffisante' }, { status: 403 }) };
  }
  return authResult;
}

// ─── Discipline scope verification ─────────────────────────────────────────
// Retourne le scope { schoolId, section } pour un rôle Discipline, ou null.
// Le serveur devient l'autorité finale : toute API discipline doit appeler
// cette fonction au début et refuser toute requête hors périmètre.
export function getDisciplineScope(
  role: string | null,
  schoolId: string | null
): { schoolId: string; section: 'MATERNELLE' | 'PRIMAIRE' | 'SECONDAIRE' } | null {
  const sectionMap: Record<string, 'MATERNELLE' | 'PRIMAIRE' | 'SECONDAIRE'> = {
    DISCIPLINE_MATERNELLE: 'MATERNELLE',
    DISCIPLINE_PRIMAIRE: 'PRIMAIRE',
    DISCIPLINE_SECONDAIRE: 'SECONDAIRE',
  }
  const section = sectionMap[role as keyof typeof sectionMap]
  if (!section) return null
  if (!schoolId) return null
  return { schoolId, section }
}

// ─── School access verification ────────────────────────────────────────────
export function verifySchoolAccess(user: AuthUser, schoolId: string | null, section?: 'MATERNELLE' | 'PRIMAIRE' | 'SECONDAIRE'): boolean {
  if (user.role === 'SUPER_ADMIN_GLOBAL') return true
  if (user.schoolId !== schoolId) return false
  // Si une section est précisée, l'utilisateur ne doit gérer que son niveau
  if (section && user.role.startsWith('DISCIPLINE')) {
    // On déduit la section attendue du rôle
    const expected = getDisciplineScope(user.role, user.schoolId)?.section
    if (expected && section !== expected) return false
  }
  return true
}

// ─── Parent access verification ────────────────────────────────────────────
export async function verifyParentAccess(user: AuthUser, studentId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN_GLOBAL' || user.role === 'SECRETARY' || user.role === 'DIRECTION') return true;
  if (user.role !== 'PARENT') return true;
  const student = await db.student.findUnique({ where: { id: studentId }, select: { parentId: true } });
  if (!student) return false;
  return student.parentId === user.id;
}

// ─── Safe int parser ───────────────────────────────────────────────────────
export function safeParseInt(value: string | null, defaultValue: number, min?: number, max?: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  let result = parsed;
  if (min !== undefined && result < min) result = min;
  if (max !== undefined && result > max) result = max;
  return result;
}

// ─── Rate limiter ──────────────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) { rateLimitStore.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// ─── Role validation ───────────────────────────────────────────────────────
// Niveau de privilège de chaque rôle. Un rôle ne peut jamais créer/modifier/
// promouvoir un compte d'un niveau supérieur au sien (imposé côté serveur).
export const ROLE_LEVELS: Record<string, number> = {
  SUPER_ADMIN_GLOBAL: 100,
  SCHOOL_ADMIN: 80,
  ADMIN_FREEMIUM: 80,
  DIRECTION: 70,
  DIRECTION_MATERNELLE: 70,
  DIRECTION_PRIMAIRE: 70,
  DIRECTION_SECONDAIRE: 70,
  CORPORATE_ADMIN: 45,
  SUPPORT_AGENT: 30,
  SECRETARY: 40,
  DISCIPLINE: 38,
  DISCIPLINE_MATERNELLE: 38,
  DISCIPLINE_PRIMAIRE: 38,
  DISCIPLINE_SECONDAIRE: 38,
  CASHIER: 36,
  HEAD_TEACHER: 34,
  TEACHER: 32,
  EPS: 32,
  MEDICAL: 32,
  PARENT: 10,
};

export function getRoleLevel(role: string): number {
  return ROLE_LEVELS[role] ?? 0;
}

// Rôles internes à une école. Seul SUPER_ADMIN_GLOBAL peut créer
// SCHOOL_ADMIN / ADMIN_FREEMIUM / SUPER_ADMIN_GLOBAL (les clés du royaume).
const SCHOOL_STAFF_CREATION_ROLES = [
  'SECRETARY', 'CASHIER', 'TEACHER', 'HEAD_TEACHER', 'PARENT',
  'DIRECTION', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE',
  'DISCIPLINE', 'DISCIPLINE_MATERNELLE', 'DISCIPLINE_PRIMAIRE', 'DISCIPLINE_SECONDAIRE',
  'EPS', 'MEDICAL',
];

/**
 * Matrice explicite : quel rôle peut créer quel rôle.
 * - SUPER_ADMIN_GLOBAL → tous les rôles (y compris SCHOOL_ADMIN/ADMIN_FREEMIUM).
 * - SCHOOL_ADMIN / ADMIN_FREEMIUM / DIRECTION* → tout le staff de LEUR école,
 *   jamais un administrateur (SCHOOL_ADMIN/ADMIN_FREEMIUM/SUPER_ADMIN_GLOBAL).
 * - SECRETARY → rôles strictement inférieurs (PAS DIRECTION, PAS SCHOOL_ADMIN).
 * - DISCIPLINE* → uniquement TEACHER / HEAD_TEACHER.
 * - Tous les autres rôles (CASHIER, TEACHER, PARENT…) → personne.
 */
const ROLE_CREATION_MATRIX: Record<string, string[]> = {
  SUPER_ADMIN_GLOBAL: ['*'],
  SCHOOL_ADMIN: SCHOOL_STAFF_CREATION_ROLES,
  ADMIN_FREEMIUM: SCHOOL_STAFF_CREATION_ROLES,
  DIRECTION: SCHOOL_STAFF_CREATION_ROLES,
  DIRECTION_MATERNELLE: SCHOOL_STAFF_CREATION_ROLES,
  DIRECTION_PRIMAIRE: SCHOOL_STAFF_CREATION_ROLES,
  DIRECTION_SECONDAIRE: SCHOOL_STAFF_CREATION_ROLES,
  SECRETARY: ['SECRETARY', 'CASHIER', 'TEACHER', 'HEAD_TEACHER', 'PARENT', 'EPS', 'MEDICAL', 'DISCIPLINE', 'DISCIPLINE_MATERNELLE', 'DISCIPLINE_PRIMAIRE', 'DISCIPLINE_SECONDAIRE'],
  DISCIPLINE: ['TEACHER', 'HEAD_TEACHER'],
  DISCIPLINE_MATERNELLE: ['TEACHER', 'HEAD_TEACHER'],
  DISCIPLINE_PRIMAIRE: ['TEACHER', 'HEAD_TEACHER'],
  DISCIPLINE_SECONDAIRE: ['TEACHER', 'HEAD_TEACHER'],
};

export function canCreateRole(creatorRole: string, targetRole: string): boolean {
  // Seul SUPER_ADMIN_GLOBAL peut créer/attribuer SUPER_ADMIN_GLOBAL.
  if (targetRole === 'SUPER_ADMIN_GLOBAL') return creatorRole === 'SUPER_ADMIN_GLOBAL';
  const allowed = ROLE_CREATION_MATRIX[creatorRole];
  if (!allowed) return false;
  // Sécurité (SEC-1/F3) : le wildcard '*' du SAG doit être traité AVANT le
  // .includes() ('*'.includes('CASHIER') = false bloquait TOUTE création de
  // compte par le super admin plateforme).
  if (allowed.includes('*')) return true;
  if (!allowed.includes(targetRole)) return false;
  // Double barrière hiérarchique : jamais un rôle strictement supérieur au sien.
  if (creatorRole !== 'SUPER_ADMIN_GLOBAL' && getRoleLevel(targetRole) > getRoleLevel(creatorRole)) return false;
  return true;
}

/**
 * Contrôle du CHANGEMENT de rôle d'un compte existant.
 * - Seul SUPER_ADMIN_GLOBAL peut toucher un compte SUPER_ADMIN_GLOBAL.
 * - L'acteur doit appartenir à la même école que la cible.
 * - Le nouveau rôle doit être créable par l'acteur (canCreateRole).
 * - La cible ne peut pas être d'un niveau supérieur à l'acteur.
 */
export function canChangeUserRole(actor: AuthUser, targetUser: { role: string; schoolId: string | null }, newRole: string): boolean {
  if (actor.role === 'SUPER_ADMIN_GLOBAL') return true;
  if (targetUser.role === 'SUPER_ADMIN_GLOBAL') return false; // seul le SAG touche un SAG
  if (actor.schoolId === null || actor.schoolId !== targetUser.schoolId) return false; // isolation multi-écoles
  if (!canCreateRole(actor.role, newRole)) return false;
  // La cible ne peut pas être d'un niveau supérieur à l'acteur.
  if (getRoleLevel(targetUser.role) > getRoleLevel(actor.role)) return false;
  return true;
}

/**
 * Contrôle de modification d'un compte existant pour les champs sensibles
 * (rôle, isActive, mot de passe) : impossible de toucher un compte de niveau
 * supérieur au sien, un SUPER_ADMIN_GLOBAL, ou un compte d'une autre école.
 */
export function canManageUserAccount(actor: AuthUser, targetUser: { role: string; schoolId: string | null }): boolean {
  if (actor.role === 'SUPER_ADMIN_GLOBAL') return true;
  if (targetUser.role === 'SUPER_ADMIN_GLOBAL') return false;
  if (actor.schoolId === null || actor.schoolId !== targetUser.schoolId) return false;
  return getRoleLevel(targetUser.role) <= getRoleLevel(actor.role);
}

export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return process.env.NODE_ENV === 'production' ? 'Une erreur interne est survenue' : error.message;
  }
  return 'Une erreur inconnue est survenue';
}

// ─── Subscription enforcement ─────────────────────────────────────────────
import { checkSubscription } from '@/lib/subscription-server';

/**
 * Require an active subscription for the school.
 * FREEMIUM schools are always allowed (limited features).
 * Paid tiers must have subscriptionStatus === 'ACTIVE' and subscriptionEndDate > now.
 * SUPER_ADMIN_GLOBAL bypasses subscription checks.
 */
export async function requireActiveSubscription(
  request: NextRequest
): Promise<{ ok: true } | { error: Response }> {
  const authResult = await requireAuth(request);
  if ('error' in authResult) return authResult;

  // SUPER_ADMIN_GLOBAL bypasses subscription checks
  if (authResult.user.role === 'SUPER_ADMIN_GLOBAL') return { ok: true };

  const sub = await checkSubscription(authResult.user.schoolId);
  if (!sub.active) {
    return {
      error: Response.json(
        {
          error: sub.error || 'Abonnement requis',
          subscriptionRequired: true,
          tier: sub.tier,
          expired: sub.expired,
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true };
}
