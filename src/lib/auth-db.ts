import { db } from '@/lib/db';

/**
 * Vérifie un mot de passe côté Postgres (pgcrypto) pour économiser le CPU
 * du Worker. bcrypt.compare en JS pur coûte ~80ms (coût 10) — au-dessus de
 * la limite de 10ms du plan Workers Free.
 *
 * Note : pgcrypto ne reconnaît pas le préfixe $2b$ (bcryptjs) → on le
 * recode en $2a$ (algorithme identique pour les mots de passe ≤ 72 octets).
 */
export async function verifyPasswordPostgres(
  identifier: string,
  password: string
): Promise<{ ok: boolean; user: any | null }> {
  const rows = await db.$queryRaw<Array<any>>`
    SELECT u.id, u.email, u.phone, u.password, u.name, u.role, u.schoolId, u.isActive, u.lastLoginAt, u.profileImageUrl, u.subjectName, u.classNames, u.isTitulaire, u.isVerified, u.emailVerifiedAt, u.phoneVerifiedAt, u.createdAt, u.updatedAt,
           public.crypt(${password}, replace(u.password, '$2b$', '$2a$')) = replace(u.password, '$2b$', '$2a$') AS ok
    FROM "User" u
    WHERE lower(u.email) = lower(${identifier}) OR u.phone = ${identifier}
    LIMIT 1
  `;
  if (rows.length === 0) return { ok: false, user: null };
  const row = rows[0];
  return { ok: row.ok, user: row };
}
