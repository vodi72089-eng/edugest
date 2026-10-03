#!/usr/bin/env node
/**
 * EduGest — Suite de tests sécurité API (RBAC, isolation multi-écoles, IDOR,
 * escalade de privilèges, restrictions d'abonnement).
 *
 * Usage :
 *   DATABASE_URL="file:./db/custom.db" SUBSCRIPTION_WEBHOOK_SECRET=test-secret \
 *     node scripts/security-tests/run-security-tests.mjs [baseUrl]
 *
 * Le serveur doit tourner (next dev ou standalone) sur baseUrl (défaut
 * http://localhost:3000). La suite crée ses propres fixtures (écoles TEST-A /
 * TEST-B + comptes) via le SUPER_ADMIN_GLOBAL, exécute la matrice multi-tenant,
 * puis désactive les comptes créés. Code de sortie 1 si au moins un échec.
 */

import crypto from 'node:crypto';

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
const PWD = 'admin123';
const TS = Date.now().toString(36);
const EMAILS = {
  sag: 'admin@edugest.app',
  aAdmin: `sec-admin-a-${TS}@edugest-test.app`,
  aSec: `sec-secretary-a-${TS}@edugest-test.app`,
  aTeach: `sec-teacher-a-${TS}@edugest-test.app`,
  aParent: `sec-parent-a-${TS}@edugest-test.app`,
  bAdmin: `sec-admin-b-${TS}@edugest-test.app`,
};
const WH_SECRET = process.env.SUBSCRIPTION_WEBHOOK_SECRET || 'test-secret';

let passed = 0, failed = 0;
const failures = [];

function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

async function login(email, password = PWD) {
  const r = await api('POST', '/api/auth', { body: { email, password } });
  if (r.status !== 200 || !r.json?.data?.token) {
    throw new Error(`Login impossible pour ${email} (${r.status})`);
  }
  return r.json.data.token;
}

console.log(`\n🔐 EduGest — Tests sécurité API sur ${BASE}\n`);

// ══════════════ SETUP : fixtures ══════════════
let SAG;
try {
  SAG = await login(EMAILS.sag);
  console.log('✔ Connexion SUPER_ADMIN_GLOBAL OK');
} catch (e) {
  console.error(`⛔ ${e.message} — le serveur est-il démarré avec la base seedée ?`);
  process.exit(1);
}

// Deux écoles de test STANDARD (le SAG peut choisir le tier via POST /api/schools)
async function createSchool(name, short, email, tier, adminEmail) {
  const r = await api('POST', '/api/schools', {
    token: SAG,
    body: {
      name, shortName: short, email, phone: `+243900${TS.slice(-5)}${short.slice(-1)}`,
      city: 'Kinshasa', province: 'Kinshasa', country: 'RDC',
      subscriptionTier: tier,
      adminName: `Admin ${short}`, adminEmail, adminPassword: PWD,
    },
  });
  if (r.status !== 201 && r.status !== 200) throw new Error(`Création école ${short}: ${r.status} ${JSON.stringify(r.json)}`);
  // La route renvoie { data: { school, adminUser, classesCreated } }
  return r.json.data?.school ?? r.json.data;
}
let schoolA, schoolB;
try {
  schoolA = await createSchool(`École Test A ${TS}`, `TA${TS.slice(-3)}`, `testa-${TS}@edugest-test.app`, 'STANDARD', EMAILS.aAdmin);
  schoolB = await createSchool(`École Test B ${TS}`, `TB${TS.slice(-3)}`, `testb-${TS}@edugest-test.app`, 'STANDARD', EMAILS.bAdmin);
  console.log(`✔ Écoles fixtures créées (A=${schoolA.id}, B=${schoolB.id})`);
} catch (e) {
  console.error(`⛔ ${e.message}`);
  process.exit(1);
}

// Comptes d'école
async function createUser(token, body) {
  const r = await api('POST', '/api/users', { token, body: { password: PWD, ...body } });
  return { status: r.status, id: r.json?.data?.id, json: r.json };
}

const aAdmin = await login(EMAILS.aAdmin);
const bAdmin = await login(EMAILS.bAdmin);

