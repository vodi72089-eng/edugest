import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { sanitizeError } from '@/lib/auth';
import { checkRateLimitDb } from '@/lib/rate-limit-db';
import { getTierLimits } from '@/lib/subscription';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Première connexion exe : récupérer l'école depuis la plateforme ────────
// POST { email, password }
//
// L'exe démarre avec une base LOCALE vierge (seed démo) : le compte de
// l'admin n'y existe pas et la connexion échoue. Cette route (réservée à
// l'exe, sur 127.0.0.1) authentifie le compte sur la PLATEFORME, télécharge
// l'export JSON de l'école (GET /api/school/export-payload) puis écrit les
// données dans la base locale : l'admin se connecte ensuite NORMALEMENT
// (même email, même mot de passe — le hash est recopié) et peut travailler
// hors ligne. Idempotent : une seconde exécution complète ce qui manque.
//
// SÉCURITÉ : le mot de passe ne sert qu'à l'authentification plateforme
// (HTTPS) et n'est jamais stocké ; aucune écriture n'a lieu avant le succès
// de l'authentification ; même double verrou que l'import .db (user-agent
// Electron + hôte local) pour qu'aucun navigateur public n'y accède.
const PLATFORM_BASE = (process.env.PLATFORM_BASE_URL || 'https://edugest.eluymas82.workers.dev').replace(/\/+$/, '');
const ADMIN_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];

interface Row { [key: string]: unknown }
interface ExportedUser extends Row {
  id?: unknown; name?: unknown; email?: unknown; phone?: unknown;
  password?: unknown; role?: unknown; subjectName?: unknown;
}

