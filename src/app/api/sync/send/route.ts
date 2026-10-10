import { db } from '@/lib/db';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { checkRateLimitDb } from '@/lib/rate-limit-db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sync/send - ÉMETTEUR côté application desktop (exe) UNIQUEMENT.
// Lit la base LOCALE (SQLite de l'exe) et pousse les lignes vers la plateforme
// Neon via POST {issuerUrl}/api/sync/push. Sans internet ou sans Neon : erreur
// claire, rien n'est modifié nulle part.
//
// ?? Mode delta (v2) : body.since = date ISO de la dernière synchro réussie.
//   Les tables versionnées (élèves, notes, frais, classes, paiements - colonne
//   updatedAt en SQLite) ne sont lues QUE depuis cette date ; les petites tables
//   sans colonne de version (années, matières, comptes) sont renvoyées en
//   entier uniquement si body.fullTables est vrai (1re synchro ou bascule).
//   Si rien n'est en attente : retour anticipé SANS contacter la plateforme
//   (économie réseau + rate-limit serveur respecté).
//   Chaque ligne versionnée porte son `updatedAt` : le push applique le
//   « dernière écriture gagne » côté Neon (modifications propagées).
//
// ?? Envoi par lots successifs : les lignes sont réparties en rounds
//   ordonnés (années/classes/matières/comptes d'abord, puis élèves, notes,
//   frais, paiements - par paquets de 800) pour ne JAMAIS tronquer un
//   premier envoi volumineux (les limites serveur par table restent un
//   garde-fou, pas une perte silencieuse). Un échec de round arrête la
//   suite ; au prochain envoi tout est re-joué (idempotent côté push).
//
// Auth double :
//  1) LOCALE : session exe (l'utilisateur est connecté dans l'app) -
//     détermine QUELLE école locale envoyer (ou body.localSchoolId pour SAG).
//  2) PLATEFORME, au choix :
//     a) Jeton de sync (POST /api/sync/token, stocké dans l'exe à
//        l'activation - voie AUTOMATIQUE, aucun mot de passe manipulé) ;
//     b) Email + mot de passe du compte plateforme, transmis en mémoire
//        uniquement, jamais stockés (voie MANUELLE ponctuelle).
//
// Refusé hors Electron (même garde que POST /api/school/import-db).

const CHUNK_ROWS = 800; // lignes par table et par round (payload maîtrisé)
// Faux étudiant des enregistrements d'ABONNEMENT (paiement de licence
// plateforme) : jamais envoyés - ce ne sont pas des paiements d'élèves.
const SUBSCRIPTION_STUDENT_ID = '__subscription__';

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeIssuer(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol === 'https:') return url.origin;
  // http : uniquement local (tests) - jamais en clair sur internet.
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    return url.origin;
  }
  return null;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

function chunkOf<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += CHUNK_ROWS) out.push(arr.slice(i, i + CHUNK_ROWS));
  return out;
}

type Totals = Record<string, number>;
const addInto = (dst: Totals, src: unknown) => {
  if (!src || typeof src !== 'object') return;
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    const n = Number(v);
    if (isFinite(n)) dst[k] = (dst[k] || 0) + n;
  }
};