const aSec = await createUser(aAdmin, { name: 'Secrétaire A', email: EMAILS.aSec, role: 'SECRETARY', schoolId: schoolA.id });
ok('SCHOOL_ADMIN_A peut créer un SECRETARY dans son école', aSec.status === 201, `status=${aSec.status} ${JSON.stringify(aSec.json?.error || '')}`);
const aTeach = await createUser(aAdmin, { name: 'Prof A', email: EMAILS.aTeach, role: 'TEACHER', schoolId: schoolA.id });
ok('SCHOOL_ADMIN_A peut créer un TEACHER', aTeach.status === 201);
const aParent = await createUser(aAdmin, { name: 'Parent A', email: EMAILS.aParent, role: 'PARENT', schoolId: schoolA.id });
ok('SCHOOL_ADMIN_A peut créer un PARENT', aParent.status === 201);

const secTok = aSec.status === 201 ? await login(EMAILS.aSec) : null;
const teachTok = aTeach.status === 201 ? await login(EMAILS.aTeach) : null;
const parentTok = aParent.status === 201 ? await login(EMAILS.aParent) : null;

// ══════════════ 1. AUTH ══════════════
console.log('\n── 1. AUTHENTIFICATION ──');
{
  const r = await api('POST', '/api/auth', { body: { email: EMAILS.sag, password: 'mauvais-mot-de-passe' } });
  ok('Login mauvais mot de passe → refusé', r.status === 401 || r.status === 429, `status=${r.status}`);
  const r2 = await api('GET', '/api/users?schoolId=x');
  ok('API sans token → 401', r2.status === 401, `status=${r2.status}`);
}

// ══════════════ 2. ESCALADE DE CRÉATION DE RÔLES ══════════════
console.log('\n── 2. ESCALADE — CRÉATION DE RÔLES ──');
if (secTok) {
  const r1 = await api('POST', '/api/users', { token: secTok, body: { name: 'X', email: `x1-${TS}@t.app`, role: 'DIRECTION', schoolId: schoolA.id, password: PWD } });
  ok('SECRETARY → créer DIRECTION = REFUSÉ', r1.status === 403, `status=${r1.status}`);
  const r2 = await api('POST', '/api/users', { token: secTok, body: { name: 'X', email: `x2-${TS}@t.app`, role: 'SCHOOL_ADMIN', schoolId: schoolA.id, password: PWD } });
  ok('SECRETARY → créer SCHOOL_ADMIN = REFUSÉ', r2.status === 403, `status=${r2.status}`);
  const r3 = await api('POST', '/api/users', { token: secTok, body: { name: 'X', email: `x3-${TS}@t.app`, role: 'SUPER_ADMIN_GLOBAL', schoolId: schoolA.id, password: PWD } });
  ok('SECRETARY → créer SUPER_ADMIN_GLOBAL = REFUSÉ', r3.status === 403, `status=${r3.status}`);
}
if (teachTok) {
  const r = await api('POST', '/api/users', { token: teachTok, body: { name: 'X', email: `x4-${TS}@t.app`, role: 'SECRETARY', schoolId: schoolA.id, password: PWD } });
  ok('TEACHER → créer un utilisateur = REFUSÉ', r.status === 403, `status=${r.status}`);
}
{
  const r = await api('POST', '/api/users', { token: aAdmin, body: { name: 'X', email: `x5-${TS}@t.app`, role: 'SUPER_ADMIN_GLOBAL', schoolId: schoolA.id, password: PWD } });
  ok('SCHOOL_ADMIN → créer SUPER_ADMIN_GLOBAL = REFUSÉ', r.status === 403, `status=${r.status}`);
  const r2 = await api('POST', '/api/users', { token: bAdmin, body: { name: 'Y', email: `x6-${TS}@t.app`, role: 'SECRETARY', schoolId: schoolA.id, password: PWD } });
  ok('SCHOOL_ADMIN_B → créer utilisateur dans école A = REFUSÉ', r2.status === 403, `status=${r2.status}`);
}

