import crypto from 'crypto'

// Chiffrement AES-256-GCM des secrets de passerelles de paiement au repos.
// La clé est dérivée de PAYMENT_KEYS_SECRET (variable d'environnement).
// Sans clé configurée (développement), les valeurs sont stockées en clair
// avec un avertissement — jamais en production.

const ENCRYPTED_PREFIX = 'enc:v1:'

function getKey(): Buffer | null {
  const secret = process.env.PAYMENT_KEYS_SECRET
  if (!secret || secret.length < 16) return null
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptSecret(value: string | null | undefined): string | null {
  if (!value) return value ?? null
  const key = getKey()
  if (!key) {
    console.warn(
      '[gateway-keys] PAYMENT_KEYS_SECRET absent — secrets stockés en clair (développement uniquement)'
    )
    return value
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${ENCRYPTED_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return value ?? null
  // Compatibilité : valeur historique stockée en clair avant le chiffrement
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value
  const key = getKey()
  if (!key) {
    throw new Error(
      'PAYMENT_KEYS_SECRET absent — impossible de déchiffrer les secrets de passerelle'
    )
  }
  const payload = value.slice(ENCRYPTED_PREFIX.length)
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Secret de passerelle corrompu')
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64url')
    )
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new Error(
      'Impossible de déchiffrer les secrets de passerelle (PAYMENT_KEYS_SECRET invalide ?)'
    )
  }
}
