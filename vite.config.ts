import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";
import path from "node:path";
import { defineConfig } from "vite";

// ─── Migration vinext (Next.js API réimplémentée sur Vite) ──────────────────
// Étape locale : `bun run dev:vinext` (vite dev). Next (`bun run dev`) reste
// fonctionnel à côté — migration non destructive.
// Phase déploiement : @cloudflare/vite-plugin (workerd en dev local, environnements
// rsc + ssr) + wrangler.jsonc (main: "vinext/server/app-router-entry", nodejs_compat,
// bindings Hyperdrive/R2/Queues/DO) — cf. skill migrate-to-vinext.
// ─── Builtins Node → import ESM `node:*` (workerd) ───────────────────────────
// Constat (prod) : dans `dist/server`, les dépendances CJS (qrcode, pdfkit,
// nodemailer, web-push, jspdf…) externalisent `fs`, `stream`, `zlib`… comme
// `require("fs")` via la shim rolldown (`rolldown-runtime-*.js` → helper `f`).
// Or workerd n'expose un global `require` QUE dans les modules contenant un
// `require(...)` littéral ; la shim n'en contient pas (elle fait
// `require.apply(this, arguments)`) → `typeof require === "undefined"` →
// « Calling `require` for "fs" en environment that doesn't expose the require
// function » → 1101 / 500 sur TOUTES les routes (entry `index.js` importe
// statiquement toutes les routes, donc un seul module au top-level qui casse
// tue l'application entière).
// Même si `require` existait, workerd refuse le require dynamique
// (« Dynamic require of "fs" is not supported ») — vérifié par probe sur
// `*.workers.dev`.
// Correction (v2) : simple `external: true` ne suffit pas — les `require()`
// du code CJS embarqué restent des **require dynamiques** via la shim
// (`require("node:fs")` → workerd : « Dynamic require … not supported » /
// « environment that doesn't expose the require function »).
// Correction retenue : bundler un **shim virtuel** par builtin. Le require
// devient alors un import de module interne, et le shim ré-exporte `node:*`
// via des `import … from "node:fs"` STATIQUES, que workerd résout avec
// `nodejs_compat` (probe prod : 30/30 builtins importables, `require("fs")`
// littéral fonctionne aussi).
// Limité aux environnements serveur pour ne jamais toucher au bundle client.
const NODE_BUILTINS = new Set([
  "assert", "assert/strict", "async_hooks", "buffer", "child_process", "cluster",
  "console", "constants", "crypto", "dgram", "diagnostics_channel", "dns",
  "dns/promises", "domain", "events", "fs", "fs/promises", "http", "http2",
  "https", "inspector", "module", "net", "os", "path", "path/posix",
  "path/win32", "perf_hooks", "process", "punycode", "querystring", "readline",
  "readline/promises", "repl", "stream", "stream/consumers", "stream/promises",
  "stream/web", "string_decoder", "sys", "timers", "timers/promises", "tls",
  "tty", "url", "util", "util/types", "v8", "vm", "wasi", "worker_threads",
  "zlib",
]);

const SERVER_ENVIRONMENTS = new Set(["rsc", "ssr"]);

/** Préfixe Rollup `\0` = module virtuel non résolvable depuis le disque. */
const SHIM_PREFIX = "\0edugest-node-shim:";

/**
 * Extension du shim : `.cjs`.
 *
 * Un shim ESM ne suffit PAS (constaté : 500 « superCtor.prototype must be of
 * type object » sur qrcode/pngjs) — l'helper d'interop de rolldown
 * (`m.__esModule ? m.default : m` / `getModuleExports` qui teste
 * `hasOwnProperty(m, "module.exports")`) renvoie le *registre*
 * `{default: …}` au lieu de la valeur CJS réelle. En revanche un module CJS
 * pose `module.exports` sur le registre → le consumer CJS reçoit
 * directement la valeur Node attendue : `require("stream")` = la fonction
 * `Stream`, `require("path")` = l'objet `path`, etc.
 */
const SHIM_EXT = ".cjs";

/**
 * Seconde couche : module virtuel **ESM** qui importe `node:<nom>` de façon
 * statique (externalisation ESM, acceptée par workerd), puis expose la valeur.
 *
 * Deux couches sont nécessaires : rolldown laisse tout `require()` d'un module
 * EXTERNE depuis du CJS sous forme de require dynamique (interdit par workerd,
 * cf. https://rolldown.rs/in-depth/bundling-cjs#require-external-modules) — vu
 * dans le shim `.cjs` généré : `` e(`node:stream`) `` → 1101. Inversement, un
 * shim ESM pur est consommé via l'helper d'interop `__toESM`, qui renvoie un
 * *namespace* (jamais `.default`) → `util.inherits(c, <objet>)` plante.
 * → CJS pour le consumer, ESM pour l'import du builtin.
 */
const IMPL_PREFIX = "\0edugest-node-impl:";

function shimId(name: string): string {
  return SHIM_PREFIX + name + SHIM_EXT;
}

function implId(name: string): string {
  return IMPL_PREFIX + name + ".mjs";
}

/**
 * Remplace chaque builtin Node par un shim bundlé qui ré-exporte `node:<nom>`.
 *
 * Pourquoi ne pas externaliser directement ? Parce que le code CJS embarqué
 * (qrcode/pdfkit/nodemailer/web-push/jspdf) appelle `require("fs")` : avec un
 * module externe, rolldown génère un appel `require()` dynamique — interdit par
 * workerd. En faisant du shim un module INTERNE, cet appel devient un import
 * de module bundlé, et seul le shim importe `node:fs` de façon statique.
 */