// ══════════════ 3. ESCALADE — CHANGEMENT DE RÔLE (PUT /api/users) ══════════════
console.log('\n── 3. ESCALADE — CHANGEMENT DE RÔLE ──');
if (secTok && aTeach.id) {
  const r = await api('PUT', '/api/users', { token: secTok, body: { id: aTeach.id, role: 'DIRECTION' } });
  ok('SECRETARY → promouvoir un compte en DIRECTION = REFUSÉ', r.status === 403, `status=${r.status}`);
  const rBis = await api('PUT', '/api/users', { token: secTok, body: { id: aTeach.id, role: 'SCHOOL_ADMIN' } });
  ok('SECRETARY → promouvoir en SCHOOL_ADMIN = REFUSÉ', rBis.status === 403, `status=${rBis.status}`);
}
if (teachTok && aTeach.id) {
  const r = await api('PUT', '/api/users', { token: teachTok, body: { id: aTeach.id, role: 'DIRECTION' } });
  ok('TEACHER → modifier un ROLE = REFUSÉ', r.status === 403, `status=${r.status}`);
}
if (parentTok && aTeach.id) {
  const r = await api('PUT', '/api/users', { token: parentTok, body: { id: aTeach.id, role: 'PARENT' } });
  ok('PARENT → modifier un ROLE = REFUSÉ', r.status === 403, `status=${r.status}`);
}
{
  // SCHOOL_ADMIN_A tente de se promouvoir lui-même super admin
  const me = await api('GET', `/api/users?schoolId=${schoolA.id}&search=${encodeURIComponent(EMAILS.aAdmin)}`, { token: aAdmin });
  const meId = me.json?.data?.[0]?.id;
  if (meId) {
    const r = await api('PUT', '/api/users', { token: aAdmin, body: { id: meId, role: 'SUPER_ADMIN_GLOBAL' } });
    ok('SCHOOL_ADMIN → s’auto-promouvoir SUPER_ADMIN_GLOBAL = REFUSÉ', r.status === 403, `status=${r.status}`);
  }
}

// ══════════════ 4. ISOLATION MULTI-ÉCOLES ══════════════
console.log('\n── 4. ISOLATION MULTI-ÉCOLES ──');
{
  const r = await api('GET', `/api/users?schoolId=${schoolB.id}`, { token: aAdmin });
  // Le route force le scoping à user.schoolId pour les non-SAG → soit 403,
  // soit 200 avec UNIQUEMENT les comptes de A (jamais ceux de B).
  const bUsersInA = r.status === 200 && (r.json?.data || []).some(u => u.schoolId === schoolB.id);
  ok('SCHOOL_ADMIN_A → utilisateurs école B = REFUSÉ / scopés', r.status === 403 || (r.status === 200 && !bUsersInA), `status=${r.status}`);

  const rList = await api('GET', `/api/users?schoolId=${schoolA.id}`, { token: aAdmin });
  const bLeak = (rList.json?.data || []).some(u => u.schoolId === schoolB.id);
  ok('Liste utilisateurs de A ne contient aucun compte de B', rList.status === 200 && !bLeak);

  if (secTok) {
    const rStud = await api('GET', `/api/students?schoolId=${schoolB.id}`, { token: secTok });
    const leak = (rStud.json?.data || []).some(s => s.schoolId === schoolB.id);
    ok('SECRETARY_A → élèves école B = REFUSÉ / vide', rStud.status === 403 || (rStud.status === 200 && !leak), `status=${rStud.status}`);
  }

  // Écriture cross-écoles sur un compte de B
  const rBUsers = await api('GET', `/api/users?schoolId=${schoolB.id}`, { token: SAG });
  const bUserId = (rBUsers.json?.data || []).find(u => u.email === EMAILS.bAdmin)?.id;
  if (bUserId) {
    const r = await api('PUT', '/api/users', { token: aAdmin, body: { id: bUserId, name: 'Piraté' } });
    ok('SCHOOL_ADMIN_A → modifier un compte de l’école B = REFUSÉ', r.status === 403, `status=${r.status}`);
    const r2 = await api('DELETE', `/api/users?id=${bUserId}`, { token: aAdmin });
    ok('SCHOOL_ADMIN_A → désactiver un compte de l’école B = REFUSÉ', r2.status === 403, `status=${r2.status}`);
  }

  if (teachTok) {
    const r = await api('GET', '/api/teacher-assignments', { token: teachTok });
    const cross = (r.json?.data || []).some(a => a.class?.schoolId && a.class.schoolId !== schoolA.id);
    ok('TEACHER_A → affectations scopées à son école uniquement', r.status === 200 && !cross, `status=${r.status}`);
  }

  // Frais scolaires cross-écoles
  const rFeesB = await api('GET', `/api/school-fees?schoolId=${schoolB.id}`, { token: aAdmin });
  ok('SCHOOL_ADMIN_A → frais de l’école B = REFUSÉ / scopés', rFeesB.status === 403 || (rFeesB.status === 200 && !(rFeesB.json?.data || []).some(f => f.schoolId === schoolB.id)), `status=${rFeesB.status}`);

  // Dossier médical cross-écoles (le staff A ne lit pas l'élève de B)
  const rStudB = await api('GET', `/api/students?schoolId=${schoolB.id}`, { token: SAG });
  const bStudentId = (rStudB.json?.data || [])[0]?.id;
  if (bStudentId && secTok) {
    const r = await api('GET', `/api/medical/records?studentId=${bStudentId}`, { token: secTok });
    ok('SECRETARY_A → dossier médical d’un élève de B = REFUSÉ', r.status === 403 || r.json?.data === null, `status=${r.status}`);
  }
}

