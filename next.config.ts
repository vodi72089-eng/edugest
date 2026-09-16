import type { NextConfig } from "next";
import { VIEW_PATHS } from "./src/lib/view-paths";

// L'application est une SPA rendue par une seule page. Ces rewrites font que
// les URLs réelles (/login, /dashboard, /students…) servent l'application au
// lieu d'un 404 lors d'un rafraîchissement ou d'un lien direct. Les routes
// filesystem (API, /find-child, /verify/…) restent prioritaires : Next les
// évalue AVANT ces rewrites (afterFiles).
const SPA_REWRITES = Object.values(VIEW_PATHS)
  .filter((p) => p !== "/")
  .map((p) => ({ source: p, destination: "/" }));

const nextConfig: NextConfig = {
  output: "standalone",
  // better-sqlite3 est un module natif : ne pas le bundler (import de BDD)
  serverExternalPackages: ["better-sqlite3"],
  // Le tracing nftw suit les lectures fs dynamiques (process.cwd() + chemin
  // variable) et embarquerait sinon tout le repo — dont desktop/dist* (les
  // exes + win-unpacked ≈ 1 Go, récursion qui remplit le disque et fait
  // exploser l'installeur). Ces dossiers ne sont jamais requis au runtime.
  // ⚠️ Ne JAMAIS exclure ./.next/** : le serveur standalone en a besoin
  // (chunks SSR, manifests) — build cassé sinon.
  experimental: {
    outputFileTracingExcludes: {
      "*": [
        "./desktop/**",
        "./mini-services/**/node_modules/**",
        "./whatsapp-auth/**",
        "./.sessions/**",
        "./upload/**",
        "./download/**",
      ],
    },
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async rewrites() {
    return SPA_REWRITES;
  },
  // Security headers — non-breaking hardening (no CSP to avoid breaking
  // inline styles/scripts used by the app).
  //
  // ⚠️ PAS de X-Frame-Options ici : le panneau de preview du sandbox embarque
  // l'application via une iframe servie depuis un domaine dynamique
  // (preview-chat-<id>.space-z.ai) dont l'origine diffère de celle du panneau.
  // X-Frame-Options: SAMEORIGIN faisait bloquer ce frame par le navigateur
  // (« n'autorise pas la connexion »). Les domaines de preview étant générés
  // dynamiquement, aucune allowlist fixe n'est possible — on ne renvoie donc
  // pas ce header (les protections X-Content-Type-Options et Referrer-Policy
  // restent en place). Pour un déploiement de production sur un domaine
  // maîtrisé, ajouter plutôt CSP `frame-ancestors` avec la liste des origines
  // autorisées (X-Frame-Options est ignoré quand frame-ancestors est présent).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;
