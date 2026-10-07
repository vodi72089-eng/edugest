/**
 * EduGest Desktop — parsing des deep links « edugest:// ».
 *
 * Logique PURE (sans Electron) pour être testable avec node.
 *
 * Format accepté : edugest://import-db[?email=admin@ecole.cd&uid=cuid]
 * - La route doit appartenir à la allowlist (sinon le lien est ignoré).
 * - Seuls l'email et l'uid transitent (identifiants non secrets) : JAMAIS de
 *   token ni de mot de passe dans l'URL — l'authentification se fait ensuite
 *   par mot de passe, vérifié contre la base locale ou contre le fichier
 *   .db importé.
 * - L'uid (id utilisateur exact) sert à détecter un AUTRE compte connecté
 *   (l'email n'est pas toujours en session locale) → déconnexion forcée.
 */
const DEEP_LINK_ROUTES = new Set(['import-db']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UID_RE = /^[a-z0-9_-]{5,64}$/i;

/**
 * @param {string[]} argv — process.argv (cold start) ou argv du second-instance.
 * @returns {{ route: string, email: string, uid: string } | null}
 */
function parseDeepLink(argv) {
  for (const arg of argv || []) {
    const s = String(arg || '');
    if (!/^edugest:\/\//i.test(s)) continue;
    let url = null;
    try {
      url = new URL(s);
    } catch {
      continue;
    }
    if (String(url.protocol || '').toLowerCase() !== 'edugest:') continue;
    // edugest://import-db?email=x&uid=y → host = 'import-db'
    const route = String(url.host || '').toLowerCase();
    if (!DEEP_LINK_ROUTES.has(route)) continue;
    let email = '';
    let uid = '';
    try {
      const em = String(url.searchParams.get('email') || '').trim().slice(0, 120);
      if (EMAIL_RE.test(em)) email = em;
      const id = String(url.searchParams.get('uid') || '').trim().slice(0, 64);
      if (UID_RE.test(id)) uid = id;
    } catch {
      email = '';
      uid = '';
    }
    return { route, email, uid };
  }
  return null;
}

module.exports = { parseDeepLink, DEEP_LINK_ROUTES };
