import { db } from '@/lib/db';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { checkRateLimitDb } from '@/lib/rate-limit-db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sync/push — reçoit un lot de lignes d'une base locale (exe)
// et les INSÈRE dans Neon. Jamais d'écrasement (insert-only v1) :
// - chaque ligne existante (clé naturelle) est ignorée + comptée ;
// - chaque ligne d'une AUTRE école est refusée ;
// - seuls les rôles TEACHER/HEAD_TEACHER/PARENT sont créés côté comptes
//   (jamais d'admin/secrétaire/caissier — pas d'élévation de privilèges).
//
// Auth : session SCHOOL_ADMIN (école = la sienne) ou SUPER_ADMIN_GLOBAL
// (école = body.schoolId explicite).
// Transport : l'exe s'authentifie avec email+mot de passe plateforme via
// POST /api/sync/send (serveur local) qui relaye le cookie de session.

const MAX_BODY_CHARS = 3_000_000; // ~3 Mo — envoyer par petits lots au-delà
const MAX_ROWS_PER_TABLE = 2000;
const SYNCABLE_USER_ROLES = ['TEACHER', 'HEAD_TEACHER', 'PARENT'];

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

const str = (v: unknown): string => String(v ?? '').trim();
const asArray = (v: unknown): any[] => (Array.isArray(v) ? v.slice(0, MAX_ROWS_PER_TABLE) : []);

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    let body: any = null;
    try {
      body = await request.json();
    } catch {
      return err('Corps JSON invalide', 400);
    }
    if (!body || typeof body !== 'object') return err('Corps JSON invalide', 400);
    if (JSON.stringify(body).length > MAX_BODY_CHARS) {
      return err('Lot trop volumineux (3 Mo max — envoyez par petits lots)', 413);
    }

    // École cible : celle de l'admin, ou schoolId explicite (SAG uniquement).
    let schoolId: string | null = null;
    if (user.role === 'SUPER_ADMIN_GLOBAL') {
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

    if (!(await checkRateLimitDb(`sync-push:${schoolId}`, 10, 60 * 60 * 1000))) {
      return err('Trop d’envois — réessayez dans une heure', 429);
    }

    const c = body.changes && typeof body.changes === 'object' ? body.changes : {};
    const applied: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    const errors: string[] = [];
    const bump = (t: Record<string, number>, k: string) => { t[k] = (t[k] || 0) + 1; };
    const pushErr = (m: string) => { if (errors.length < 10) errors.push(m); };

    // ── Années scolaires (clé : label) ─────────────────────────────────
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

    // ── Classes (clé : nom + année) ────────────────────────────────────
    const classByKey = new Map<string, { id: string; yearId: string }>();
    {
      const rows = await db.class.findMany({ where: { schoolId }, select: { id: true, name: true, schoolYearId: true } });
      rows.forEach(r => classByKey.set(`${r.name}|${r.schoolYearId}`, { id: r.id, yearId: r.schoolYearId }));
      for (const cl of asArray(c.classes)) {
        const name = str(cl?.name);
        const yid = yearByLabel.get(str(cl?.schoolYearLabel));
        if (!name || !yid) {
          bump(skipped, 'classes');
          if (!yid) pushErr(`Classe ${name || '?'} : année inconnue — incluez schoolYears`);
          continue;
        }
        const key = `${name}|${yid}`;
        if (classByKey.has(key)) { bump(skipped, 'classes'); continue; }
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

    // ── Matières (clé : nom + année ; classId requis → via className) ──
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

    // ── Comptes enseignants/parents (clé : téléphone puis email) ────────
    // Jamais d'autres rôles : pas d'élévation de privilèges par sync.
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
      for (const u of asArray(c.users)) {
        const role = str(u?.role);
        if (!SYNCABLE_USER_ROLES.includes(role)) { bump(skipped, 'usersForbidden'); continue; }
        const name = str(u?.name);
        const phone = str(u?.phone);
        const email = str(u?.email).toLowerCase();
        if (!name || (!phone && !email)) { bump(skipped, 'users'); continue; }
        const existingId = (phone && userPhoneToId.get(phone)) || (email && userEmailToId.get(email)) || null;
        if (existingId) {
          if (phone) userPhoneToId.set(phone, existingId);
          if (email) userEmailToId.set(email, existingId);
          bump(skipped, 'users');
          continue;
        }
        try {
          const created = await db.user.create({
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
            select: { id: true, phone: true, email: true },
          });
          if (created.phone) userPhoneToId.set(created.phone, created.id);
          if (created.email) userEmailToId.set(created.email.toLowerCase(), created.id);
          bump(applied, 'users');
        } catch (e: any) {
          bump(skipped, 'users');
          if (e?.code === 'P2002') pushErr(`Compte ${name} : téléphone/email déjà utilisé ailleurs`);
        }
      }
    }

    // ── Élèves (clé : matricule global, sinon nom+classe) ──────────────
    const studentByMat = new Map<string, { id: string; classId: string; schoolId: string }>();
    {
      const rows = await db.student.findMany({ where: { schoolId }, select: { id: true, matricule: true, firstName: true, lastName: true, classId: true } });
      const byNameClass = new Map<string, string>();
      rows.forEach(r => {
        studentByMat.set(r.matricule, { id: r.id, classId: r.classId, schoolId });
        byNameClass.set(`${r.firstName.trim().toLowerCase()}|${r.lastName.trim().toLowerCase()}|${r.classId}`, r.id);
      });
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
        if (mat) {
          const existing = studentByMat.get(mat);
          if (existing) {
            if (existing.schoolId !== schoolId) {
              bump(skipped, 'students');
              pushErr(`Matricule ${mat} déjà utilisé par une autre école`);
              continue;
            }
            bump(skipped, 'students');
            continue;
          }
        } else if (byNameClass.has(`${firstName.toLowerCase()}|${lastName.toLowerCase()}|${cls.id}`)) {
          bump(skipped, 'students');
          continue;
        }
        try {
          let dob: Date | null = null;
          if (st?.dateOfBirth) {
            const d = new Date(String(st.dateOfBirth));
            if (!isNaN(d.getTime()) && d.getFullYear() > 1950 && d.getFullYear() <= new Date().getFullYear()) dob = d;
          }
          const parentPhone = str(st?.parentPhone);
          const created = await db.student.create({
            data: {
              matricule: mat || `${school.shortName}-SYNC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
              firstName, lastName,
              dateOfBirth: dob,
              gender: str(st?.gender) || null,
              address: str(st?.address) || null,
              phone: str(st?.phone) || null,
              classId: cls.id,
              schoolId,
              schoolYearId: cls.yearId,
              parentId: (parentPhone && userPhoneToId.get(parentPhone)) || null,
            },
            select: { id: true },
          });
          studentByMat.set(mat, { id: created.id, classId: cls.id, schoolId });
          bump(applied, 'students');
        } catch (e: any) {
          bump(skipped, 'students');
          if (e?.code === 'P2002') pushErr(`Élève ${firstName} ${lastName} : matricule déjà utilisé`);
        }
      }
    }

    // ── Notes (clé : élève+matière+trimestre+année) ─────────────────────
    {
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
        try {
          const exists = await db.grade.findFirst({
            where: { studentId: stu.id, subjectId: subjId, trimester, schoolYearId: yid },
            select: { id: true },
          });
          if (exists) { bump(skipped, 'grades'); continue; }
          await db.grade.create({
            data: {
              studentId: stu.id, subjectId: subjId, classId: stu.classId,
              trimester, score, schoolYearId: yid,
              comment: str(g?.comment) || null,
            },
          });
          bump(applied, 'grades');
        } catch {
          bump(skipped, 'grades');
        }
      }
    }

    // ── Frais scolaires (clé : classe+trimestre+nom) ────────────────────
    {
      const feeKeys = new Set<string>();
      try {
        const rows = await db.schoolFee.findMany({ where: { schoolId }, select: { classId: true, trimester: true, name: true } });
        rows.forEach(r => feeKeys.add(`${r.classId}|${r.trimester}|${r.name}`));
      } catch { /* table absente du schéma local : on tente quand même */ }
      for (const f of asArray(c.schoolFees)) {
        const cls = classByKey.get(`${str(f?.className)}|${yearByLabel.get(str(f?.schoolYearLabel)) || ''}`);
        const name = str(f?.name);
        const trimester = str(f?.trimester) || 'T1';
        const amount = Number(f?.amount);
        if (!cls || !name || !isFinite(amount) || amount < 0) { bump(skipped, 'schoolFees'); continue; }
        const key = `${cls.id}|${trimester}|${name}`;
        if (feeKeys.has(key)) { bump(skipped, 'schoolFees'); continue; }
        try {
          await db.schoolFee.create({
            data: {
              name, amount, currency: str(f?.currency) || 'CDF',
              trimester, classId: cls.id, schoolId,
            },
          });
          feeKeys.add(key);
          bump(applied, 'schoolFees');
        } catch {
          bump(skipped, 'schoolFees');
        }
      }
    }

    // ── Journal d'audit (non bloquant) ──────────────────────────────────
    try {
      const totalApplied = Object.values(applied).reduce((s, n) => s + n, 0);
      await db.auditLog.create({
        data: {
          userId: user.id, userName: user.name, userRole: user.role,
          action: 'SYNC_PUSH', entityType: 'School', entityId: schoolId,
          details: `Sync Neon (${school.name}) : ${totalApplied} lignes insérées — ${JSON.stringify(applied)}`,
        },
      });
    } catch { /* audit non bloquant */ }

    return NextResponse.json({ data: { schoolId, schoolName: school.name, applied, skipped, errors } });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
