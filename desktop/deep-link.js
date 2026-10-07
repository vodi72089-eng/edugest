/**
 * EduGest Desktop — parsing des deep links « edugest:// ».
 *
 * Logique PURE (sans Electron) pour être testable avec node.
 *
 * Format accepté : edugest://import-db[?email=admin@ecole.cd]
 * - La route doit appartenir à la allowlist (sinon le lien est ignoré).
 * - Seul l'email transite (identifiant non secret) : JAMAIS de token ni de
 *   mot de passe dans l'URL — l'authentification se fait ensuite par mot de
 *   passe, vérifié contre la base locale ou contre le fichier .db importé.
 */
const DEEP_LINK_ROUTES = new Set(['import-db']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {string[]} argv — process.argv (cold start) ou argv du second-instance.
 * @returns {{ route: string, email: string } | null}
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
    // edugest://import-db?email=x → host = 'import-db'
    const route = String(url.host || '').toLowerCase();
    if (!DEEP_LINK_ROUTES.has(route)) continue;
    let email = '';
    try {
      const em = String(url.searchParams.get('email') || '').trim().slice(0, 120);
      if (EMAIL_RE.test(em)) email = em;
    } catch {
      email = '';
    }
    return { route, email };
  }
  return null;
}

module.exports = { parseDeepLink, DEEP_LINK_ROUTES };
