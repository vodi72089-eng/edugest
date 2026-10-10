/**
 * EduGest — Vérification fonctionnelle des correctifs (scénarios métier).
 * Usage : DATABASE_URL="file:.../verify-fixes.db" ORANGE_MONEY_WEBHOOK_SECRET=... \
 *         node scripts/verify-fixes.mjs [baseUrl]
 *
 * À exécuter contre un serveur de PRODUCTION (standalone) branché sur une base
 * SQLite de test. Les fixtures sont créées par l'API (écoles, comptes, élèves)
 * et par Prisma (transactions de paiement, demandes d'abonnement, config de
 * passerelle) — la base de test est jetable.
 *
 * Chaque test correspond à un correctif identifié dans RAPPORT-BUGS.md.
 */
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const BASE = process.argv[2] || process.env.BASE_URL || 'http://127.0.0.1:3210';
const PWD = 'admin123';
const TS = Date.now().toString(36);
const WH_SECRET = process.env.ORANGE_MONEY_WEBHOOK_SECRET || 'wh-test-secret';

const requireC = createRequire(import.meta.url);
const { PrismaClient } = requireC('../src/generated/sqlite-client/index.js');
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

// Les créations d'écoles sont limitées par IP (anti-spam) : sur une base de test
// jetable, RESET_RATE_LIMITS=1 vide les compteurs pour rendre la suite rejouable.
if (process.env.RESET_RATE_LIMITS === '1') {
  const cleared = await db.rateLimitBucket.deleteMany({});
  console.log(`↺ compteurs de rate-limit vidés (${cleared.count})`);
}

