import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError, type AuthUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rôles autorisés à importer une base de données d'école
const IMPORT_ADMIN_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'SECRETARY', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];

interface SqliteRow { [key: string]: unknown }

/**
 * POST /api/school/import-db  (multipart/form-data)
 *
 * L'administrateur d'une école importe SA base de données (fichier SQLite
 * EduGest : élèves, classes, matières, notes, professeurs, frais scolaires).
 * Les données sont fusionnées dans l'école de l'admin : elles deviennent
 * directement la base de données de son école (aucun parent n'étant encore
 * connecté dans la plupart des cas, les comptes parents sont recréés).
 *
 * Champs du formulaire :
 *  - file            : le fichier .db / .sqlite (base EduGest)
 *  - email, password : identifiants admin (si pas de token Bearer — utile
 *                      depuis la page de connexion et l'app desktop)
 *  - schoolId        : optionnel (SUPER_ADMIN_GLOBAL uniquement)
 */
export async function POST(request: NextRequest) {
  // Fichier temporaire à nettoyer
  let tmpPath: string | null = null;
  try {
    // ── Authentification : Bearer OU identifiants du formulaire ────────
    let user: AuthUser | null = null;
    let authError: string | null = null;

    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const authResult = await requireAuth(request);
      if ('error' in authResult) {
        authError = 'Session expirée. Reconnectez-vous.';
      } else {
        user = authResult.user;
      }
    }

    // Note: typé `any` — la lib DOM du tsconfig n'expose pas FormData.get
    // (multipart NextRequest), accès runtime standard.
    const formData: any = await request.formData();
    const file = formData.get('file') as File | null;

    if (!user) {
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');
      if (!email || !password) {
        return NextResponse.json({ error: authError || 'Connexion requise : fournissez un token ou vos identifiants' }, { status: 401 });
      }
      const candidate = await db.user.findUnique({ where: { email } });
      if (!candidate || !candidate.isActive || !candidate.password) {
        return NextResponse.json({ error: 'Identifiants incorrects' }, { status: 401 });
      }
      const ok = await bcrypt.compare(password, candidate.password);
      if (!ok) {
        return NextResponse.json({ error: 'Identifiants incorrects' }, { status: 401 });
      }
      if (!IMPORT_ADMIN_ROLES.includes(candidate.role)) {
        return NextResponse.json({ error: 'Seuls les administrateurs peuvent importer une base de données' }, { status: 403 });
      }
      user = candidate;
    } else if (!IMPORT_ADMIN_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Seuls les administrateurs peuvent importer une base de données' }, { status: 403 });
    }

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier reçu. Envoyez votre fichier .db' }, { status: 400 });
    }

    // Limite de taille : 30 Mo
    if (file.size > 30 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (30 Mo maximum)' }, { status: 400 });
    }

    const schoolId = user.role === 'SUPER_ADMIN_GLOBAL' && formData.get('schoolId')
      ? String(formData.get('schoolId'))
      : user.schoolId;
    if (!schoolId) {
      return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
    }

    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, shortName: true, studentCount: true, classCount: true },
    });
    if (!school) {
      return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
    }

    // ── Écriture du fichier temporaire ─────────────────────────────────
    const ext = path.extname(file.name || '').toLowerCase();
    if (!['.db', '.sqlite', '.sqlite3', ''].includes(ext)) {
      return NextResponse.json({ error: 'Format non supporté : envoyez un fichier de base de données SQLite (.db)' }, { status: 400 });
    }

    tmpPath = path.join(os.tmpdir(), `edugest-import-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.db`);
    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(tmpPath, Buffer.from(arrayBuffer));

    // ── Ouverture de la base source (lecture seule) ────────────────────
    let Database: typeof import('better-sqlite3').default;
    try {
      const mod = await import('better-sqlite3');
      Database = (mod.default || mod) as typeof import('better-sqlite3').default;
    } catch {
      return NextResponse.json({ error: 'Module de lecture SQLite indisponible sur ce serveur' }, { status: 500 });
    }

    let source: import('better-sqlite3').Database;
    try {
      source = new Database(tmpPath, { readonly: true, fileMustExist: true });
    } catch {
      return NextResponse.json({ error: 'Fichier illisible : ce n\'est pas une base de données SQLite valide' }, { status: 400 });
    }

    // Vérifie qu'une table existe dans la source
    const hasTable = (name: string): boolean => {
      try {
        const row = source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) as { name: string } | undefined;
        return !!row;
      } catch { return false; }
    };
    const tableColumns = (name: string): Set<string> => {
      try {
        const rows = source.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[];
        return new Set(rows.map(r => r.name));
      } catch { return new Set(); }
    };

    if (!hasTable('Student') && !hasTable('Class')) {
      source.close();
      return NextResponse.json({ error: 'Ce fichier n\'est pas une base de données EduGest (tables élèves/classes absentes)' }, { status: 400 });
    }

    const summary = {
      schoolYears: 0, classes: 0, subjects: 0, teachers: 0, students: 0,
      parents: 0, grades: 0, schoolFees: 0, skipped: 0,
      errors: [] as string[],
    };

    // ════════════════════════════════════════════════════════════════
    //  1) ANNÉES SCOLAIRES (mapping par label)
    // ════════════════════════════════════════════════════════════════
    const yearMap = new Map<string, string>(); // sourceId -> targetId
    const targetYears = await db.schoolYear.findMany({ where: { schoolId }, select: { id: true, label: true, isActive: true } });
    const targetYearByLabel = new Map(targetYears.map(y => [y.label, y.id]));

    if (hasTable('SchoolYear')) {
      const cols = tableColumns('SchoolYear');
      const rows = source.prepare('SELECT * FROM SchoolYear').all() as SqliteRow[];
      for (const r of rows) {
        const label = String(r.label || '').trim();
        if (!label) { summary.skipped++; continue; }
        let targetId = targetYearByLabel.get(label);
        if (!targetId) {
          const created = await db.schoolYear.create({
            data: {
              label,
              schoolId,
              startDate: cols.has('startDate') && r.startDate ? new Date(String(r.startDate)) : null,
              endDate: cols.has('endDate') && r.endDate ? new Date(String(r.endDate)) : null,
              isActive: false,
            },
            select: { id: true },
          });
          targetId = created.id;
          targetYearByLabel.set(label, targetId);
          summary.schoolYears++;
        }
        yearMap.set(String(r.id), targetId);
      }
    }

    // Année par défaut : l'année active de l'école, sinon la première mappée, sinon on en crée une
    const activeYear = targetYears.find(y => y.isActive);
    let defaultYearId = activeYear?.id || (yearMap.size ? [...yearMap.values()][0] : null);
    if (!defaultYearId) {
      const created = await db.schoolYear.create({
        data: { label: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`, schoolId, isActive: true },
        select: { id: true },
      });
      defaultYearId = created.id;
      summary.schoolYears++;
    }
    // Si l'école n'a aucune année active, activer l'année par défaut
    if (!activeYear) {
      await db.schoolYear.update({ where: { id: defaultYearId }, data: { isActive: true } });
    }

    // ════════════════════════════════════════════════════════════════
    //  2) CLASSES (mapping par nom + année)
    // ════════════════════════════════════════════════════════════════
    const classMap = new Map<string, string>(); // sourceId -> targetId
    if (hasTable('Class')) {
      const cols = tableColumns('Class');
      const rows = source.prepare('SELECT * FROM Class').all() as SqliteRow[];
      for (const r of rows) {
        const name = String(r.name || '').trim();
        if (!name) { summary.skipped++; continue; }
        const targetYearId = yearMap.get(String(r.schoolYearId)) || defaultYearId;
        let target = await db.class.findFirst({ where: { name, schoolYearId: targetYearId, schoolId }, select: { id: true } });
        if (!target) {
          target = await db.class.create({
            data: {
              name,
              schoolId,
              schoolYearId: targetYearId,
              section: cols.has('section') && r.section ? String(r.section) : null,
              level: cols.has('level') && r.level ? String(r.level) : null,
              capacity: cols.has('capacity') && r.capacity ? Number(r.capacity) : 40,
            },
            select: { id: true },
          });
          summary.classes++;
        }
        classMap.set(String(r.id), target.id);
      }
    }

    // ════════════════════════════════════════════════════════════════
    //  3) MATIÈRES (mapping par nom + classe)
    // ════════════════════════════════════════════════════════════════
    const subjectMap = new Map<string, string>(); // sourceId -> targetId
    if (hasTable('Subject')) {
      const cols = tableColumns('Subject');
      const rows = source.prepare('SELECT * FROM Subject').all() as SqliteRow[];
      // NOTE : la contrainte d'unicité Prisma est (name, schoolYearId) — une
      // matière existe donc une fois par année scolaire, toutes classes confondues.
      const seen = new Set<string>(); // clés "name|yearId" déjà traitées dans ce fichier
      for (const r of rows) {
        const name = String(r.name || '').trim();
        const targetClassId = classMap.get(String(r.classId));
        if (!name || !targetClassId) { summary.skipped++; continue; }
        const targetYearId = yearMap.get(String(r.schoolYearId)) || defaultYearId;
        const key = `${name}|${targetYearId}`;
        if (seen.has(key)) { summary.skipped++; continue; }
        seen.add(key);
        let target = await db.subject.findFirst({ where: { name, schoolYearId: targetYearId, schoolId }, select: { id: true } });
        if (!target) {
          try {
            target = await db.subject.create({
              data: {
                name,
                schoolId,
                schoolYearId: targetYearId,
                classId: targetClassId,
                code: cols.has('code') && r.code ? String(r.code) : null,
                coefficient: cols.has('coefficient') && r.coefficient ? Number(r.coefficient) : 1,
              },
              select: { id: true },
            });
            summary.subjects++;
          } catch {
            // Course concurrente ou contrainte : retenter la recherche
            target = await db.subject.findFirst({ where: { name, schoolYearId: targetYearId, schoolId }, select: { id: true } });
            if (!target) { summary.skipped++; continue; }
          }
        }
        subjectMap.set(String(r.id), target.id);
      }
    }

    // ════════════════════════════════════════════════════════════════
    //  4) PROFESSEURS (par téléphone)
    // ════════════════════════════════════════════════════════════════
    const teacherMap = new Map<string, string>(); // sourceId -> targetUserId
    if (hasTable('User')) {
      const cols = tableColumns('User');
      let rows: SqliteRow[] = [];
      try {
        rows = source.prepare("SELECT * FROM User WHERE role IN ('TEACHER','HEAD_TEACHER')").all() as SqliteRow[];
      } catch { rows = []; }
      for (const r of rows) {
        const phone = r.phone ? String(r.phone).trim() : '';
        const name = r.name ? String(r.name).trim() : '';
        if (!phone || !name) { summary.skipped++; continue; }
        const existing = await db.user.findUnique({ where: { phone } });
        if (existing) {
          teacherMap.set(String(r.id), existing.id);
          continue;
        }
        try {
          const created = await db.user.create({
            data: {
              name,
              phone,
              email: cols.has('email') && r.email ? String(r.email) : null,
              password: cols.has('password') && r.password ? String(r.password) : null,
              role: cols.has('role') && String(r.role) === 'HEAD_TEACHER' ? 'HEAD_TEACHER' : 'TEACHER',
              schoolId,
              isActive: true,
              subjectName: cols.has('subjectName') && r.subjectName ? String(r.subjectName) : null,
            },
            select: { id: true },
          });
          teacherMap.set(String(r.id), created.id);
          summary.teachers++;
        } catch { summary.skipped++; }
      }
    }

    // ════════════════════════════════════════════════════════════════
    //  5) ÉLÈVES (+ comptes parents) — la base devient celle de l'école
    // ════════════════════════════════════════════════════════════════
    const studentMap = new Map<string, string>(); // sourceId -> targetId
    if (hasTable('Student')) {
      const cols = tableColumns('Student');
      const rows = source.prepare('SELECT * FROM Student').all() as SqliteRow[];

      // Cache des parents source
      const parentCache = new Map<string, { name: string; phone: string; email: string | null; password: string | null }>();
      if (cols.has('parentId') && hasTable('User')) {
        try {
          const parents = source.prepare("SELECT id, name, phone, email, password FROM User WHERE role='PARENT'").all() as SqliteRow[];
          for (const p of parents) {
            parentCache.set(String(p.id), { name: String(p.name || ''), phone: String(p.phone || ''), email: p.email ? String(p.email) : null, password: p.password ? String(p.password) : null });
          }
        } catch { /* pas de parents */ }
      }

      for (const r of rows) {
        const firstName = String(r.firstName || '').trim();
        const lastName = String(r.lastName || '').trim();
        const targetClassId = classMap.get(String(r.classId));
        if (!firstName || !lastName || !targetClassId) { summary.skipped++; continue; }

        // Matricule unique (collision → régénération)
        let matricule = r.matricule ? String(r.matricule) : '';
        if (matricule) {
          const exists = await db.student.findUnique({ where: { matricule }, select: { id: true } });
          if (exists) {
            matricule = `${school.shortName}-IMP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
          }
        } else {
          matricule = `${school.shortName}-IMP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        }

        // Compte parent : recréé si besoin (les parents ne sont généralement pas connectés)
        let targetParentId: string | null = null;
        const srcParentId = cols.has('parentId') && r.parentId ? String(r.parentId) : null;
        if (srcParentId && parentCache.has(srcParentId)) {
          const p = parentCache.get(srcParentId)!;
          if (p.phone) {
            const existingParent = await db.user.findUnique({ where: { phone: p.phone } });
            if (existingParent && existingParent.role === 'PARENT') {
              targetParentId = existingParent.id;
            } else {
              try {
                const createdParent = await db.user.create({
                  data: {
                    name: p.name || `Parent de ${firstName}`,
                    phone: p.phone,
                    email: p.email,
                    password: p.password || (await bcrypt.hash(`eg-${crypto.randomBytes(4).toString('hex')}`, 12)),
                    role: 'PARENT',
                    schoolId,
                    isActive: true,
                  },
                  select: { id: true },
                });
                targetParentId = createdParent.id;
                summary.parents++;
              } catch { /* parent ignoré */ }
            }
          }
        }

        try {
          const created = await db.student.create({
            data: {
              matricule,
              firstName,
              lastName,
              dateOfBirth: cols.has('dateOfBirth') && r.dateOfBirth ? new Date(String(r.dateOfBirth)) : null,
              gender: cols.has('gender') && r.gender ? String(r.gender) : null,
              address: cols.has('address') && r.address ? String(r.address) : null,
              phone: cols.has('phone') && r.phone ? String(r.phone) : null,
              classId: targetClassId,
              schoolId,
              schoolYearId: yearMap.get(String(r.schoolYearId)) || defaultYearId,
              parentId: targetParentId,
            },
            select: { id: true },
          });
          studentMap.set(String(r.id), created.id);
          summary.students++;
        } catch (e) {
          summary.skipped++;
          if (summary.errors.length < 5) summary.errors.push(`Élève ${firstName} ${lastName} : import impossible`);
        }
      }
    }

    // ════════════════════════════════════════════════════════════════
    //  6) NOTES
    // ════════════════════════════════════════════════════════════════
    if (hasTable('Grade')) {
      const rows = source.prepare('SELECT * FROM Grade').all() as SqliteRow[];
      for (const r of rows) {
        const targetStudentId = studentMap.get(String(r.studentId));
        const targetSubjectId = subjectMap.get(String(r.subjectId));
        const targetClassId = classMap.get(String(r.classId));
        if (!targetStudentId || !targetSubjectId || !targetClassId || r.score === null || r.score === undefined) { summary.skipped++; continue; }
        const trimester = String(r.trimester || 'T1');
        const targetYearId = yearMap.get(String(r.schoolYearId)) || defaultYearId;
        try {
          const dup = await db.grade.findFirst({ where: { studentId: targetStudentId, subjectId: targetSubjectId, trimester, schoolYearId: targetYearId }, select: { id: true } });
          if (!dup) {
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
            summary.grades++;
          }
        } catch { summary.skipped++; }
      }
    }

    // ════════════════════════════════════════════════════════════════
    //  7) FRAIS SCOLAIRES
    // ════════════════════════════════════════════════════════════════
    if (hasTable('SchoolFee')) {
      const cols = tableColumns('SchoolFee');
      const rows = source.prepare('SELECT * FROM SchoolFee').all() as SqliteRow[];
      for (const r of rows) {
        const targetClassId = classMap.get(String(r.classId));
        const name = String(r.name || '').trim();
        if (!targetClassId || !name) { summary.skipped++; continue; }
        const trimester = String(r.trimester || 'T1');
        try {
          const dup = await db.schoolFee.findFirst({ where: { classId: targetClassId, trimester, name }, select: { id: true } });
          if (!dup) {
            await db.schoolFee.create({
              data: {
                name,
                amount: Number(r.amount || 0),
                currency: cols.has('currency') && r.currency ? String(r.currency) : 'CDF',
                trimester,
                classId: targetClassId,
                schoolId,
              },
            });
            summary.schoolFees++;
          }
        } catch { summary.skipped++; }
      }
    }

    source.close();

    // ── Mise à jour des compteurs de l'école ──────────────────────────
    const [studentCount, classCount] = await Promise.all([
      db.student.count({ where: { schoolId, isArchived: false } }),
      db.class.count({ where: { schoolId, schoolYearId: defaultYearId } }),
    ]);
    await db.school.update({ where: { id: schoolId }, data: { studentCount, classCount } });

    // ── Journal d'audit ────────────────────────────────────────────────
    try {
      await db.auditLog.create({
        data: {
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: 'DATABASE_IMPORT',
          entityType: 'School',
          entityId: schoolId,
          details: `Import de la base « ${file.name} » : ${summary.students} élèves, ${summary.classes} classes, ${summary.grades} notes`,
        },
      });
    } catch { /* audit non bloquant */ }

    return NextResponse.json({
      data: {
        ok: true,
        school: { id: school.id, name: school.name },
        file: file.name,
        summary,
      },
    });
  } catch (error) {
    console.error('Error importing database:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  } finally {
    if (tmpPath) {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }
}
