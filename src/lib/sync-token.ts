import crypto from 'crypto';

// Jetons de synchronisation exe → Neon (authentification automatique).
//
// Principe : l'admin tape son mot de passe plateforme UNE SEULE FOIS
// (activation dans Paramètres). Le serveur Neon renvoie un JWT maison
// (HS256, sans dépendance) lié à UNE école, valable 365 jours, stocké
// uniquement dans l'exe (jamais sur Neon, rien à migrer en base).
//
// Le jeton n'autorise QUE POST /api/sync/push (insert-only) pour SON école :
// pas de lecture, pas de modification, pas de suppression. Volé, il permet
// au pire d'ajouter des lignes (borné par le rate-limit sync-push).
// Mot de passe plateforme : transmis en mémoire uniquement, jamais stocké.

const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 an
const PURPOSE = 'edugest-sync-v1';

function getSecret(): string {
  // Lecture paresseuse (jamais au chargement du module) : les routes qui
  // n'utilisent pas les jetons ne doivent pas planter sans le secret.
  const s = process.env.RESET_TOKEN_SECRET || '';
  if (!s || s.length < 32) {
    throw new Error('SYNC indisponible : RESET_TOKEN_SECRET manquant (32 caractères min)');
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Buffer {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b + '='.repeat((4 - (b.length % 4)) % 4), 'base64');
}

export interface SyncTokenPayload {
  purpose: string;
  schoolId: string;
  iat: number;
  exp: number;
}

/** Émet un jeton lié à une école (vérifier l'identité de l'école AVANT). */
export function issueSyncToken(schoolId: string): { token: string; expiresAt: string } {
  const now = Date.now();
  const payload: SyncTokenPayload = {
    purpose: PURPOSE,
    schoolId,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = b64url(crypto.createHmac('sha256', getSecret()).update(body).digest());
  return { token: `${body}.${sig}`, expiresAt: new Date(payload.exp).toISOString() };
}

/** Vérifie un jeton. Retourne le schoolId, ou null si invalide/expiré. */
export function verifySyncToken(token: unknown): { schoolId: string } | null {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = b64url(crypto.createHmac('sha256', getSecret()).update(body).digest());
    const a = unb64url(sig);
    const b = unb64url(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(unb64url(body).toString('utf8')) as Partial<SyncTokenPayload>;
    if (payload.purpose !== PURPOSE) return null;
    if (typeof payload.schoolId !== 'string' || !payload.schoolId) return null;
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    return { schoolId: payload.schoolId };
  } catch {
    return null;
  }
}