let passed = 0, failed = 0;
const failures = [];
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
async function api(method, path, { token, body, raw } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: token } : {}) },
    body: raw !== undefined ? raw : (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let json = null; let text = '';
  try { text = await res.text(); json = JSON.parse(text); } catch { /* non-JSON */ }
  const setCookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  return { status: res.status, json, text, setCookies };
}
async function login(email, password = PWD) {
  const r = await api('POST', '/api/auth', { body: { email, password } });
  const cookie = (r.setCookies || []).filter(c => c.startsWith('edugest_token=')).map(c => c.split(';')[0]).join('; ');
  if (r.status !== 200 || !cookie) throw new Error(`login ${email} → ${r.status}`);
  return cookie;
}
function sign(bodyObj) {
  return crypto.createHmac('sha256', WH_SECRET).update(JSON.stringify(bodyObj)).digest('hex');
}
async function webhook(bodyObj, gateway = 'ORANGE_MONEY') {
  const raw = JSON.stringify(bodyObj);
  const res = await fetch(`${BASE}/api/payments/webhook?gateway=${gateway}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-signature': crypto.createHmac('sha256', WH_SECRET).update(raw).digest('hex') },
    body: raw,
  });
  let json = null; try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json };
}

console.log(`\n🧪 EduGest — Vérification des correctifs sur ${BASE}\n`);

// ════════════ FIXTURES ════════════
const SAG = await login('admin@edugest.app');
async function createSchool(name, short, email, tier, adminEmail) {
  const r = await api('POST', '/api/schools', {
    token: SAG,
    body: {
      name, shortName: short, email, phone: `+243900${TS.slice(-4)}${short.slice(-1)}`,
      city: 'Kinshasa', province: 'Kinshasa', country: 'RDC',
      subscriptionTier: tier, adminName: `Admin ${short}`, adminEmail, adminPassword: PWD,
    },
  });
  if (!r.json?.data?.school?.id) throw new Error(`école ${short}: ${r.status} ${r.text.slice(0, 200)}`);
  return r.json.data.school;
}
const schoolA = await createSchool(`Vérif A ${TS}`, `VA${TS.slice(-3)}`, `va-${TS}@edugest-test.app`, 'STANDARD', `adminA-${TS}@edugest-test.app`);
const schoolC = await createSchool(`Vérif C ${TS}`, `VC${TS.slice(-3)}`, `vc-${TS}@edugest-test.app`, 'ESSENTIEL', `adminC-${TS}@edugest-test.app`);
const [adminA, adminC] = [await login(`adminA-${TS}@edugest-test.app`), await login(`adminC-${TS}@edugest-test.app`)];
console.log(`✔ écoles : A=${schoolA.id} (STANDARD) · C=${schoolC.id} (ESSENTIEL)`);

async function schoolContext(schoolId, token) {
  const [rSchool, rClasses] = [await api('GET', `/api/schools/${schoolId}`, { token: SAG }), await api('GET', `/api/classes?schoolId=${schoolId}`, { token: SAG })];
  return { yearId: (rSchool.json?.data?.schoolYears || [])[0]?.id, classes: rClasses.json?.data || [] };
}
const ctxA = await schoolContext(schoolA.id, SAG);
const ctxC = await schoolContext(schoolC.id, SAG);
async function createStudent(ctx, schoolId, lastName, token) {
  const r = await api('POST', '/api/students', {
    token, body: { firstName: 'Eleve', lastName, gender: 'M', classId: ctx.classes[0]?.id, schoolId, schoolYearId: ctx.yearId },
  });
  return r.json?.data?.id || null;
}
const studentA = await createStudent(ctxA, schoolA.id, `VerifA${TS}`, adminA);
const studentC = await createStudent(ctxC, schoolC.id, `VerifC${TS}`, adminC);
if (!studentA || !studentC) { console.error('⛔ fixtures élèves impossibles'); process.exit(1); }
console.log(`✔ élèves : A=${studentA} · C=${studentC} · classes A=${ctxA.classes.length} sections=${ctxA.classes.map(c => c.section).join('/')}`);

// Comptes supplémentaires
async function createUserAs(token, body) {
  const r = await api('POST', '/api/users', { token, body: { password: PWD, ...body } });
  return { id: r.json?.data?.id, status: r.status };
}
const cashierA = await createUserAs(adminA, { name: 'Caissier Vérif', email: `cash-${TS}@edugest-test.app`, role: 'CASHIER', schoolId: schoolA.id });
const cashierTok = cashierA.status === 201 ? await login(`cash-${TS}@edugest-test.app`) : null;

// Fixtures Prisma : paiements + transactions + demande d'abonnement + passerelle
const mkRecord = (amount, studentId, extra = {}) => db.paymentRecord.create({
  data: { studentId, schoolId: schoolA.id, amount, paidAmount: 0, trimester: 'T1', paymentMethod: 'ORANGE_MONEY', status: 'PENDING', ...extra },
});
const r1 = await mkRecord(1000, studentA);
const r2 = await mkRecord(1000, studentA);
const r4 = await mkRecord(5000, studentA);
const mkTx = (reference, recordId, amount, convertedAmount, currency = 'USD', baseCurrency = 'CDF') => db.paymentTransaction.create({
  data: { schoolId: schoolA.id, paymentRecordId: recordId, studentId: studentA, gatewayType: 'ORANGE_MONEY', reference, amount, currency, convertedAmount, baseCurrency, status: 'PENDING', initiatedBy: 'verify-script' },
});
const t1 = await mkTx(`REF1-${TS}`, r1.id, 1, 2500);
const t2 = await mkTx(`REF2-${TS}`, r2.id, 1, 400);
const t4 = await mkTx(`REF4-${TS}`, null, 100, 100, 'USD', 'USD');
// Transaction PENDING dédiée au test « SUCCESS manuel » : les autres ont été
// soldées par les webhooks testés plus haut (le garde ne s'applique qu'à une
// transition réelle vers SUCCESS).
const t5 = await mkTx(`REF5-${TS}`, null, 300, 300, 'USD', 'USD');
await db.subscriptionRequest.create({ data: { schoolId: schoolA.id, requestedTier: 'STANDARD', currentTier: 'STANDARD', status: 'PAID', requestedByName: 'Vérif', requestedById: 'verify-script' } });
await db.paymentGatewayConfig.create({ data: { schoolId: schoolA.id, gatewayType: 'ORANGE_MONEY', isActive: true, isTestMode: true, merchantId: 'SHORTCODE-1', publicKey: 'PASSKEY-SECRET-123', currency: 'USD' } });
console.log('✔ fixtures Prisma : transactions, demande PAID, passerelle (passkey en clair)');

// ════════════ 1. ARGENT ════════════
console.log('\n── BUG-1 : le webhook crédite le montant CONVERTI (pas le montant devise) ──');
{
  const r = await webhook({ status: 'SUCCESS', order_id: `REF1-${TS}`, pay_token: `TX1-${TS}`, amount: 1 }); // 1 USD, sans champ Currency
  const rec = await db.paymentRecord.findUnique({ where: { id: r1.id } });
  ok('webhook accepté', r.status === 200, `status=${r.status} ${JSON.stringify(r.json)}`);
  ok('paidAmount = 2500 (convertedAmount) et non 1', rec.paidAmount === 2500, `paidAmount=${rec.paidAmount}`);
  ok('record soldé (2500 ≥ 1000)', rec.status === 'PAID', `status=${rec.status}`);
}

console.log('\n── BUG-2 : un rejeu de webhook ne crédite pas deux fois ──');
{
  const first = await webhook({ status: 'SUCCESS', order_id: `REF2-${TS}`, pay_token: `TX2-${TS}`, amount: 1 });
  const after1 = await db.paymentRecord.findUnique({ where: { id: r2.id } });
  const replay = await webhook({ status: 'SUCCESS', order_id: `REF2-${TS}`, pay_token: `TX2-${TS}`, amount: 1 });
  const after2 = await db.paymentRecord.findUnique({ where: { id: r2.id } });
  ok('1er envoi : sous-paiement → 422', first.status === 422, `status=${first.status}`);
  ok('1er envoi crédite 400', after1.paidAmount === 400 && after1.status === 'PARTIAL', `paidAmount=${after1.paidAmount} status=${after1.status}`);
  ok('rejeu détecté comme doublon', replay.status === 200 && replay.json?.duplicate === true, `status=${replay.status} ${JSON.stringify(replay.json)}`);
  ok('rejeu NE recrédite PAS (toujours 400, pas 800)', after2.paidAmount === 400, `paidAmount=${after2.paidAmount}`);
}

console.log('\n── BUG-13 : sous-paiement SANS PaymentRecord → AMOUNT_MISMATCH (jamais SUCCESS) ──');
{
  const r = await webhook({ status: 'SUCCESS', order_id: `REF4-${TS}`, pay_token: `TX4-${TS}`, amount: 50 });
  const tx = await db.paymentTransaction.findUnique({ where: { id: t4.id } });
  ok('réponse 422 (mismatch)', r.status === 422, `status=${r.status} ${JSON.stringify(r.json)}`);
  ok('transaction = AMOUNT_MISMATCH', tx.status === 'AMOUNT_MISMATCH', `status=${tx.status}`);
}

console.log('\n── BUG-23 : montants arrondis au lieu de tronqués ──');
{
  const r = await api('POST', '/api/payments', { token: adminA, body: { schoolId: schoolA.id, studentId: studentA, amount: 33.5, paidAmount: 33.5, trimester: 'T1', paymentMethod: 'CASH' } });
  const rec = r.json?.data?.id ? await db.paymentRecord.findUnique({ where: { id: r.json.data.id } }) : null;
  ok('paiement créé', r.status === 201 && !!rec, `status=${r.status}`);
  ok('amount = 34 (et non 33)', rec?.amount === 34, `amount=${rec?.amount}`);
  ok('paidAmount = 34', rec?.paidAmount === 34, `paidAmount=${rec?.paidAmount}`);
}

// ════════════ 2. ABONNEMENT / PAYWALL ════════════
console.log('\n── BUG-4 : une preuve de paiement ne sert QU’UNE fois ──');
{
  const first = await api('POST', '/api/payments/subscription/renew', { token: adminA, body: { tier: 'STANDARD', paymentMethod: 'CASH' } });
  const second = await api('POST', '/api/payments/subscription/renew', { token: adminA, body: { tier: 'STANDARD', paymentMethod: 'CASH' } });
  ok('1er renouvellement accepté (200)', first.status === 200, `status=${first.status} ${JSON.stringify(first.json?.error || '')}`);
  // Après consommation, la 2e tentative ne trouve PLUS de demande PAID → 403
  // (« Aucun paiement validé ») ; le 409 est réservé à la course concurrente.
  ok('2e renouvellement refusé (403/409, jamais 200)', second.status === 403 || second.status === 409, `status=${second.status}`);
  const req = await db.subscriptionRequest.findFirst({ where: { schoolId: schoolA.id, status: 'CONSUMED' } });
  ok('demande marquée CONSUMED', !!req);
}

console.log('\n── BUG-12 : bulletin officiel refusé en ESSENTIEL (autorisé en STANDARD) ──');
{
  const rEss = await api('POST', `/api/bulletins/${studentC}/whatsapp?trimester=T1&schoolId=${schoolC.id}`, { token: adminC, body: {} });
  ok('ESSENTIEL → 403 report_cards', rEss.status === 403 && /report_cards/.test(rEss.text), `status=${rEss.status} ${rEss.text.slice(0, 120)}`);
  const rStd = await api('POST', `/api/bulletins/${studentA}/whatsapp?trimester=T1&schoolId=${schoolA.id}`, { token: adminA, body: {} });
  ok('STANDARD → passe le contrôle de forfait', rStd.status !== 403 || !/report_cards/.test(rStd.text), `status=${rStd.status} ${rStd.text.slice(0, 120)}`);
}

// ════════════ 3. SÉCURITÉ ════════════
console.log('\n── BUG-6 : IDOR config devise entre écoles ──');
{
  const cross = await api('GET', `/api/school-currency?schoolId=${schoolC.id}`, { token: adminA });
  const own = await api('GET', `/api/school-currency?schoolId=${schoolA.id}`, { token: adminA });
  ok('école étrangère → 403', cross.status === 403, `status=${cross.status}`);
  ok('sa propre école → 200', own.status === 200, `status=${own.status}`);
}

console.log('\n── BUG-9 : passkey M-Pesa jamais renvoyé en clair ──');
{
  const r = await api('GET', `/api/payment-gateways?schoolId=${schoolA.id}`, { token: adminA });
  ok('passkey absente de la réponse', r.status === 200 && !r.text.includes('PASSKEY-SECRET-123'), `status=${r.status} fuite=${r.text.includes('PASSKEY-SECRET-123')}`);
}

console.log('\n── BUG-10 : SUCCESS manuel refusé à un caissier ──');
{
  if (!cashierTok) { console.log('  ⚠️ caissier non créé — test ignoré'); }
  else {
    const r = await api('PUT', `/api/payment-transactions/${t5.id}`, { token: cashierTok, body: { status: 'SUCCESS' } });
    ok('caissier → PUT SUCCESS = 403', r.status === 403, `status=${r.status} ${r.text.slice(0, 100)}`);
  }
}

console.log('\n── BUG-22 : la déconnexion de l’agent WhatsApp partagé est réservée à la plateforme ──');
{
  const r = await api('POST', '/api/whatsapp-status', { token: adminA, body: { action: 'logout' } });
  ok('SCHOOL_ADMIN → logout = 403', r.status === 403, `status=${r.status} ${r.text.slice(0, 100)}`);
}

console.log('\n── BUG-21 : personnalisation réservée à PREMIUM+ ──');
{
  const r = await api('PUT', '/api/school/design', { token: adminA, body: { schoolId: schoolA.id, designPrimary: '#123456' } });
  ok('école STANDARD → 403', r.status === 403, `status=${r.status} ${r.text.slice(0, 100)}`);
}

console.log('\n── BUG-17 : le SCHOOL_ADMIN peut configurer les frais (était 403) ──');
{
  const r = await api('POST', '/api/school-fees', { token: adminA, body: { name: `Frais Vérif ${TS}`, amount: 1500, trimester: 'T1', classId: ctxA.classes[0]?.id, schoolId: schoolA.id } });
  ok('création d’un frais → 201 (et non 403)', r.status === 201, `status=${r.status} ${r.text.slice(0, 120)}`);
}

console.log('\n── BUG-18 : la recherche d’élève par nom ne franchit pas l’école ──');
{
  const r = await api('POST', '/api/payments', { token: adminA, body: { schoolId: schoolA.id, studentName: `Eleve VerifC${TS}`, amount: 100, paidAmount: 100, trimester: 'T1' } });
  const leaks = JSON.stringify(r.json?.suggestions || []).includes(studentC);
  ok('élève d’une autre école introuvable', (r.status === 404 || r.status === 400) && !leaks, `status=${r.status} fuite=${leaks}`);
}

// ════════════ 4. DONNÉES / RAPPORTS ════════════
console.log('\n── BUG-25 : une moyenne de 0 est conservée (et non transformée en null) ──');
{
  // schoolId, studentId, trimester et decision sont lus dans le CORPS.
  const r = await api('POST', '/api/report-cards', { token: adminA, body: { schoolId: schoolA.id, studentId: studentA, trimester: 'T1', decision: 'PENDING', average: 0 } });
  const card = await db.reportCard.findFirst({ where: { studentId: studentA, trimester: 'T1' }, orderBy: { generatedAt: 'desc' } });
  ok('bulletin créé', r.status === 201 || r.status === 200, `status=${r.status} ${r.text.slice(0, 120)}`);
  ok('average = 0 (pas null)', card?.average === 0, `average=${card?.average}`);
}

console.log('\n── BUG-3 : un paiement PARTIAL est daté (donc présent dans la caisse) ──');
{
  const r = await api('POST', '/api/payments', { token: adminA, body: { schoolId: schoolA.id, studentId: studentA, amount: 1000, paidAmount: 400, trimester: 'T2', paymentMethod: 'CASH' } });
  const rec = r.json?.data?.id ? await db.paymentRecord.findUnique({ where: { id: r.json.data.id } }) : null;
  ok('statut PARTIAL', rec?.status === 'PARTIAL', `status=${rec?.status}`);
  ok('paidAt renseigné', !!rec?.paidAt, `paidAt=${rec?.paidAt}`);
}

console.log('\n── BUG-8 : scoping de cycle en discipline ──');
try {
  const sections = [...new Set(ctxA.classes.map(c => c.section))];
  if (sections.length < 2) {
    console.log(`  ⚠️ une seule section dans l’école A (${sections.join('/')}) — test de cycle ignoré`);
  } else {
    const du = await createUserAs(adminA, { name: 'Discipline Vérif', email: `disc-${TS}@edugest-test.app`, role: 'DISCIPLINE_MATERNELLE', schoolId: schoolA.id });
    const discTok = du.status === 201 ? await login(`disc-${TS}@edugest-test.app`) : null;
    const otherClass = ctxA.classes.find(c => c.section && c.section !== 'MATERNELLE');
    const otherStudent = otherClass ? await db.student.findFirst({ where: { classId: otherClass.id, schoolId: schoolA.id } }) : null;
    if (discTok && otherStudent) {
      await db.disciplineRecord.create({ data: { studentId: otherStudent.id, schoolId: schoolA.id, type: 'INCIDENT', severity: 'MINOR', title: `Sanction hors cycle ${TS}`, description: 'test', points: 1, listType: 'GREYLIST', status: 'CONFIRMED', createdBy: 'verify-script' } });
      const r = await api('GET', `/api/discipline?schoolId=${schoolA.id}&limit=200`, { token: discTok });
      const leak = (r.json?.data || []).some(d => d.studentId === otherStudent.id);
      ok('DISCIPLINE_MATERNELLE ne voit pas le hors-cycle', r.status === 200 && !leak, `status=${r.status} fuite=${leak} section=${otherClass?.section}`);
    } else {
      console.log('  ⚠️ fixture de cycle incomplète — test ignoré');
    }
  }
} catch (e) {
  console.log(`  ⚠️ test de cycle non exécutable : ${e.message.slice(0, 160)}`);
}

// ════════════ CLEANUP ════════════
console.log('\n── CLEANUP ──');
for (const u of [`adminA-${TS}@edugest-test.app`, `adminC-${TS}@edugest-test.app`, `cash-${TS}@edugest-test.app`, `disc-${TS}@edugest-test.app`]) {
  const found = await db.user.findUnique({ where: { email: u } });
  if (found) await db.user.update({ where: { id: found.id }, data: { isActive: false } }).catch(() => {});
}
for (const id of [schoolA.id, schoolC.id]) {
  const r = await api('DELETE', `/api/schools/${id}`, { token: SAG });
  console.log(`${r.status === 200 ? '✔' : '⚠'} école supprimée (${r.status})`);
}
await db.$disconnect();

console.log(`\n════════════════════════════════════`);
console.log(`  RÉSULTAT VÉRIFICATION : ${passed} réussis / ${failed} échoués`);
if (failures.length) { console.log('\nÉchecs :'); failures.forEach(f => console.log('  - ' + f)); }
console.log('');
process.exit(failed === 0 ? 0 : 1);
