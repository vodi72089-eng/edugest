# Progress

## What Works
- Landing page SUPPRIMÉE : l'app démarre directement sur la page de connexion.
- Connexion unifiée (onglets « Connexion » + « Trouver mon école ») — plus de
  distinction Parent/Administration ni de message révélant le type de compte.
- Import de base de données retiré de la page de connexion → **popup dans l'app**
  (`ImportDbModal`) affichée une fois après la connexion d'un SCHOOL_ADMIN
  (identifiants validés, upload via Bearer token).
- Secrétaire : « Mon Abonnement » bloqué dans canAccessView (tous forfaits),
  exclu du comptage des admins (subscription.ts `not: 'SECRETARY'`).
- Admins d'écoles de démo (admin@lae.cd, admin@cba.cd, admin@gsk.cd freemium ;
  admin@imw.cd, admin@eds.cd standard) promus SECRETARY → SCHOOL_ADMIN :
  l'upgrade freemium fonctionne (Mon Abonnement visible + formulaire/paiement).
- Desktop : barre de menu système supprimée, splash logo officiel instantané,
  icône app (desktop/icon.png 1024×1024), installateur NSIS (raccourcis bureau
  + menu démarrer, lancement auto).
- Release GitHub automatique : chaque push main → exe reconstruit → Release
  v1.2.0 mise à jour (EduGest-Setup + EduGest-Portable).
- MCP Playwright configuré (.mcp.json) + @playwright/mcp installé.

## What's Left to Build
- Notes/bulletins parents Freemium/Essentiel : déjà retirés (fait).
- Test réel de l'exe sur machine Windows (le sandbox ne peut pas l'exécuter).

## Current Status
- Dev server : port 3000 (scripts/ensure-server.sh pour relance).
- Base de données : db/custom.db (mots de passe démo = admin123).
- Lint : 94 problèmes préexistants (baseline) — fichiers modifiés propres.