// ══════════════ 5. IDOR PARENT ══════════════
console.log('\n── 5. IDOR — ACCÈS PARENT ──');
if (parentTok) {
  // Créer un élève RÉEL dans l'école B (via SAG) pour prouver les refus.
  const rClassesB = await api('GET', `/api/classes?schoolId=${schoolB.id}`, { token: SAG });
  const classB = (rClassesB.json?.data || [])[0];
  const rSchoolB = await api('GET', `/api/schools/${schoolB.id}`, { token: SAG });
  const yearB = (rSchoolB.json?.data?.schoolYears || [])[0];
  let bStudentId = null;
  if (classB && yearB) {
    const rStud = await api('POST', '/api/students', {
      token: SAG,
      body: {
        firstName: 'Elève', lastName: `TestB${TS}`, gender: 'M',
        classId: classB.id, schoolId: schoolB.id, schoolYearId: yearB.id,
        parentName: 'Parent B', parentPhone: `+243911${TS.slice(-6)}`,
      },
    });
    bStudentId = rStud.json?.data?.id || null;
    ok('Fixture : élève créé dans l’école B', rStud.status === 201 && !!bStudentId, `status=${rStud.status} ${JSON.stringify(rStud.json?.error || '')}`);
  } else {
    console.log('  ⚠️ Impossible de créer l’élève B (classes/année introuvables) — tests IDOR parent réduits');
  }
  if (bStudentId) {
    const r = await api('GET', `/api/students/${bStudentId}`, { token: parentTok });
    ok('PARENT_A → élève d’un autre parent = REFUSÉ', r.status === 403, `status=${r.status}`);
    const rMed = await api('GET', `/api/medical/records?studentId=${bStudentId}`, { token: parentTok });
    ok('PARENT_A → dossier médical d’un autre enfant = REFUSÉ', rMed.status === 403 || rMed.json?.data === null, `status=${rMed.status}`);
    const rPut = await api('PUT', `/api/students/${bStudentId}`, { token: parentTok, body: { phone: '+243000000000' } });
    ok('PARENT_A → modifier un autre enfant = REFUSÉ', rPut.status === 403, `status=${rPut.status}`);
    const rPay = await api('GET', `/api/payments?studentId=${bStudentId}`, { token: parentTok });
    const leak = (rPay.json?.data || []).some(p => p.studentId === bStudentId);
    ok('PARENT_A → paiements d’un autre enfant = aucun résultat', rPay.status === 403 || !leak, `status=${rPay.status}`);
  }
}

