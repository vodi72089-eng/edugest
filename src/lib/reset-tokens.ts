import crypto from 'crypto'

// Shared in-memory store for password reset tokens
// Production: use Redis or a DB table
const resetTokens = new Map<string, { userId: string; expiresAt: number; code: string }>()

const TOKEN_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes

export function createResetToken(userId: string, phone: string): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  resetTokens.set(phone, {
    userId,
    expiresAt: Date.now() + TOKEN_EXPIRY_MS,
    code,
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
  if (entry.code !== code) return null
  resetTokens.delete(phone) // Single use
  return { userId: entry.userId }
}
