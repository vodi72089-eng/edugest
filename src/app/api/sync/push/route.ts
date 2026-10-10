import { db } from '@/lib/db';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { checkRateLimitDb } from '@/lib/rate-limit-db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sync/push - reçoit un lot de lignes d'une base locale (exe)
// et les applique dans Neon.
//
// ?? Deux modes par ligne (dès v2) :
//   - CRÉATION : la clé naturelle n'existe pas → INSERT (comme v1) ;
//   - MODIFICATION : la clé existe ET le lot porte un `updatedAt` PLUS RÉCENT
//     que la ligne Neon → UPDATE des champs synchronisables uniquement
//     ("dernière écriture gagne" - aucun écrasement d'une donnée plus jeune).
//   Les lignes sans `updatedAt` restent insert-only (années, matières,
//   comptes - tables locales sans colonne de version).
//   Les suppressions locales ne sont JAMAIS propagées (v1/v2) : une ligne
//   retirée localement reste sur la plateforme.
//
// Sécurité conservée :
// - chaque ligne d'une AUTRE école est refusée ;
// - seuls les rôles TEACHER/HEAD_TEACHER/PARENT sont créés/mis à jour côté
//   comptes (jamais d'admin/secrétaire/caissier - pas d'élévation de
//   privilèges) ;
// - les champs d'identité (id, schoolId, matricule, téléphone-clé, rôle,
//   vérifications de paiement côté plateforme) ne sont jamais modifiés.
//
// Auth : session SCHOOL_ADMIN (école = la sienne), SUPER_ADMIN_GLOBAL
// (école = body.schoolId explicite), OU jeton de sync Bearer
// (POST /api/sync/token - exe en envoi automatique, école = celle du jeton).

const MAX_BODY_CHARS = 3_000_000; // ~3 Mo - envoyer par petits lots au-delà
const MAX_ROWS_PER_TABLE = 2000;
const SYNCABLE_USER_ROLES = ['TEACHER', 'HEAD_TEACHER', 'PARENT'];
const PAYMENT_STATUS_RE = /^[A-Z_]{2,20}$/;

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

const str = (v: unknown): string => String(v ?? '').trim();
const asArray = (v: unknown): any[] => (Array.isArray(v) ? v.slice(0, MAX_ROWS_PER_TABLE) : []);
const chunksOf = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const asDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
};
// true si le lot est STRICTEMENT plus récent que la ligne Neon (LWW).
const isNewer = (payloadUpdatedAt: unknown, existing: Date | null | undefined): boolean => {
  const p = asDate(payloadUpdatedAt);
  if (!p || !existing) return false;
  return p.getTime() > existing.getTime();
};
// Violation d'unicité : 'P2002' (engine classique/SQLite) OU '23505'
// (SQLSTATE renvoyé par le driver adapter Neon HTTP) - MÊME erreur, deux codes.
const isUniqueViolation = (e: unknown): boolean => {
  const code = (e as { code?: string } | null)?.code;
  return code === 'P2002' || code === '23505';
};