function nodeBuiltinsEsmPlugin() {
  return {
    name: "edugest:node-builtins-esm",
    enforce: "pre" as const,
    resolveId: {
      handler(
        this: { environment?: { name?: string } },
        id: string,
        importer?: string,
      ) {
        const env = this.environment?.name;
        // Hors rsc/ssr (client) : aucun builtin Node attendu → ne rien faire.
        if (env !== undefined && !SERVER_ENVIRONMENTS.has(env)) return null;

        // Import fait PAR un shim → on externalise en ESM `node:<nom>`.
        // (Sans ce cas, le shim s'importerait lui-même en boucle infinie.)
        if (importer?.startsWith(SHIM_PREFIX) || importer?.startsWith(IMPL_PREFIX)) {
          if (id.startsWith(IMPL_PREFIX)) return id;
          const name = id.startsWith("node:") ? id.slice(5) : id;
          return NODE_BUILTINS.has(name) ? { id: `node:${name}`, external: true } : null;
        }
        if (id.startsWith(SHIM_PREFIX) || id.startsWith(IMPL_PREFIX)) return id;

        // Chemins (absolus ou relatifs) → jamais un builtin bare specifier.
        if (id.startsWith(".") || id.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(id)) {
          return null;
        }
        if (id.startsWith("node:")) {
          // Déjà `node:` mais appelé depuis du CJS → même problème de require
          // dynamique : on le fait passer par le shim bundlé.
          return NODE_BUILTINS.has(id.slice(5)) ? shimId(id.slice(5)) : null;
        }
        if (!NODE_BUILTINS.has(id)) return null;
        return shimId(id);
      },
    },
    load: {
      handler(this: { environment?: { name?: string } }, id: string) {
        // Couche 1 (ESM) : import STATIQUE du builtin → externalisé en
        // `import … from "node:<nom>"`, résolu par workerd + nodejs_compat.
        if (id.startsWith(IMPL_PREFIX)) {
          const name = id.slice(IMPL_PREFIX.length, id.length - ".mjs".length);
          const specifier = `node:${name}`;
          return [
            `// Impl ESM générée par vite.config.ts (nodeBuiltinsEsmPlugin)`,
            `import * as ns from ${JSON.stringify(specifier)};`,
            // La valeur Node réelle : `require("stream")` = la fonction
            // `Stream`, `require("path")` = l'objet `path`, etc. Le namespace
            // seul ne convient pas (util.inherits exige un constructeur).
            `const value = ns.default ?? ns;`,
            `export default value;`,
            `export { value as __edugest_value };`,
          ].join("\n");
        }
        if (!id.startsWith(SHIM_PREFIX)) return null;
        const name = id.slice(SHIM_PREFIX.length, id.length - SHIM_EXT.length);
        const impl = JSON.stringify(implId(name));
        return [
          `// Shim CJS généré par vite.config.ts (nodeBuiltinsEsmPlugin)`,
          `const m = require(${impl});`,
          // Le consumer CJS appelle ce shim comme une thunk et lit directement
          // `module.exports` (pas d'interop) → on y place la VALEUR.
          // `m` peut être soit la valeur elle-même, soit un namespace ESM
          // (selon l'helper d'interop émis par rolldown) → on unwrap `default`.
          `module.exports = (m && typeof m === "object" && "default" in m)`,
          `  ? (m.__edugest_value ?? m.default)`,
          `  : m;`,
        ].join("\n");
      },
    },
  };
}

export default defineConfig({
  plugins: [
    nodeBuiltinsEsmPlugin(),
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      // Windows : miniflare `updateConnection()` fetch l'inspecteur workerd
      // (GET /json) juste après l'annonce du port → ECONNRESET non catché →
      // crash du démarrage (trouvé via trace fetch). `false` désactive
      // l'inspecteur (perte du /__debug DevTools, sans impact prod).
      // À réactiver si/when miniflare ajoute un retry (cloudflare/workers-sdk).
      inspectorPort: false,
    }),
  ],
  // ── Prisma sous workerd : forcer l'entrée WASM ─────────────────────────────
  // `@prisma/client` est résolu via la condition `node` → .prisma/client/index.js
  // → moteur natif `libquery_engine-<platform>.so.node`, qui n'existe PAS dans un
  // bundle Workers. Résultat en prod :
  //   « Prisma Client could not locate the Query Engine for runtime
  //    "debian-openssl-1.1.x" » → /api/health 503 et /api/schools 500.
  // La mappe `#main-entry-point` de .prisma/client propose bien
  // `workerd → wasm.js`, mais `node` est testé AVANT `workerd`, et `resolve.conditions`
  // étant additif (on ne peut pas retirer `node`), l'alias est le seul levil déterministe.
  // `wasm.js` = client edge, charge `query_engine_bg.wasm` (pas de moteur natif)
  // et délègue le SQL à l'adapter (@prisma/adapter-neon).
  // NB : `@prisma/client/wasm` ne peut pas servir de cible — son export `import`
  // pointe vers `wasm.mjs`, fichier inexistant (seul le CJS `wasm.js` est généré).
  resolve: {
    alias: [
      {
        find: /^@prisma\/client$/,
        replacement: path.resolve(
          process.cwd(),
          "node_modules/.prisma/client/wasm.js"
        ),
      },
    ],
  },
  // Ensure @prisma/client binary (.node) is included in the bundle
  // and not tree-shaken/externalized by Vite/rolldown.
  optimizeDeps: {
    include: ["@prisma/client"],
  },
  ssr: {
    noExternal: ["@prisma/client"],
  },
});
