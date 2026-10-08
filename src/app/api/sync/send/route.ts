import { db } from '@/lib/db';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { checkRateLimitDb } from '@/lib/rate-limit-db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sync/send — ÉMETTEUR côté application desktop (exe) UNIQUEMENT.
// Lit la base LOCALE (SQLite de l'exe) et pousse les lignes vers la plateforme
// Neon via POST {issuerUrl}/api/sync/push. Sans internet ou sans Neon : erreur
// claire, rien n'est modifié nulle part.
//
// Auth double :
//  1) LOCALE : session exe (l'utilisateur est connecté dans l'app) —
//     détermine QUELLE école locale envoyer (ou body.localSchoolId pour SAG).
//     Si body.localSchoolId est fourni par un non-SAG, il doit matcher
//     l'école de la session (sinon 403) — l'envoi auto passe toujours
//     l'école du couple configuré.
//  2) PLATEFORME, au choix :
//     a) Jeton de sync (POST /api/sync/token, stocké dans l'exe à
//        l'activation — voie AUTOMATIQUE, aucun mot de passe manipulé) ;
//     b) Email + mot de passe du compte plateforme, transmis en mémoire
//        uniquement, jamais stockés (voie MANUELLE ponctuelle).
//     Dans les deux cas le push Neon reste insert-only (jamais d'écrasement).
//
// Refusé hors Electron (même garde que POST /api/school/import-db).

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
  // http : uniquement local (tests) — jamais en clair sur internet.
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    return url.origin;
  }
  return null;
}

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

    if (!(await checkRateLimitDb(`sync-send:${localSchoolId}`, 20, 60 * 60 * 1000))) {
      return err('Trop d’envois — réessayez dans une heure', 429);
    }

    // ── 1) Authentification plateforme ──────────────────────────────────
    // Voie jeton (auto) : relayé en Bearer. Voie manuelle : session ouverte
    // ici (cookie relayé, jamais stocké).
    let platformCookie = '';
    let platformBearer = '';
    try {
      if (syncToken) {
        platformBearer = syncToken;
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
        platformCookie = rawCookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
        if (!platformCookie) return err('Session plateforme illisible', 502);
      }
    } catch {
      return err('Plateforme injoignable — vérifiez internet et l’adresse', 502);
    }

    // ── 2) Lecture locale (jamais d'écriture ici) ───────────────────────
    const [years, classes, subjects, users, students, grades, fees] = await Promise.all([
      db.schoolYear.findMany({ where: { schoolId: localSchoolId }, select: { label: true } }),
      db.class.findMany({
        where: { schoolId: localSchoolId },
        select: { name: true, section: true, level: true, capacity: true, schoolYear: { select: { label: true } } },
      }),
      db.subject.findMany({
        where: { schoolId: localSchoolId },
        select: {
          name: true, code: true, coefficient: true,
          schoolYear: { select: { label: true } }, class: { select: { name: true } },
        },
      }),
      db.user.findMany({
        where: { schoolId: localSchoolId, role: { in: ['TEACHER', 'HEAD_TEACHER', 'PARENT'] }, isActive: true },
        select: { name: true, phone: true, email: true, password: true, role: true, subjectName: true },
      }),
      db.student.findMany({
        where: { schoolId: localSchoolId, isArchived: false },
        select: {
          matricule: true, firstName: true, lastName: true, dateOfBirth: true,
          gender: true, address: true, phone: true,
          class: { select: { name: true, schoolYear: { select: { label: true } } } },
          parent: { select: { phone: true } },
        },
        take: 5000,
      }),
      db.grade.findMany({
        where: { student: { schoolId: localSchoolId } },
        select: {
          trimester: true, score: true, comment: true,
          student: { select: { matricule: true } },
          subject: { select: { name: true } },
          schoolYear: { select: { label: true } },
        },
        take: 10000,
      }),
      db.schoolFee.findMany({
        where: { schoolId: localSchoolId },
        select: { name: true, amount: true, currency: true, trimester: true, class: { select: { name: true, schoolYear: { select: { label: true } } } } },
      }),
    ]);

    const changes = {
      schoolYears: years.map(y => ({ label: y.label })),
      classes: classes.map(c => ({
        name: c.name, section: c.section, level: c.level, capacity: c.capacity,
        schoolYearLabel: c.schoolYear?.label,
      })),
      subjects: subjects.map(s => ({
        name: s.name, code: s.code, coefficient: s.coefficient,
        schoolYearLabel: s.schoolYear?.label, className: s.class?.name,
      })),
      users: users.map(u => ({
        name: u.name, phone: u.phone, email: u.email,
        passwordHash: u.password, role: u.role, subjectName: u.subjectName,
      })),
      students: students.map(s => ({
        matricule: s.matricule, firstName: s.firstName, lastName: s.lastName,
        dateOfBirth: s.dateOfBirth ? s.dateOfBirth.toISOString() : null,
        gender: s.gender, address: s.address, phone: s.phone,
        className: s.class?.name, schoolYearLabel: s.class?.schoolYear?.label,
        parentPhone: s.parent?.phone || null,
      })),
      grades: grades.map(g => ({
        studentMatricule: g.student?.matricule, subjectName: g.subject?.name,
        schoolYearLabel: g.schoolYear?.label, trimester: g.trimester,
        score: g.score, comment: g.comment,
      })),
      schoolFees: fees.map(f => ({
        name: f.name, amount: f.amount, currency: f.currency, trimester: f.trimester,
        className: f.class?.name, schoolYearLabel: f.class?.schoolYear?.label,
      })),
    };

    // ── 3) Push vers Neon ───────────────────────────────────────────────
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000);
      let pushRes: Response;
      try {
        pushRes = await fetch(`${issuer}/api/sync/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(platformBearer
              ? { Authorization: `Bearer ${platformBearer}` }
              : { Cookie: platformCookie }),
          },
          body: JSON.stringify({ changes }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const j = await pushRes.json().catch(() => ({}));
      if (!pushRes.ok) {
        return err(j?.error || `Plateforme : envoi refusé (${pushRes.status})`, pushRes.status);
      }
      return NextResponse.json({ data: j.data || j });
    } catch {
      return err('Envoi interrompu — réessayez (les lignes déjà insérées seront ignorées)', 502);
    }
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
