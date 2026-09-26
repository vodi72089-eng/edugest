// ─── Recherche dans l'URL (style OrcaRouter : /catalog?q=deepseek%2Fdee) ─────
// La recherche d'une liste (élèves, classes…) est réfléchie dans l'adresse du
// navigateur sous la forme ?q=… . Conséquences :
//   - l'adresse affiche TOUJOURS où l'on se trouve ET ce qu'on cherche ;
//   - F5 (rafraîchissement) conserve la recherche — plus de résultat perdu ;
//   - l'URL est partageable : coller /students?q=matricule rouvre la même vue.
// On utilise history.replaceState (pas pushState) : taper lettre par lettre
// ne pollue pas l'historique — le bouton Retour reste un changement de VUE.
// Complément de src/lib/view-paths.ts (qui gère le pathname seul).

/** Lire la valeur courante de ?q= dans l'URL du navigateur ('' si absente). */
export function readUrlQuery(): string {
  if (typeof window === 'undefined') return '';
  try {
    return new URLSearchParams(window.location.search).get('q') || '';
  } catch { return ''; }
}

/** Réécrire ?q= dans la barre d'adresse sans recharger ni polluer l'historique. */
export function writeUrlQuery(q: string): void {
  if (typeof window === 'undefined') return;
  const base = window.location.pathname;
  const target = q ? `${base}?q=${encodeURIComponent(q)}` : base;
  if (window.location.pathname + window.location.search === target) return;
  try {
    window.history.replaceState({ edugestQuery: q }, '', target);
    // Même mécanisme que view-paths : l'UI (fil d'Ariane) est notifiée pour
    // afficher immédiatement la nouvelle adresse (/students?q=…).
    window.dispatchEvent(new CustomEvent('edugest:url'));
  } catch { /* ignore */ }
}