export async function POST(request: NextRequest) {
  // ── Double verrou (identique à l'import .db) ─────────────────────────
  const userAgent = request.headers.get('user-agent') || '';
  if (!/electron/i.test(userAgent)) {
    return NextResponse.json({ error: 'Réservé à l\'application desktop EduGest.' }, { status: 403 });
  }
  const host = (request.nextUrl.hostname || request.headers.get('host') || '').split(':')[0];
  if (!/^(127\.0\.0\.1|localhost|\[::1\])$/i.test(host)) {
    return NextResponse.json({ error: 'Réservé à l\'application de bureau EduGest (locale).' }, { status: 403 });
  }

  try {
    // Rate limit dédié (comme l'import) : 5 récupérations/heure/IP.
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')?.trim() || 'unknown';
    if (!(await checkRateLimitDb(`pull-platform:ip:${clientIp}`, 5, 60 * 60 * 1000))) {
      return NextResponse.json({ error: 'Trop de récupérations — réessayez dans une heure.' }, { status: 429 });
    }

    let body: { email?: unknown; password?: unknown };
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis.' }, { status: 400 });
    }

    // ── 1) Authentification sur la plateforme (aucune écriture locale) ──
    let authRes: Response;
    try {
      authRes = await fetch(`${PLATFORM_BASE}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return NextResponse.json(
        { error: 'Pas de connexion à la plateforme — vérifiez internet puis réessayez.' },
        { status: 503 },
      );
    }
    if (authRes.status === 401) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect.' }, { status: 401 });
    }
    if (authRes.status === 429) {
      return NextResponse.json(
        { error: 'Trop de tentatives sur la plateforme — réessayez dans quelques minutes.' },
        { status: 429 },
      );
    }
    if (!authRes.ok) {
      return NextResponse.json(
        { error: 'La plateforme est momentanément indisponible — réessayez plus tard.' },
        { status: 502 },
      );
    }
    const setCookie = authRes.headers.get('set-cookie') || '';
    const tokenMatch = /edugest_token=([^;]+)/.exec(setCookie);
    if (!tokenMatch) {
      return NextResponse.json(
        { error: 'Réponse inattendue de la plateforme — mettez l\'application à jour.' },
        { status: 502 },
      );
    }
    const token = decodeURIComponent(tokenMatch[1]);

    // ── 2) Téléchargement de l'export de l'école ────────────────────────
    let expRes: Response;
    try {
      expRes = await fetch(`${PLATFORM_BASE}/api/school/export-payload`, {
        headers: { cookie: `edugest_token=${token}` },
      });
    } catch {
      return NextResponse.json(
        { error: 'Connexion interrompue pendant le téléchargement — réessayez.' },
        { status: 503 },
      );
    }
    if (expRes.status === 401 || expRes.status === 403) {
      return NextResponse.json(
        { error: 'Ce compte n\'est pas administrateur d\'école sur la plateforme.' },
        { status: 403 },
      );
    }
    if (expRes.status === 404) {
      return NextResponse.json(
        { error: 'Aucune école liée à ce compte sur la plateforme.' },
        { status: 404 },
      );
    }
    if (!expRes.ok) {
      return NextResponse.json({ error: 'Téléchargement impossible — réessayez.' }, { status: 502 });
    }
    let payload: {
      school?: Row; users?: ExportedUser[]; schoolYears?: Row[]; classes?: Row[];
      subjects?: Row[]; students?: Row[]; grades?: Row[]; schoolFees?: Row[];
    } | null = null;
    try { payload = (await expRes.json())?.data ?? null; } catch { payload = null; }
    if (!payload?.school) {
      return NextResponse.json({ error: 'Export vide reçu de la plateforme.' }, { status: 502 });
    }

    // ── 3) Écriture LOCALE (idempotente, anti-doublon par clé naturelle) ─
    const summary = {
      schoolYears: 0, classes: 0, subjects: 0, teachers: 0, parents: 0,
      students: 0, grades: 0, schoolFees: 0, skipped: 0, errors: [] as string[],
    };
    const str = (v: unknown, fb = ''): string => {
      const t = String(v ?? '').trim();
      return t || fb;
    };
    const src = payload.school;

    // École locale : retrouvée par email puis par nom exact (ré-exécution
    // sans doublon) — sinon création avec le forfait d'origine.
    let school = await db.school.findFirst({ where: { email: str(src.email, email) } })
      || await db.school.findFirst({ where: { name: str(src.name, 'Mon école') } });
    if (!school) {
      school = await db.school.create({
        data: {
          name: str(src.name, 'Mon école'),
          shortName: str(src.shortName, 'ECOLE'),
          email: str(src.email, email),
          phone: str(src.phone, '+243000000000'),
          address: str(src.address),
          city: str(src.city),
          province: str(src.province),
          country: str(src.country),
          subscriptionTier: str(src.subscriptionTier, 'FREEMIUM'),
        },
      });
    }

    // Compte admin local : hash recopié tel quel → même mot de passe.
    // Le compte à créer est celui qui a été SAISI (email) — on prend SON hash
    // dans l'export ; jamais le hash d'un autre compte (école à plusieurs
    // admins : le bon mot de passe doit correspondre au bon compte).
    const typedRow = (payload.users || []).find(u => str(u.email).toLowerCase() === email);
    let admin = await db.user.findUnique({ where: { email } });
    if (!admin) {
      let adminPhone = str(typedRow?.phone);
      if (adminPhone) {
        const taken = await db.user.findUnique({ where: { phone: adminPhone } });
        if (taken) adminPhone = '';
      }
      if (!adminPhone) adminPhone = `admin-${school.id}`;
      admin = await db.user.create({
        data: {
          name: str(typedRow?.name, 'Administrateur'),
          email,
          phone: adminPhone,
          password: str(typedRow?.password) || null,
          role: ADMIN_ROLES.includes(str(typedRow?.role)) ? str(typedRow?.role) : (typedRow ? str(typedRow.role) : 'SCHOOL_ADMIN'),
          schoolId: school.id,
          isActive: true,
          isVerified: true,
        },
      });
    } else if (!admin.schoolId) {
      // Compte local sans école (seed démo) : rattaché à l'école récupérée.
      admin = await db.user.update({
        where: { id: admin.id },
        data: {
          schoolId: school.id,
          role: ADMIN_ROLES.includes(str(typedRow?.role)) ? str(typedRow?.role) : admin.role,
          password: str(typedRow?.password) || admin.password,
        },
      });
    }

    // Quota du forfait (comme l'import .db) : au-delà, élèves non créés.
    const maxStudents = getTierLimits(
      (await db.school.findUnique({ where: { id: school.id }, select: { subscriptionTier: true } }))?.subscriptionTier || 'FREEMIUM',
    ).maxStudents;
    let studentSlots = Math.max(0, maxStudents - await db.student.count({ where: { schoolId: school.id, isArchived: false } }));
    if (studentSlots === 0 && (payload.students || []).length > 0) {
      summary.errors.push(`Quota d'élèves atteint (${maxStudents} max) — élèves non importés.`);
    }

    // 3a) Années scolaires (clé : label)
    const yearMap = new Map<string, string>();
    const targetYears = await db.schoolYear.findMany({ where: { schoolId: school.id }, select: { id: true, label: true, isActive: true } });
    const targetYearByLabel = new Map(targetYears.map(y => [y.label, y.id]));
    for (const r of payload.schoolYears || []) {
      const label = str(r.label);
      if (!label) { summary.skipped++; continue; }
      let targetId = targetYearByLabel.get(label);
      if (!targetId) {
        const created = await db.schoolYear.create({
          data: {
            label,
            schoolId: school.id,
            startDate: r.startDate ? new Date(String(r.startDate)) : null,
            endDate: r.endDate ? new Date(String(r.endDate)) : null,
            isActive: false,
          },
          select: { id: true },
        });
        targetId = created.id;
        targetYearByLabel.set(label, targetId);
        summary.schoolYears++;
      }
      yearMap.set(str(r.id), targetId);
    }
    const activeYear = targetYears.find(y => y.isActive);
    let defaultYearId = activeYear?.id || (yearMap.size ? [...yearMap.values()][0] : null);
    if (!defaultYearId) {
      const created = await db.schoolYear.create({
        data: { label: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`, schoolId: school.id, isActive: true },
        select: { id: true },
      });
      defaultYearId = created.id;
      summary.schoolYears++;
    }
    if (!activeYear) {
      await db.schoolYear.update({ where: { id: defaultYearId }, data: { isActive: true } });
    }

    // 3b) Classes (clé : nom + année)
    const classMap = new Map<string, string>();
    const existingClasses = await db.class.findMany({ where: { schoolId: school.id }, select: { id: true, name: true, schoolYearId: true } });
    const classByKey = new Map(existingClasses.map(c => [`${c.name}|${c.schoolYearId}`, c.id]));
    for (const r of payload.classes || []) {
      const name = str(r.name);
      if (!name) { summary.skipped++; continue; }
      const targetYearId = yearMap.get(str(r.schoolYearId)) || defaultYearId;
      const key = `${name}|${targetYearId}`;
      let targetId = classByKey.get(key) || null;
      if (!targetId) {
        const created = await db.class.create({
          data: {
            name,
            schoolId: school.id,
            schoolYearId: targetYearId,
            section: r.section ? String(r.section) : null,
            level: r.level ? String(r.level) : null,
            capacity: r.capacity ? Number(r.capacity) : 40,
          },
          select: { id: true },
        });
        targetId = created.id;
        classByKey.set(key, targetId);
        summary.classes++;
      }
      classMap.set(str(r.id), targetId);
    }

    // 3c) Matières (clé : nom + année — unicité Prisma (name, schoolYearId))
    const subjectMap = new Map<string, string>();
    const existingSubjects = await db.subject.findMany({ where: { schoolId: school.id }, select: { id: true, name: true, schoolYearId: true } });
    const subjectByKey = new Map(existingSubjects.map(s => [`${s.name}|${s.schoolYearId}`, s.id]));
    for (const r of payload.subjects || []) {
      const name = str(r.name);
      const targetClassId = classMap.get(str(r.classId));
      if (!name || !targetClassId) { summary.skipped++; continue; }
      const targetYearId = yearMap.get(str(r.schoolYearId)) || defaultYearId;
      const key = `${name}|${targetYearId}`;
      let targetId = subjectByKey.get(key) || null;
      if (!targetId) {
        try {
          const created = await db.subject.create({
            data: {
              name,
              schoolId: school.id,
              schoolYearId: targetYearId,
              classId: targetClassId,
              code: r.code ? String(r.code) : null,
              coefficient: r.coefficient ? Number(r.coefficient) : 1,
            },
            select: { id: true },
          });
          targetId = created.id;
          subjectByKey.set(key, targetId);
          summary.subjects++;
        } catch {
          targetId = subjectByKey.get(key) || null;
          if (!targetId) { summary.skipped++; continue; }
        }
      }
      subjectMap.set(str(r.id), targetId);
    }

    // 3d) Personnel (téléphone ou email comme clé d'unicité)
    const teacherMap = new Map<string, string>();
    const existingStaff = await db.user.findMany({ select: { id: true, phone: true, email: true, role: true } });
    const staffByPhone = new Map(existingStaff.filter(u => u.phone).map(u => [u.phone as string, u]));
    const staffByEmail = new Map(existingStaff.filter(u => u.email).map(u => [u.email as string, u]));
    for (const r of payload.users || []) {
      const role = str(r.role);
      if (role !== 'TEACHER' && role !== 'HEAD_TEACHER') continue;
      const phone = str(r.phone);
      const uemail = str(r.email).toLowerCase();
      const name = str(r.name);
      const existing = (phone && staffByPhone.get(phone)) || (uemail && staffByEmail.get(uemail));
      if (existing) { teacherMap.set(str(r.id), existing.id); continue; }
      if (!name || (!phone && !uemail)) { summary.skipped++; continue; }
      try {
        const created = await db.user.create({
          data: {
            name,
            phone: phone || `prof-${crypto.randomBytes(4).toString('hex')}`,
            email: uemail || null,
            password: str(r.password) || null,
            role: role === 'HEAD_TEACHER' ? 'HEAD_TEACHER' : 'TEACHER',
            schoolId: school.id,
            isActive: true,
            subjectName: r.subjectName ? String(r.subjectName) : null,
          },
          select: { id: true },
        });
        if (phone) staffByPhone.set(phone, { id: created.id, phone, email: uemail, role } as never);
        teacherMap.set(str(r.id), created.id);
        summary.teachers++;
      } catch { summary.skipped++; }
    }

    // 3e) Parents (clé : téléphone)
    const parentMap = new Map<string, string>();
    for (const r of payload.users || []) {
      if (str(r.role) !== 'PARENT') continue;
      const phone = str(r.phone);
      if (!phone) { summary.skipped++; continue; }
      const existing = staffByPhone.get(phone);
      if (existing && existing.role === 'PARENT') { parentMap.set(str(r.id), existing.id); continue; }
      if (existing) continue; // numéro porté par un autre compte : on n'écrase rien
      try {
        const created = await db.user.create({
          data: {
            name: str(r.name, 'Parent'),
            phone,
            email: str(r.email).toLowerCase() || null,
            password: str(r.password) || null,
            role: 'PARENT',
            schoolId: school.id,
            isActive: true,
          },
          select: { id: true },
        });
        staffByPhone.set(phone, { id: created.id, phone, role: 'PARENT' } as never);
        parentMap.set(str(r.id), created.id);
        summary.parents++;
      } catch { summary.skipped++; }
    }

    // 3f) Élèves (anti-doublon : matricule, puis prénom+nom+classe)
    const existingStudents = await db.student.findMany({
      where: { schoolId: school.id, isArchived: false },
      select: { id: true, matricule: true, firstName: true, lastName: true, classId: true },
    });
    const studentByMatricule = new Map(existingStudents.map(s => [s.matricule, s]));
    const studentByNameClass = new Map(existingStudents.map(s => [`${s.firstName.trim().toLowerCase()}|${s.lastName.trim().toLowerCase()}|${s.classId}`, s.id]));
    const studentMap = new Map<string, string>();
    for (const r of payload.students || []) {
      const firstName = str(r.firstName);
      const lastName = str(r.lastName);
      const targetClassId = classMap.get(str(r.classId));
      if (!firstName || !lastName || !targetClassId) { summary.skipped++; continue; }
      const sourceMatricule = str(r.matricule);
      const dedupKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${targetClassId}`;
      const existingByMat = sourceMatricule ? studentByMatricule.get(sourceMatricule) : undefined;
      let targetStudentId: string | null = null;
      if (existingByMat
        && existingByMat.firstName.trim().toLowerCase() === firstName.toLowerCase()
        && existingByMat.lastName.trim().toLowerCase() === lastName.toLowerCase()) {
        targetStudentId = existingByMat.id;
      } else if (!sourceMatricule && studentByNameClass.has(dedupKey)) {
        targetStudentId = studentByNameClass.get(dedupKey)!;
      }
      if (targetStudentId) { studentMap.set(str(r.id), targetStudentId); continue; }
      if (studentSlots <= 0) {
        summary.skipped++;
        if (summary.errors.length < 5) summary.errors.push(`Élève ${firstName} ${lastName} ignoré : quota du forfait atteint.`);
        continue;
      }
      const matricule = sourceMatricule || `${school.shortName}-PLT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      try {
        const created = await db.student.create({
          data: {
            matricule,
            firstName,
            lastName,
            dateOfBirth: r.dateOfBirth ? new Date(String(r.dateOfBirth)) : null,
            gender: r.gender ? String(r.gender) : null,
            address: r.address ? String(r.address) : null,
            phone: r.phone ? String(r.phone) : null,
            classId: targetClassId,
            schoolId: school.id,
            schoolYearId: yearMap.get(str(r.schoolYearId)) || defaultYearId,
            parentId: parentMap.get(str(r.parentId)) || null,
          },
          select: { id: true },
        });
        studentByMatricule.set(matricule, { id: created.id, matricule, firstName, lastName, classId: targetClassId });
        studentByNameClass.set(dedupKey, created.id);
        studentMap.set(str(r.id), created.id);
        summary.students++;
        studentSlots--;
      } catch {
        summary.skipped++;
        if (summary.errors.length < 5) summary.errors.push(`Élève ${firstName} ${lastName} : import impossible.`);
      }
    }

    // 3g) Notes (clé : élève|matière|trimestre|année)
    const gradeTargets = [...new Set(studentMap.values())];
    const existingGrades = gradeTargets.length
      ? await db.grade.findMany({ where: { studentId: { in: gradeTargets } }, select: { studentId: true, subjectId: true, trimester: true, schoolYearId: true } })
      : [];
    const gradeKeys = new Set(existingGrades.map(g => `${g.studentId}|${g.subjectId}|${g.trimester}|${g.schoolYearId}`));
    for (const r of payload.grades || []) {
      const targetStudentId = studentMap.get(str(r.studentId));
      const targetSubjectId = subjectMap.get(str(r.subjectId));
      const targetClassId = classMap.get(str(r.classId));
      if (!targetStudentId || !targetSubjectId || !targetClassId || r.score === null || r.score === undefined) { summary.skipped++; continue; }
      const trimester = str(r.trimester, 'T1');
      const targetYearId = yearMap.get(str(r.schoolYearId)) || defaultYearId;
      const key = `${targetStudentId}|${targetSubjectId}|${trimester}|${targetYearId}`;
      if (gradeKeys.has(key)) { continue; }
      try {
        await db.grade.create({
          data: {
            studentId: targetStudentId,
            subjectId: targetSubjectId,
            classId: targetClassId,
            trimester,
            score: Number(r.score),
            comment: r.comment ? String(r.comment) : null,
            schoolYearId: targetYearId,
          },
        });
        gradeKeys.add(key);
        summary.grades++;
      } catch { summary.skipped++; }
    }

    // 3h) Frais scolaires (clé : classe|trimestre|nom)
    const existingFees = await db.schoolFee.findMany({ where: { schoolId: school.id }, select: { id: true, classId: true, trimester: true, name: true } });
    const feeKeys = new Set(existingFees.map(f => `${f.classId}|${f.trimester}|${f.name}`));
    for (const r of payload.schoolFees || []) {
      const targetClassId = classMap.get(str(r.classId));
      const name = str(r.name);
      if (!targetClassId || !name) { summary.skipped++; continue; }
      const trimester = str(r.trimester, 'T1');
      const key = `${targetClassId}|${trimester}|${name}`;
      if (feeKeys.has(key)) { continue; }
      try {
        await db.schoolFee.create({
          data: {
            name,
            amount: Number(r.amount || 0),
            currency: r.currency ? String(r.currency) : 'CDF',
            trimester,
            classId: targetClassId,
            schoolId: school.id,
          },
        });
        feeKeys.add(key);
        summary.schoolFees++;
      } catch { summary.skipped++; }
    }

    // Compteurs de l'école (comme l'import).
    try {
      const [studentCount, classCount] = await Promise.all([
        db.student.count({ where: { schoolId: school.id, isArchived: false } }),
        db.class.count({ where: { schoolId: school.id } }),
      ]);
      await db.school.update({ where: { id: school.id }, data: { studentCount, classCount } });
    } catch { /* non bloquant */ }

    return NextResponse.json({
      data: {
        ok: true,
        school: { id: school.id, name: school.name },
        summary,
      },
    });
  } catch (error) {
    console.error('Error pulling platform data:', sanitizeError(error));
    return NextResponse.json({ error: 'Récupération impossible : ' + sanitizeError(error) }, { status: 500 });
  }
}