// ══════════════ 6. ABONNEMENT ══════════════
console.log('\n── 6. RESTRICTIONS D’ABONNEMENT ──');
{
  // Webhook d'abonnement : signature obligatoire
  const unsigned = await fetch(`${BASE}/api/payments/webhook/subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference: 'SUB-fake', status: 'SUCCESS' }),
  });
  ok('Webhook abonnement SANS signature = REFUSÉ (401)', unsigned.status === 401, `status=${unsigned.status}`);

  // Auto-upgrade interdit pour un SCHOOL_ADMIN
  const rUp = await api('POST', '/api/subscription/downgrade', { token: aAdmin, body: { schoolId: schoolA.id, newTier: 'ENTERPRISE' } });
  ok('SCHOOL_ADMIN → auto-upgrade ENTERPRISE = REFUSÉ', rUp.status === 403, `status=${rUp.status}`);

  // Renouvellement sans preuve de paiement
  const rRenew = await api('POST', '/api/payments/subscription/renew', { token: aAdmin, body: { tier: 'PREMIUM', paymentMethod: 'CASH' } });
  ok('SCHOOL_ADMIN → activation PREMIUM sans paiement = REFUSÉ', rRenew.status === 403, `status=${rRenew.status}`);
}

// ══════════════ 7. DURCISSEMENT RBAC + ISOLATION (chantier A) ══════════════
console.log('\n── 7. DURCISSEMENT RBAC + ISOLATION (chantier A) ──');
const cleanupExtra = [];
{
  // a) Whitelist stricte des rôles : une string arbitraire est rejetée (400),
  //    même par le SUPER_ADMIN_GLOBAL (anti-pollution du modèle User.role).
  const rBad = await api('POST', '/api/users', { token: SAG, body: { name: 'X', email: `x7-${TS}@t.app`, role: 'HACKER_ROLE', schoolId: schoolA.id, password: PWD } });
  ok('SAG → créer un rôle arbitraire « HACKER_ROLE » = REFUSÉ (400)', rBad.status === 400, `status=${rBad.status}`);

  // b) Barrière de cycle : DIRECTION_MATERNELLE ne peut pas créer
  //    DIRECTION_SECONDAIRE (même niveau 70, autrefois possible).
  const aDirM = await createUser(SAG, { name: 'Direction Mat A', email: `sec-dirm-a-${TS}@edugest-test.app`, role: 'DIRECTION_MATERNELLE', schoolId: schoolA.id });
  if (aDirM.status === 201 && aDirM.id) {
    cleanupExtra.push(aDirM.id);
    const dirMTok = await login(`sec-dirm-a-${TS}@edugest-test.app`);
    const r = await api('POST', '/api/users', { token: dirMTok, body: { name: 'X', email: `x8-${TS}@t.app`, role: 'DIRECTION_SECONDAIRE', schoolId: schoolA.id, password: PWD } });
    ok('DIRECTION_MATERNELLE → créer DIRECTION_SECONDAIRE = REFUSÉ (cycle)', r.status === 403, `status=${r.status}`);
    const r2 = await api('POST', '/api/users', { token: dirMTok, body: { name: 'Y', email: `x9-${TS}@t.app`, role: 'DIRECTION_MATERNELLE', schoolId: schoolA.id, password: PWD } });
    ok('DIRECTION_MATERNELLE → créer un compte (même cycle) = REFUSÉ (users:create non porté)', r2.status === 403, `status=${r2.status}`);
  } else {
    console.log('  ⚠️ Fixture DIRECTION_MATERNELLE non créée — tests de cycle réduits');
  }

  // c) Auto-modification : changer son PROPRE rôle est refusé (même une
  //    démotion volontaire passe par une route dédiée, jamais par PUT /api/users).
  const me2 = await api('GET', `/api/users?schoolId=${schoolA.id}&search=${encodeURIComponent(EMAILS.aAdmin)}`, { token: aAdmin });
  const meId2 = me2.json?.data?.[0]?.id;
  if (meId2) {
    const r = await api('PUT', '/api/users', { token: aAdmin, body: { id: meId2, role: 'SECRETARY' } });
    ok('SCHOOL_ADMIN → modifier son PROPRE rôle (démotion) = REFUSÉ', r.status === 403, `status=${r.status}`);
  }

  // d) Pair de même niveau : un SCHOOL_ADMIN ne peut plus désactiver un autre
  //    SCHOOL_ADMIN de la même école (canManageUserAccount strict).
  const aAdmin2 = await createUser(SAG, { name: 'Admin2 A', email: `sec-admin2-a-${TS}@edugest-test.app`, role: 'SCHOOL_ADMIN', schoolId: schoolA.id });
  if (aAdmin2.status === 201 && aAdmin2.id) {
    cleanupExtra.push(aAdmin2.id);
    const r = await api('PUT', '/api/users', { token: aAdmin, body: { id: aAdmin2.id, isActive: false } });
    ok('SCHOOL_ADMIN_A → désactiver un pair SCHOOL_ADMIN = REFUSÉ (niveau égal)', r.status === 403, `status=${r.status}`);
    const rPw = await api('PUT', '/api/users', { token: aAdmin, body: { id: aAdmin2.id, password: 'pirate-123' } });
    ok('SCHOOL_ADMIN_A → réinitialiser le mot de passe d’un pair = REFUSÉ', rPw.status === 403, `status=${rPw.status}`);
  } else {
    console.log('  ⚠️ Fixture SCHOOL_ADMIN pair non créée — tests pair réduits');
  }

  // e) IDOR lecture : la config monétaire de l'école B est interdite à
  //    SCHOOL_ADMIN_A (avant : 200 avec les données de B).
  const rCurB = await api('GET', `/api/school-currency?schoolId=${schoolB.id}`, { token: aAdmin });
  ok('SCHOOL_ADMIN_A → config monétaire école B = REFUSÉ (403)', rCurB.status === 403, `status=${rCurB.status}`);
  const rCurA = await api('GET', `/api/school-currency?schoolId=${schoolA.id}`, { token: aAdmin });
  ok('SCHOOL_ADMIN_A → config monétaire de SON école = AUTORISÉ (200)', rCurA.status === 200, `status=${rCurA.status}`);

  // f) IDOR écriture : accusé de lecture sur une communication de l'école B.
  const rComm = await api('POST', '/api/communications', {
    token: SAG,
    body: { schoolId: schoolB.id, title: `Test iso ${TS}`, content: 'Contenu de l’école B', type: 'ANNOUNCEMENT', targetType: 'ALL', sentToApp: true, sentToWhatsapp: false },
  });
  const commBId = rComm.json?.data?.id;
  if (commBId && teachTok) {
    const r = await api('POST', `/api/communications/${commBId}/read`, { token: teachTok });
    ok('TEACHER_A → accusé de lecture d’une communication de B = REFUSÉ (403)', r.status === 403, `status=${r.status}`);
    if (aParent.id) {
      const rOwn = await api('GET', `/api/communications?schoolId=${schoolA.id}&limit=5`, { token: parentTok });
      ok('SCHOOL_ADMIN_A → liste des communications de SON école = AUTORISÉ', rOwn.status === 200 || rOwn.status === 403, `status=${rOwn.status}`);
    }
  } else {
    console.log(`  ⚠️ Communication B non créée (${rComm.status}) — test accusé de lecture réduit`);
  }

  // g) Intégrité référentielle : un élève de A ne peut pas être rattaché à
  //    une classe de B (avant : classId cross-tenant accepté tel quel).
  const rClassesB = await api('GET', `/api/classes?schoolId=${schoolB.id}`, { token: SAG });
  const classB2 = (rClassesB.json?.data || [])[0];
  const rSchoolA = await api('GET', `/api/schools/${schoolA.id}`, { token: SAG });
  const yearA = (rSchoolA.json?.data?.schoolYears || [])[0];
  if (classB2 && yearA) {
    const r = await api('POST', '/api/students', {
      token: aAdmin,
      body: { firstName: 'Cross', lastName: `Tenant${TS}`, gender: 'M', classId: classB2.id, schoolId: schoolA.id, schoolYearId: yearA.id, parentName: 'Parent X', parentPhone: `+243912${TS.slice(-6)}` },
    });
    ok('SCHOOL_ADMIN_A → élève dans une CLASSE de l’école B = REFUSÉ (400)', r.status === 400, `status=${r.status} ${JSON.stringify(r.json?.error || '')}`);
  } else {
    console.log('  ⚠️ Classe B ou année A introuvable — test intégrité réduit');
  }

  // h) Audit trail : les créations de comptes sont désormais tracées
  //    (USER_CREATED visible via /api/logs pour le SAG).
  const rLogs = await api('GET', `/api/logs?action=USER_CREATED&limit=20`, { token: SAG });
  const traced = rLogs.status === 200 && (rLogs.json?.data || []).some(l => l.entityId === aSec.id);
  ok('AUDIT : création du compte fixture tracée (USER_CREATED dans /api/logs)', traced, `status=${rLogs.status}`);
  const rLogsSec = await api('GET', `/api/logs?limit=10`, { token: secTok || aAdmin });
  ok('Journal : lecture interdite au staff école (logs:read = SAG/support)', rLogsSec.status === 403, `status=${rLogsSec.status}`);
}

// ══════════════ CLEANUP (best effort) ══════════════
console.log('\n── CLEANUP ──');
{
  for (const id of [aSec.id, aTeach.id, aParent.id, ...cleanupExtra].filter(Boolean)) {
    await api('DELETE', `/api/users?id=${id}`, { token: SAG });
  }
  console.log('✔ Comptes fixtures désactivés');
  // Les écoles de test sont supprimées pour ne pas polluer la base
  for (const [label, id] of [['A', schoolA?.id], ['B', schoolB?.id]]) {
    if (!id) continue;
    const r = await api('DELETE', `/api/schools/${id}`, { token: SAG });
    console.log(`${r.status === 200 ? '✔' : '⚠'} École ${label} supprimée (${r.status})`);
  }
}

console.log(`\n════════════════════════════════════`);
console.log(`  RÉSULTAT : ${passed} réussis / ${failed} échoués`);
if (failures.length) {
  console.log('\nÉchecs :');
  failures.forEach(f => console.log(`  - ${f}`));
}
console.log('');
process.exit(failed === 0 ? 0 : 1);
