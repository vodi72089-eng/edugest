import crypto from 'crypto'

// Shared in-memory store for password reset tokens
// Production: use Redis or a DB table
const resetTokens = new Map<string, { userId: string; expiresAt: number; code: string; attempts: number }>()

const TOKEN_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes
// Maximum number of wrong attempts before the code is invalidated
// (6-digit code = 1M combinations; 5 attempts keep brute-force infeasible)
const MAX_ATTEMPTS = 5

export function createResetToken(userId: string, phone: string): string {
  // Cryptographically secure random 6-digit code (Math.random is predictable)
  const code = crypto.randomInt(100000, 999999).toString()
  resetTokens.set(phone, {
    userId,
    expiresAt: Date.now() + TOKEN_EXPIRY_MS,
    code,
    attempts: 0,
  })
  return code
}

export function verifyResetToken(phone: string, code: string): { userId: string } | null {
  const entry = resetTokens.get(phone)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    resetTokens.delete(phone)
    return null
  }
  // Brute-force protection: limit wrong attempts, then invalidate the code
  if (entry.attempts >= MAX_ATTEMPTS) {
    resetTokens.delete(phone)
    return null
  }
  // Constant-time comparison to avoid timing side-channels
  const provided = Buffer.from(String(code || ''))
  const expected = Buffer.from(entry.code)
  const matches = provided.length === expected.length && crypto.timingSafeEqual(provided, expected)
  if (!matches) {
    entry.attempts++
    return null
  }
  resetTokens.delete(phone) // Single use
  return { userId: entry.userId }
}
