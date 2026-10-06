import crypto from 'crypto'

// Chiffrement AES-256-GCM des secrets au repos (clés de passerelles de
// paiement, tokens WhatsApp personnalisés, clés API SMS…).
// La clé est dérivée de PAYMENT_KEYS_SECRET (variable d'environnement).
//
// SÉCURITÉ (durcissement) : sans PAYMENT_KEYS_SECRET, on REFUSE désormais de
// chiffrer — l'ancien repli « stockage en clair avec avertissement » laissait
// des clés API d'argent et de messagerie lisibles en base par quiconque y
// accède (dump, sauvegarde, base partagée). L'appelant reçoit une erreur
// explicite : mieux vaut une config refusée qu'un secret en clair.
// Générer une clé :  openssl rand -base64 32

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
    throw new Error(
      'PAYMENT_KEYS_SECRET absente ou trop courte (16 caractères min.) — ' +
      'refus de stocker ce secret en clair. Générez-en une avec « openssl rand -base64 32 » ' +
      'et définissez-la dans l\'environnement du serveur.'
    )
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
    const tag = Buffer.from(tagB64, 'base64url')
    // SÉCURITÉ : le tag d'authentification GCM est attendu sur 16 octets — la
    // longueur produite par encryptSecret. Une longueur différente indique une
    // troncature éventuelle (attaques par raccourcissement de tag).
    if (tag.length !== 16) {
      throw new Error('Tag d\'authentification GCM invalide')
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64url')
    )
    decipher.setAuthTag(tag)
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