export async function POST(request: NextRequest) {
  try {
    const userAgent = request.headers.get('user-agent') || '';
    if (!/electron/i.test(userAgent)) {
      return err("L'envoi vers Neon n'est disponible que dans l'application desktop.", 403);
    }

    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    let body: any = null;
    try {
      body = await request.json();
    } catch {
      return err('Corps JSON invalide', 400);
    }
    const issuer = normalizeIssuer(body?.issuerUrl);
    const email = String(body?.email || '').trim();
    const password = String(body?.password || '');
    const syncToken = String(body?.syncToken || '').trim();
    if (!issuer || (!syncToken && (!email || !password))) {
      return err('Adresse de la plateforme + (jeton de sync ou email et mot de passe) requis', 400);
    }

    let localSchoolId: string | null = null;
    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      if (typeof body.localSchoolId !== 'string' || !body.localSchoolId) {
        return err('localSchoolId requis (SAG)', 400);
      }
      localSchoolId = body.localSchoolId;
    } else if (user.schoolId) {
      localSchoolId = user.schoolId;
      // L'école locale envoyée doit être celle de la session (anti-mélange
      // si plusieurs écoles partagent la machine).
      if (typeof body.localSchoolId === 'string' && body.localSchoolId && body.localSchoolId !== user.schoolId) {
        return err('École locale refusée', 403);
      }
    } else {
      return err('École locale non trouvée', 404);
    }
    if (!localSchoolId) return err('École locale non trouvée', 404);

    // ?? Delta optionnel : date de la dernière synchro réussie.
    let sinceDate: Date | null = null;
    if (body.since) {
      const d = new Date(String(body.since));
      if (!isNaN(d.getTime())) sinceDate = d;
    }
    // Tables sans version (années/matières/comptes) : envoyées en entier à
    // la 1re synchro, ou quand le client signale des ajouts (body.fullTables).
    const includeFull = !sinceDate || body.fullTables === true;
    const deltaWhere = sinceDate ? { updatedAt: { gte: sinceDate } } : {};

    if (!(await checkRateLimitDb(`sync-send:${localSchoolId}`, 20, 60 * 60 * 1000))) {
      return err("Trop d'envois - réessayez dans une heure", 429);
    }

    // ?? 1) Lecture locale (jamais d'écriture ici) ???????????????????????
    const [classes, students, grades, fees, payments, years, subjects, users] = await Promise.all([
      db.class.findMany({
        where: { schoolId: localSchoolId, ...deltaWhere },
        select: { name: true, section: true, level: true, capacity: true, updatedAt: true, schoolYear: { select: { label: true } } },
      }),
      db.student.findMany({
        where: { schoolId: localSchoolId, isArchived: false, ...deltaWhere },
        select: {
          matricule: true, firstName: true, lastName: true, dateOfBirth: true,
          gender: true, address: true, phone: true, updatedAt: true,
          class: { select: { name: true, schoolYear: { select: { label: true } } } },
          parent: { select: { phone: true } },
        },
        take: 5000,
      }),
      db.grade.findMany({
        where: { student: { schoolId: localSchoolId }, ...deltaWhere },
        select: {
          trimester: true, score: true, comment: true, updatedAt: true,
          student: { select: { matricule: true } },
          subject: { select: { name: true } },
          schoolYear: { select: { label: true } },
        },
        take: 10000,
      }),
      db.schoolFee.findMany({
        where: { schoolId: localSchoolId, ...deltaWhere },
        select: { name: true, amount: true, currency: true, trimester: true, updatedAt: true, class: { select: { name: true, schoolYear: { select: { label: true } } } } },
      }),
      db.paymentRecord.findMany({
        where: { schoolId: localSchoolId, studentId: { not: SUBSCRIPTION_STUDENT_ID }, ...deltaWhere },
        select: {
          studentId: true,
          trimester: true, amount: true, paidAmount: true, paymentMethod: true,
          referenceNumber: true, status: true, paidAt: true, receiptNumber: true,
          updatedAt: true,
        },
        take: 5000,
      }).catch(() => [] as any[]),
      includeFull
        ? db.schoolYear.findMany({ where: { schoolId: localSchoolId }, select: { label: true } })
        : Promise.resolve([] as any[]),
      includeFull
        ? db.subject.findMany({
            where: { schoolId: localSchoolId },
            select: {
              name: true, code: true, coefficient: true,
              schoolYear: { select: { label: true } }, class: { select: { name: true } },
            },
          })
        : Promise.resolve([] as any[]),
      includeFull
        ? db.user.findMany({
            where: { schoolId: localSchoolId, role: { in: ['TEACHER', 'HEAD_TEACHER', 'PARENT'] }, isActive: true },
            select: { name: true, phone: true, email: true, password: true, role: true, subjectName: true },
          })
        : Promise.resolve([] as any[]),
    ]);

    // PaymentRecord n'a pas de relation Prisma vers Student (studentId nu) :
    // on résout les matricules par une requête complémentaire.
    const payStudentIds = [...new Set(payments.map((p: any) => String(p.studentId)).filter(Boolean))];
    const payStudents = payStudentIds.length
      ? await db.student.findMany({ where: { id: { in: payStudentIds } }, select: { id: true, matricule: true } })
      : [];
    const matriculeById = new Map(payStudents.map(s => [s.id, s.matricule]));

    const fullCounts = includeFull
      ? {
          schoolYears: years.length,
          subjects: subjects.length,
          users: users.length,
        }
      : null;

    // ?? 2) Construction des rounds (ordre de dépendance respecté) ?????????
    const classRows = classes.map(c => ({
      name: c.name, section: c.section, level: c.level, capacity: c.capacity,
      schoolYearLabel: c.schoolYear?.label,
      updatedAt: iso(c.updatedAt),
    }));
    const studentRows = students.map(s => ({
      matricule: s.matricule, firstName: s.firstName, lastName: s.lastName,
      dateOfBirth: s.dateOfBirth ? s.dateOfBirth.toISOString() : null,
      gender: s.gender, address: s.address, phone: s.phone,
      className: s.class?.name, schoolYearLabel: s.class?.schoolYear?.label,
      parentPhone: s.parent?.phone || null,
      updatedAt: iso(s.updatedAt),
    }));
    const gradeRows = grades.map(g => ({
      studentMatricule: g.student?.matricule, subjectName: g.subject?.name,
      schoolYearLabel: g.schoolYear?.label, trimester: g.trimester,
      score: g.score, comment: g.comment,
      updatedAt: iso(g.updatedAt),
    }));
    const feeRows = fees.map(f => ({
      name: f.name, amount: f.amount, currency: f.currency, trimester: f.trimester,
      className: f.class?.name, schoolYearLabel: f.class?.schoolYear?.label,
      updatedAt: iso(f.updatedAt),
    }));
    const payRows = payments.map((p: any) => ({
      studentMatricule: matriculeById.get(String(p.studentId)) || null,
      trimester: p.trimester,
      amount: p.amount, paidAmount: p.paidAmount, paymentMethod: p.paymentMethod,
      referenceNumber: p.referenceNumber, status: p.status,
      paidAt: p.paidAt ? new Date(p.paidAt).toISOString() : null,
      receiptNumber: p.receiptNumber,
      updatedAt: iso(p.updatedAt),
    }));

    const rounds: any[] = [];
    const head: any = {};
    if (includeFull && years.length) head.schoolYears = years.map(y => ({ label: y.label }));
    if (classRows.length) head.classes = classRows;
    if (includeFull && subjects.length) head.subjects = subjects.map(s => ({
      name: s.name, code: s.code, coefficient: s.coefficient,
      schoolYearLabel: s.schoolYear?.label, className: s.class?.name,
    }));
    if (includeFull && users.length) head.users = users.map(u => ({
      name: u.name, phone: u.phone, email: u.email,
      passwordHash: u.password, role: u.role, subjectName: u.subjectName,
    }));
    if (Object.keys(head).length) rounds.push(head);
    // Enfants par paquets, dans l'ordre des dépendances :
    // élèves → notes ; classes (round 1) → frais ; élèves → paiements.
    chunkOf(studentRows).forEach(c => rounds.push({ students: c }));
    chunkOf(gradeRows).forEach(c => rounds.push({ grades: c }));
    chunkOf(feeRows).forEach(c => rounds.push({ schoolFees: c }));
    chunkOf(payRows).forEach(c => rounds.push({ paymentRecords: c }));

    if (rounds.length === 0) {
      // Rien à envoyer : aucun contact avec la plateforme.
      return NextResponse.json({
        data: { nothingPending: true, applied: {}, updated: {}, skipped: {}, errors: [], fullCounts },
      });
    }

    // ?? 3) Authentification plateforme (seulement s'il y a ��� envoyer) ??
    // Voie jeton (auto) : relais en Bearer. Voie manuelle : session ouverte
    // ici (cookie relayé, jamais stocké).
    let platformHeaders: Record<string, string>;
    try {
      if (syncToken) {
        platformHeaders = { Authorization: `Bearer ${syncToken}` };
      } else {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        let loginRes: Response;
        try {
          loginRes = await fetch(`${issuer}/api/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        if (!loginRes.ok) {
          return err('Identifiants plateforme refusés (vérifiez email/mot de passe)', 401);
        }
        const rawCookies: string[] =
          typeof (loginRes.headers as any).getSetCookie === 'function'
            ? (loginRes.headers as any).getSetCookie()
            : (loginRes.headers.get('set-cookie') || '').split(/,(?=[^;,]+=)/);
        const platformCookie = rawCookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
        if (!platformCookie) return err('Session plateforme illisible', 502);
        platformHeaders = { Cookie: platformCookie };
      }
    } catch {
      return err("Plateforme injoignable - vérifiez internet et l'adresse", 502);
    }

    // ?? 4) Push de chaque round (séquentiel, ordre des dépendances) ??????
    const applied: Totals = {};
    const updated: Totals = {};
    const skipped: Totals = {};
    const errors: string[] = [];
    let round = 0;
    for (const changes of rounds) {
      round += 1;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 120000);
        let pushRes: Response;
        try {
          pushRes = await fetch(`${issuer}/api/sync/push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...platformHeaders,
            },
            body: JSON.stringify({ changes }),
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        const j = await pushRes.json().catch(() => ({}));
        if (!pushRes.ok) {
          // Round échoué : on arrête (401 jeton, 429 rate-limit, 500...).
          // Les rounds déjà appliqués sont idempotents au prochain envoi.
          const message = j?.error || `Plateforme : envoi refusé (${pushRes.status})`;
          if (pushRes.status === 401) {
            return err(`${message} - réactivez la synchronisation`, 401);
          }
          return NextResponse.json({
            error: message,
            data: {
              applied, updated, skipped,
              errors: [...errors, `arrêt au round ${round}/${rounds.length} : ${message}`],
              fullCounts,
              partial: true,
            },
          }, { status: pushRes.status });
        }
        const d = j.data || j;
        addInto(applied, d.applied);
        addInto(updated, d.updated);
        addInto(skipped, d.skipped);
        if (Array.isArray(d.errors)) {
          for (const e of d.errors.slice(0, 10)) {
            if (errors.length < 10) errors.push(String(e));
          }
        }
      } catch {
        return NextResponse.json({
          error: `Envoi interrompu au round ${round}/${rounds.length} - réessayez (les lignes déjà appliquées seront ignorées)`,
          data: { applied, updated, skipped, errors, fullCounts, partial: true },
        }, { status: 502 });
      }
    }

    return NextResponse.json({ data: { applied, updated, skipped, errors, fullCounts, nothingPending: false } });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