export async function POST(request: NextRequest) {
  try {
    // 1) Jeton de sync ? ( Authorization: Bearer <jwt maison> )
    let tokenSchoolId: string | null = null;
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const { verifySyncToken } = await import('@/lib/sync-token');
        const v = verifySyncToken(authHeader.slice(7).trim());
        if (v) tokenSchoolId = v.schoolId;
      } catch {
        // ignore : repli session ci-dessous (401 si vraiment invalide)
      }
    }

    let user: import('@/lib/auth').AuthUser | null = null;
    if (!tokenSchoolId) {
      const authResult = await requireAuth(request);
      if ('error' in authResult) return authResult.error;
      user = authResult.user;
    }

    let body: any = null;
    try {
      body = await request.json();
    } catch {
      return err('Corps JSON invalide', 400);
    }
    if (!body || typeof body !== 'object') return err('Corps JSON invalide', 400);
    if (JSON.stringify(body).length > MAX_BODY_CHARS) {
      return err('Lot trop volumineux (3 Mo max - envoyez par petits lots)', 413);
    }

    // École cible : celle du jeton, de l'admin, ou schoolId explicite (SAG).
    let schoolId: string | null = null;
    if (tokenSchoolId) {
      if (body.schoolId && body.schoolId !== tokenSchoolId) return err('schoolId du lot refusé', 403);
      schoolId = tokenSchoolId;
    } else if (!user) {
      return err('Session requise', 401);
    } else if (user.role === 'SUPER_ADMIN_GLOBAL') {
      if (typeof body.schoolId !== 'string' || !body.schoolId) return err('schoolId requis (SAG)', 400);
      schoolId = body.schoolId;
    } else if (user.role === 'SCHOOL_ADMIN') {
      if (!user.schoolId) return err('École non trouvée', 404);
      if (body.schoolId && body.schoolId !== user.schoolId) return err('schoolId du lot refusé', 403);
      schoolId = user.schoolId;
    } else {
      return err('Seuls les administrateurs peuvent synchroniser', 403);
    }
    if (!schoolId) return err('École non trouvée', 404);

    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, shortName: true, isActive: true },
    });
    if (!school || !school.isActive) return err('École non trouvée', 404);

    // Rate-limit souple : un premier envoi volumineux pousse en rounds
    // successifs (voir /api/sync/send) - 100/h laisse la place sans ouvrir
    // la porte à une boucle abusive (les tours vides ne touchent pas au push).
    if (!(await checkRateLimitDb(`sync-push:${schoolId}`, 100, 60 * 60 * 1000))) {
      return err("Trop d'envois - réessayez dans une heure", 429);
    }

    const c = body.changes && typeof body.changes === 'object' ? body.changes : {};
    const applied: Record<string, number> = {};
    const updated: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    const errors: string[] = [];
    const bump = (t: Record<string, number>, k: string) => { t[k] = (t[k] || 0) + 1; };
    const bumpN = (t: Record<string, number>, k: string, n: number) => { if (n > 0) t[k] = (t[k] || 0) + n; };
    const pushErr = (m: string) => { if (errors.length < 10) errors.push(m); };

    // ?? Années scolaires (clé : label) - insert-only ���
    const yearByLabel = new Map<string, string>();
    {
      const rows = await db.schoolYear.findMany({ where: { schoolId }, select: { id: true, label: true } });
      rows.forEach(r => yearByLabel.set(r.label, r.id));
      for (const y of asArray(c.schoolYears)) {
        const label = str(y?.label);
        if (!label || yearByLabel.has(label)) { bump(skipped, 'schoolYears'); continue; }
        try {
          const created = await db.schoolYear.create({
            data: { label, schoolId, isActive: false },
            select: { id: true },
          });
          yearByLabel.set(label, created.id);
          bump(applied, 'schoolYears');
        } catch {
          bump(skipped, 'schoolYears');
        }
      }
    }

    // ?? Classes (clé : nom + année) - insert + LWW ���
    const classByKey = new Map<string, { id: string; yearId: string; updatedAt?: Date }>();
    {
      const rows = await db.class.findMany({ where: { schoolId }, select: { id: true, name: true, schoolYearId: true, updatedAt: true } });
      rows.forEach(r => classByKey.set(`${r.name}|${r.schoolYearId}`, { id: r.id, yearId: r.schoolYearId, updatedAt: r.updatedAt }));
      for (const cl of asArray(c.classes)) {
        const name = str(cl?.name);
        const yid = yearByLabel.get(str(cl?.schoolYearLabel));
        if (!name || !yid) {
          bump(skipped, 'classes');
          if (!yid) pushErr(`Classe ${name || '?'} : année inconnue - incluez schoolYears`);
          continue;
        }
        const key = `${name}|${yid}`;
        const existing = classByKey.get(key);
        if (existing) {
          if (isNewer(cl?.updatedAt, existing.updatedAt)) {
            try {
              const cap = Math.floor(Number(cl?.capacity));
              await db.class.update({
                where: { id: existing.id },
                data: {
                  section: str(cl?.section) || null,
                  level: str(cl?.level) || null,
                  ...(cap > 0 && cap < 10000 ? { capacity: cap } : {}),
                },
              });
              bump(updated, 'classes');
            } catch {
              bump(skipped, 'classes');
            }
          } else {
            bump(skipped, 'classes');
          }
          continue;
        }
        try {
          const cap = Math.floor(Number(cl?.capacity));
          const created = await db.class.create({
            data: {
              name, schoolId, schoolYearId: yid,
              section: str(cl?.section) || null,
              level: str(cl?.level) || null,
              capacity: cap > 0 && cap < 10000 ? cap : 40,
            },
            select: { id: true },
          });
          classByKey.set(key, { id: created.id, yearId: yid });
          bump(applied, 'classes');
        } catch {
          bump(skipped, 'classes');
        }
      }
    }

    // ?? Matières (clé : nom + année ; classId requis via className) - insert-only
    const subjectByKey = new Map<string, string>();
    {
      const rows = await db.subject.findMany({ where: { schoolId }, select: { id: true, name: true, schoolYearId: true } });
      rows.forEach(r => subjectByKey.set(`${r.name}|${r.schoolYearId}`, r.id));
      for (const s of asArray(c.subjects)) {
        const name = str(s?.name);
        const yid = yearByLabel.get(str(s?.schoolYearLabel));
        const cls = yid ? classByKey.get(`${str(s?.className)}|${yid}`) : undefined;
        if (!name || !yid || !cls) {
          bump(skipped, 'subjects');
          if (!yid || !cls) pushErr(`Matière ${name || '?'} : classe/année inconnue`);
          continue;
        }
        const key = `${name}|${yid}`;
        if (subjectByKey.has(key)) { bump(skipped, 'subjects'); continue; }
        try {
          const coef = Math.floor(Number(s?.coefficient));
          const created = await db.subject.create({
            data: {
              name, schoolId, schoolYearId: yid, classId: cls.id,
              code: str(s?.code) || null,
              coefficient: coef > 0 && coef < 100 ? coef : 1,
            },
            select: { id: true },
          });
          subjectByKey.set(key, created.id);
          bump(applied, 'subjects');
        } catch {
          bump(skipped, 'subjects');
        }
      }
    }

    // ?? Comptes enseignants/parents (clé : téléphone puis email) - insert-only
    // Jamais d'autres rôles : pas d'élévation de privilèges par sync.
    // Les comptes ne portent pas d'updatedAt local : pas de mise à jour.
    const userPhoneToId = new Map<string, string>();
    const userEmailToId = new Map<string, string>();
    {
      const rows = await db.user.findMany({
        where: { schoolId, role: { in: SYNCABLE_USER_ROLES } },
        select: { id: true, phone: true, email: true },
      });
      rows.forEach(r => {
        if (r.phone) userPhoneToId.set(r.phone, r.id);
        if (r.email) userEmailToId.set(r.email.toLowerCase(), r.id);
      });
      // Phase 1 : décisions ligne par ligne (aucune écriture) → inserts collectés.
      const userInserts: Array<{ data: any; name: string }> = [];
      for (const u of asArray(c.users)) {
        const role = str(u?.role);
        if (!SYNCABLE_USER_ROLES.includes(role)) { bump(skipped, 'usersForbidden'); continue; }
        const name = str(u?.name);
        const phone = str(u?.phone);
        const email = str(u?.email).toLowerCase();
        if (!name || (!phone && !email)) { bump(skipped, 'users'); continue; }
        // Réservé = déjà réel (id) ou en attente d'insert dans CE lot ('').
        const reserved = (phone && userPhoneToId.has(phone)) || (email && userEmailToId.has(email));
        const existingId = (phone && userPhoneToId.get(phone)) || (email && userEmailToId.get(email)) || null;
        if (reserved) {
          if (existingId) {
            if (phone) userPhoneToId.set(phone, existingId);
            if (email) userEmailToId.set(email, existingId);
          }
          bump(skipped, 'users');
          continue;
        }
        if (phone) userPhoneToId.set(phone, '');   // réservé dans ce lot (évite les doublons internes)
        if (email) userEmailToId.set(email, '');
        userInserts.push({
          name,
          data: {
            name,
            phone: phone || `sync-${schoolId.slice(-6)}-${Math.random().toString(36).slice(2, 8)}`,
            email: email || null,
            password: typeof u?.passwordHash === 'string' && u.passwordHash.startsWith('$2') ? u.passwordHash : null,
            role,
            schoolId,
            isActive: true,
            subjectName: str(u?.subjectName) || null,
          },
        });
      }
      // Phase 2 : inserts groupés (1 requête Neon / paquet au lieu de 1 / ligne).
      for (const chunk of chunksOf(userInserts, 400)) {
        try {
          const created = await db.user.createManyAndReturn({
            data: chunk.map(r => r.data),
            select: { id: true, phone: true, email: true },
          });
          created.forEach((r, i) => {
            if (r.phone) userPhoneToId.set(r.phone, r.id);
            if (r.email) userEmailToId.set(r.email.toLowerCase(), r.id);
          });
          bumpN(applied, 'users', created.length);
        } catch {
          // Repli ligne par ligne : doublon global (email/tel dans une autre
          // école) n'invalide pas tout le paquet.
          for (const { data, name } of chunk) {
            try {
              const r = await db.user.create({ data, select: { id: true, phone: true, email: true } });
              if (r.phone) userPhoneToId.set(r.phone, r.id);
              if (r.email) userEmailToId.set(r.email.toLowerCase(), r.id);
              bump(applied, 'users');
            } catch (e: any) {
              bump(skipped, 'users');
              console.error('[sync-push] create user', name, 'code=' + (e?.code || 'NO_CODE'), String(e?.message || e).slice(0, 300));
              pushErr(`Compte ${name} : ${isUniqueViolation(e) ? 'téléphone/email déjà utilisé ailleurs' : `échec (${e?.code || 'inconnu'})`}`);
            }
          }
        }
      }
      // Libère les réservations vides (aucun insert créé).
      for (const [k, v] of userPhoneToId) if (v === '') userPhoneToId.delete(k);
      for (const [k, v] of userEmailToId) if (v === '') userEmailToId.delete(k);
    }

    // ?? Élèves (clé : matricule global, sinon nom+classe) - insert + LWW ���
    const studentByMat = new Map<string, { id: string; classId: string; schoolId: string; updatedAt: Date }>();
    {
      const rows = await db.student.findMany({ where: { schoolId }, select: { id: true, matricule: true, firstName: true, lastName: true, classId: true, updatedAt: true } });
      const byNameClass = new Map<string, string>();
      rows.forEach(r => {
        studentByMat.set(r.matricule, { id: r.id, classId: r.classId, schoolId, updatedAt: r.updatedAt });
        byNameClass.set(`${r.firstName.trim().toLowerCase()}|${r.lastName.trim().toLowerCase()}|${r.classId}`, r.id);
      });
      const studentInserts: Array<{ data: any; label: string }> = [];
      const seenMat = new Set<string>();
      for (const st of asArray(c.students)) {
        const firstName = str(st?.firstName);
        const lastName = str(st?.lastName);
        const cls = classByKey.get(`${str(st?.className)}|${yearByLabel.get(str(st?.schoolYearLabel)) || ''}`);
        const mat = str(st?.matricule);
        if (!firstName || !lastName || !cls) {
          bump(skipped, 'students');
          if (!cls) pushErr(`Élève ${firstName} ${lastName} : classe inconnue`);
          continue;
        }
        let dob: Date | null = null;
        if (st?.dateOfBirth) {
          const d = new Date(String(st.dateOfBirth));
          if (!isNaN(d.getTime()) && d.getFullYear() > 1950 && d.getFullYear() <= new Date().getFullYear()) dob = d;
        }
        const parentPhone = str(st?.parentPhone);
        const parentId = (parentPhone && userPhoneToId.get(parentPhone)) || null;
        if (mat) {
          const existing = studentByMat.get(mat);
          if (existing) {
            if (existing.schoolId !== schoolId) {
              bump(skipped, 'students');
              pushErr(`Matricule ${mat} déjà utilisé par une autre école`);
              continue;
            }
            if (isNewer(st?.updatedAt, existing.updatedAt)) {
              // Mise à jour LWW : champs suivis uniquement (jamais id/matrice).
              try {
                await db.student.update({
                  where: { id: existing.id },
                  data: {
                    firstName, lastName,
                    ...(dob ? { dateOfBirth: dob } : {}),
                    ...(str(st?.gender) ? { gender: str(st?.gender) } : {}),
                    address: str(st?.address) || null,
                    phone: str(st?.phone) || null,
                    ...(cls.id !== existing.classId ? { classId: cls.id, schoolYearId: cls.yearId } : {}),
                    ...(parentId ? { parentId } : {}),
                  },
                });
                bump(updated, 'students');
              } catch {
                bump(skipped, 'students');
              }
            } else {
              bump(skipped, 'students');
            }
            continue;
          }
        } else if (byNameClass.has(`${firstName.toLowerCase()}|${lastName.toLowerCase()}|${cls.id}`)) {
          bump(skipped, 'students');
          continue;
        }
        if (mat && seenMat.has(mat)) { bump(skipped, 'students'); continue; }
        if (mat) seenMat.add(mat);
        studentInserts.push({
          label: `${firstName} ${lastName}`,
          data: {
            matricule: mat || `${str(school.shortName).slice(0, 6).toUpperCase() || 'SYNC'}-SYNC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            firstName, lastName,
            dateOfBirth: dob,
            gender: str(st?.gender) || null,
            address: str(st?.address) || null,
            phone: str(st?.phone) || null,
            classId: cls.id,
            schoolId,
            schoolYearId: cls.yearId,
            parentId,
          },
        });
      }
      // Inserts groupés (1 requête Neon / paquet au lieu de 1 / ligne).
      for (const chunk of chunksOf(studentInserts, 400)) {
        try {
          const created = await db.student.createManyAndReturn({
            data: chunk.map(r => r.data),
            select: { id: true, matricule: true, classId: true },
          });
          created.forEach(r => studentByMat.set(r.matricule, { id: r.id, classId: r.classId, schoolId, updatedAt: new Date() }));
          bumpN(applied, 'students', created.length);
        } catch {
          // Repli ligne par ligne : doublon global de matricule (autre école)
          // n'invalide pas tout le paquet.
          for (const { data, label } of chunk) {
            try {
              const r = await db.student.create({ data, select: { id: true } });
              studentByMat.set(data.matricule, { id: r.id, classId: data.classId, schoolId, updatedAt: new Date() });
              bump(applied, 'students');
            } catch (e: any) {
              bump(skipped, 'students');
              console.error('[sync-push] create student', label, 'code=' + (e?.code || 'NO_CODE'), String(e?.message || e).slice(0, 300));
              pushErr(`Élève ${label} : ${isUniqueViolation(e) ? 'matricule déjà utilisé' : `échec (${e?.code || 'inconnu'})`}`);
            }
          }
        }
      }
    }

    // ?? Notes (clé : élève+matière+trimestre+année) - insert + LWW
    {
      // Préchargement des notes existantes : 1 requête au lieu de 2 / ligne.
      const gradeExisting = new Map<string, { id: string; updatedAt: Date }>();
      try {
        const rows = await db.grade.findMany({
          where: { student: { schoolId } },
          select: { id: true, studentId: true, subjectId: true, schoolYearId: true, trimester: true, updatedAt: true },
        });
        rows.forEach(r => gradeExisting.set(`${r.studentId}|${r.subjectId}|${r.schoolYearId}|${r.trimester}`, { id: r.id, updatedAt: r.updatedAt }));
      } catch { /* pas de note existante : tout est insert */ }

      const gradeInserts: any[] = [];
      const seenGrade = new Set<string>();
      for (const g of asArray(c.grades)) {
        const stu = str(g?.studentMatricule) ? studentByMat.get(str(g.studentMatricule)) : undefined;
        const yid = yearByLabel.get(str(g?.schoolYearLabel));
        const subjId = yid ? subjectByKey.get(`${str(g?.subjectName)}|${yid}`) : undefined;
        const trimester = str(g?.trimester) || 'T1';
        const score = Number(g?.score);
        if (!stu || !subjId || !yid || !isFinite(score)) {
          bump(skipped, 'grades');
          continue;
        }
        if (stu.schoolId !== schoolId) { bump(skipped, 'grades'); continue; }
        const key = `${stu.id}|${subjId}|${yid}|${trimester}`;
        const exists = gradeExisting.get(key);
        if (exists) {
          if (isNewer(g?.updatedAt, exists.updatedAt)) {
            try {
              await db.grade.update({
                where: { id: exists.id },
                data: { score, comment: str(g?.comment) || null },
              });
              bump(updated, 'grades');
            } catch {
              bump(skipped, 'grades');
            }
          } else {
            bump(skipped, 'grades');
          }
          continue;
        }
        if (seenGrade.has(key)) { bump(skipped, 'grades'); continue; }
        seenGrade.add(key);
        gradeInserts.push({
          studentId: stu.id, subjectId: subjId, classId: stu.classId,
          trimester, score, schoolYearId: yid,
          comment: str(g?.comment) || null,
        });
      }
      // Inserts groupés (1 requête Neon / paquet au lieu de 1 / ligne).
      for (const chunk of chunksOf(gradeInserts, 400)) {
        try {
          const r = await db.grade.createMany({ data: chunk });
          bumpN(applied, 'grades', r.count);
        } catch {
          for (const data of chunk) {
            try {
              await db.grade.create({ data });
              bump(applied, 'grades');
            } catch {
              bump(skipped, 'grades');
            }
          }
        }
      }
    }

    // ?? Frais scolaires (clé : classe+trimestre+nom) - insert + LWW ���
    {
      const feeByKey = new Map<string, { id: string; updatedAt: Date }>();
      try {
        const rows = await db.schoolFee.findMany({ where: { schoolId }, select: { id: true, classId: true, trimester: true, name: true, updatedAt: true } });
        rows.forEach(r => feeByKey.set(`${r.classId}|${r.trimester}|${r.name}`, { id: r.id, updatedAt: r.updatedAt }));
      } catch { /* table absente du schéma local : on tente quand même */ }
      const feeInserts: any[] = [];
      for (const f of asArray(c.schoolFees)) {
        const cls = classByKey.get(`${str(f?.className)}|${yearByLabel.get(str(f?.schoolYearLabel)) || ''}`);
        const name = str(f?.name);
        const trimester = str(f?.trimester) || 'T1';
        const amount = Number(f?.amount);
        if (!cls || !name || !isFinite(amount) || amount < 0) { bump(skipped, 'schoolFees'); continue; }
        const key = `${cls.id}|${trimester}|${name}`;
        const existing = feeByKey.get(key);
        if (existing) {
          if (isNewer(f?.updatedAt, existing.updatedAt)) {
            try {
              await db.schoolFee.update({
                where: { id: existing.id },
                data: { amount, currency: str(f?.currency) || 'CDF' },
              });
              bump(updated, 'schoolFees');
            } catch {
              bump(skipped, 'schoolFees');
            }
          } else {
            bump(skipped, 'schoolFees');
          }
          continue;
        }
        feeByKey.set(key, { id: '', updatedAt: new Date() }); // réservé dans ce lot
        feeInserts.push({
          name, amount, currency: str(f?.currency) || 'CDF',
          trimester, classId: cls.id, schoolId,
        });
      }
      // Inserts groupés (1 requête Neon / paquet au lieu de 1 / ligne).
      for (const chunk of chunksOf(feeInserts, 400)) {
        try {
          const r = await db.schoolFee.createMany({ data: chunk });
          bumpN(applied, 'schoolFees', r.count);
        } catch {
          for (const data of chunk) {
            try {
              await db.schoolFee.create({ data });
              bump(applied, 'schoolFees');
            } catch {
              bump(skipped, 'schoolFees');
            }
          }
        }
      }
    }

    // ?? Paiements (clé : numéro de reçu, sinon référence, sinon élève+trimestre)
    // insert + LWW sur les champs d'encaissement. Les champs de vérification
    // (verifiedBy/verifiedAt/verificationNote) ne sont JAMAIS écrasés par la
    // sync : ils appartiennent au circuit de validation de la plateforme.
    {
      // Préchargement : 1 requête au lieu de 3 findFirst / ligne.
      const payByReceipt = new Map<string, { id: string; updatedAt: Date }>();
      const payByRef = new Map<string, { id: string; updatedAt: Date }>();
      const payByStudentTrimester = new Map<string, { id: string; updatedAt: Date }>();
      try {
        const rows = await db.paymentRecord.findMany({
          where: { schoolId },
          select: { id: true, receiptNumber: true, referenceNumber: true, studentId: true, trimester: true, updatedAt: true },
        });
        rows.forEach(r => {
          const v = { id: r.id, updatedAt: r.updatedAt };
          if (r.receiptNumber) payByReceipt.set(r.receiptNumber, v);
          if (r.referenceNumber) payByRef.set(r.referenceNumber, v);
          payByStudentTrimester.set(`${r.studentId}|${r.trimester}`, v);
        });
      } catch { /* pas de paiement existant : tout est insert */ }

      const paymentInserts: any[] = [];
      const seenPay = new Set<string>();
      const seenReceipt = new Set<string>();
      const seenRef = new Set<string>();
      for (const p of asArray(c.paymentRecords)) {
        const stu = str(p?.studentMatricule) ? studentByMat.get(str(p.studentMatricule)) : undefined;
        const trimester = str(p?.trimester) || 'T1';
        const amount = Number(p?.amount);
        const paidAmount = Number(p?.paidAmount || 0);
        const receiptNumber = str(p?.receiptNumber);
        const referenceNumber = str(p?.referenceNumber);
        if (!stu || stu.schoolId !== schoolId || !isFinite(amount) || amount < 0) {
          bump(skipped, 'paymentRecords');
          continue;
        }
        const statusRaw = str(p?.status).toUpperCase();
        const status = PAYMENT_STATUS_RE.test(statusRaw) ? statusRaw : 'PENDING';
        const paidAt = asDate(p?.paidAt);
        const paymentMethod = str(p?.paymentMethod) || null;

        // Ligne existante par clé naturelle décroissante (maps, sans requête).
        const existing =
          (receiptNumber && payByReceipt.get(receiptNumber)) ||
          (referenceNumber && payByRef.get(referenceNumber)) ||
          payByStudentTrimester.get(`${stu.id}|${trimester}`) ||
          null;

        if (existing) {
          if (isNewer(p?.updatedAt, existing.updatedAt)) {
            try {
              await db.paymentRecord.update({
                where: { id: existing.id },
                data: {
                  ...(isFinite(paidAmount) && paidAmount >= 0 ? { paidAmount } : {}),
                  status,
                  ...(paidAt ? { paidAt } : {}),
                  ...(paymentMethod ? { paymentMethod } : {}),
                  ...(isFinite(amount) ? { amount } : {}),
                },
              });
              bump(updated, 'paymentRecords');
            } catch {
              bump(skipped, 'paymentRecords');
            }
          } else {
            bump(skipped, 'paymentRecords');
          }
          continue;
        }
        const key = `${stu.id}|${trimester}`;
        if (seenPay.has(key) || (receiptNumber && seenReceipt.has(receiptNumber)) || (referenceNumber && seenRef.has(referenceNumber))) {
          bump(skipped, 'paymentRecords');
          continue;
        }
        seenPay.add(key);
        if (receiptNumber) seenReceipt.add(receiptNumber);
        if (referenceNumber) seenRef.add(referenceNumber);
        paymentInserts.push({
          studentId: stu.id,
          schoolId,
          amount: isFinite(amount) ? amount : 0,
          paidAmount: isFinite(paidAmount) && paidAmount >= 0 ? paidAmount : 0,
          trimester,
          paymentMethod,
          referenceNumber: referenceNumber || null,
          status,
          paidAt,
          receiptNumber: receiptNumber || null,
        });
      }
      // Inserts groupés (1 requête Neon / paquet au lieu de 1 / ligne).
      for (const chunk of chunksOf(paymentInserts, 400)) {
        try {
          const r = await db.paymentRecord.createMany({ data: chunk });
          bumpN(applied, 'paymentRecords', r.count);
        } catch {
          for (const data of chunk) {
            try {
              await db.paymentRecord.create({ data });
              bump(applied, 'paymentRecords');
            } catch (e: any) {
              bump(skipped, 'paymentRecords');
              console.error('[sync-push] create payment', data.receiptNumber || data.referenceNumber || '?', 'code=' + (e?.code || 'NO_CODE'), String(e?.message || e).slice(0, 300));
            }
          }
        }
      }
    }

    // ?? Journal d'audit (non bloquant) ??
    try {
      const totalApplied = Object.values(applied).reduce((s, n) => s + n, 0);
      const totalUpdated = Object.values(updated).reduce((s, n) => s + n, 0);
      // Uniquement quand le lot a effectivement écrit (sinon bruit :
      // rejeux idempotents et rounds vides n'ont rien à raconter).
      if (totalApplied + totalUpdated > 0 || errors.length > 0) {
        await db.auditLog.create({
          data: {
            // Voie jeton : pas d'utilisateur connecté - traçabilité via le lot.
            userId: user?.id || `sync-token:${schoolId}`,
            userName: user?.name || 'Synchronisation auto (jeton)',
            userRole: user?.role || 'SYNC_TOKEN',
            action: 'SYNC_PUSH', entityType: 'School', entityId: schoolId,
            details: `Sync Neon (${school.name}) : ${totalApplied} insérée(s), ${totalUpdated} mise(s) à jour - ${JSON.stringify({ ...applied, ...Object.fromEntries(Object.entries(updated).map(([k, v]) => [`~${k}`, v])) })}`,
          },
        });
      }
    } catch { /* audit non bloquant */ }

    return NextResponse.json({ data: { schoolId, schoolName: school.name, applied, updated, skipped, errors } });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
