import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // better-sqlite3 est un module natif : ne pas le bundler (import de BDD)
  serverExternalPackages: ["better-sqlite3"],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
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
