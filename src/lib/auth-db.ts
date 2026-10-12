import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * Vérification du mot de passe — DEUX dialectes :
 *
 * - Postgres/Neon (web, Workers) → pgcrypto côté base. bcrypt.compare en JS
 *   pur coûte ~80 ms (coût 10) — au-dessus de la limite de 10 ms du plan
 *   Workers Free, d'où le délestage dans SQL.
 * - SQLite (app desktop EXE + CI) → ni schéma `public`, ni fonction `crypt()` :
 *   la requête pgcrypto y provoquerait une erreur SQL à CHAQUE connexion
 *   (régression constatée : suite de sécurité CI en échec + login EXE cassé).
 *   On revient à bcryptjs en JS — CPU non contraint hors Workers.
 *
 * Note pgcrypto : ne reconnaît pas le préfixe $2b$ (bcryptjs) — on le recode
 * en $2a$ (algorithme identique pour les mots de passe ≤ 72 octets).
 */
const isSqlite = (process.env.DATABASE_URL || '').startsWith('file:');

export async function verifyPassword(
  identifier: string,
  password: string
): Promise<{ ok: boolean; user: any | null }> {
  if (!isSqlite) return verifyPasswordPostgres(identifier, password);

  // Chemin SQLite (identique à l'implémentation d'avant pgcrypto, plus la
  // tolérance casse sur l'email pour rester aligné avec lower() pg) :
  // email exact, email en minuscules, puis téléphone.
  const user = await db.user
    .findFirst({
      where: {
        OR: [{ email: identifier }, { email: identifier.toLowerCase() }, { phone: identifier }],
      },
    })
    .catch(() => null);
  if (!user) return { ok: false, user: null };
  try {
    const ok = !!user.password && (await bcrypt.compare(password, user.password));
    return { ok, user };
  } catch {
    // Hash absent/corrompu → traitement identique à un mot de passe faux.
    return { ok: false, user };
  }
}

/** Vérification côté Postgres (pgcrypto) — voir commentaire de module. */
async function verifyPasswordPostgres(
  identifier: string,
  password: string
): Promise<{ ok: boolean; user: any | null }> {
  // ⚠️ Colonnes QUOTÉES (camelCase) : Prisma crée les colonnes comme `schoolId`
  // (identifiants entre guillemets, casse préservée). Sans guillemets, Postgres
  // plie en minuscules (schoolid) → « column u.schoolid does not exist » et
  // TOUTE connexion email/mdp renvoie 500 (constaté en prod sur la base Neon
  // camelCase après le changement de worker).
  const rows = await db.$queryRaw<Array<any>>`
    SELECT u."id", u."email", u."phone", u."password", u."name", u."role", u."schoolId", u."isActive", u."lastLoginAt", u."profileImageUrl", u."subjectName", u."classNames", u."isTitulaire", u."isVerified", u."emailVerifiedAt", u."phoneVerifiedAt", u."createdAt", u."updatedAt",
           public.crypt(${password}, replace(u."password", '$2b$', '$2a$')) = replace(u."password", '$2b$', '$2a$') AS ok
    FROM "User" u
    WHERE lower(u."email") = lower(${identifier}) OR u."phone" = ${identifier}
    LIMIT 1
  `;
  if (rows.length === 0) return { ok: false, user: null };
  const row = rows[0];
  return { ok: row.ok, user: row };
}
