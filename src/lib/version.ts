// Version affichée dans l'UI (barre latérale + pied de page de connexion).
// Sert de marqueur visuel : si ce numéro n'apparaît pas dans l'app, la copie
// locale exécute encore l'ancien code (git pull incomplet ou serveur non
// redémarré). Incrémenter à chaque correctif poussé sur main.
export const APP_VERSION = '0.3.6';
