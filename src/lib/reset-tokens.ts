import crypto from 'crypto'
import { db } from '@/lib/db'

// ─── Tokens de réinitialisation de mot de passe (persistés en DB) ─────────
// Anciennement stockés dans une Map en mémoire : chaque redémarrage du
// serveur invalidait tous les codes en attente (« Code invalide ou expiré »
// mystérieux pour l'utilisateur). Désormais stockés dans la table
// PasswordResetToken (SQLite via Prisma), avec un seul token actif par numéro.

const TOKEN_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes
// Maximum number of wrong attempts before the code is invalidated
// (6-digit code = 1M combinations; 5 attempts keep brute-force infeasible)
const MAX_ATTEMPTS = 5

/**
 * Normalise un numéro de téléphone pour la recherche en base et la clé de token.
 * Ex: " 243 867 589 04 " → "+24386758904", "0033 6 12 34 56 78" → "+33612345678"
 * Sans cela, un utilisateur qui tape son numéro sans "+" ne matche jamais
 * les comptes stockés au format international "+243...".
 */
export function normalizePhone(raw: string): string {
  let p = String(raw || '').trim().replace(/[\s\-().]/g, '')
  if (p.startsWith('00')) p = '+' + p.slice(2)
  if (!p.startsWith('+') && /^\d+$/.test(p)) p = '+' + p
  return p
}

/**
 * Le code n'est JAMAIS stocké en clair : HMAC-SHA256(code). Une clé dédiée
 * peut être fournie via RESET_TOKEN_SECRET ; à défaut une clé de repli
 * stable est utilisée (le code de toute façon expire en 15 min et est
 * plafonné à MAX_ATTEMPTS essais).
 */
function hashCode(phone: string, code: string): string {
  const secret = process.env.RESET_TOKEN_SECRET || 'edugest-reset-code-v1'
  return crypto.createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex')
}

export async function createResetToken(userId: string, phone: string): Promise<string> {
  // Cryptographically secure random 6-digit code (Math.random is predictable)
  const code = crypto.randomInt(100000, 999999).toString()
  await db.passwordResetToken.upsert({
    where: { phone },
    update: {
      userId,
      codeHash: hashCode(phone, code),
      expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
      attempts: 0,
      createdAt: new Date(),
    },
    create: {
      phone,
      userId,
      codeHash: hashCode(phone, code),
      expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
    },
  })
  return code
}

/**
 * Vérifie le code SANS le consommer : sert à valider l'étape « code » du
 * formulaire en 3 étapes (sinon n'importe quel code passait à l'étape
 * suivante — faille signalée par le propriétaire). Comptabilise les
 * tentatives erronées comme verifyResetToken.
 */
export async function checkResetToken(phone: string, code: string): Promise<{ userId: string } | null> {
  const entry = await db.passwordResetToken.findUnique({ where: { phone } })
  if (!entry) return null
  if (entry.expiresAt.getTime() < Date.now()) {
    await db.passwordResetToken.delete({ where: { phone } }).catch(() => {})
    return null
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    await db.passwordResetToken.delete({ where: { phone } }).catch(() => {})
    return null
  }
  const matches = entry.codeHash === hashCode(phone, String(code || ''))
  if (!matches) {
    await db.passwordResetToken.update({
      where: { phone },
      data: { attempts: { increment: 1 } },
    }).catch(() => {})
    return null
  }
  return { userId: entry.userId }
}

/**
 * Vérifie le code puis le consomme (usage unique) — utilisé par
 * /api/auth/reset-password pour la validation finale.
 */
export async function verifyResetToken(phone: string, code: string): Promise<{ userId: string } | null> {
  const result = await checkResetToken(phone, code)
  if (result) {
    await db.passwordResetToken.delete({ where: { phone } }).catch(() => {}) // Single use
  }
  return result
}
