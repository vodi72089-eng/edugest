// Déclaration du module natif « cloudflare:workers » (bindings de la
// Worker : env.UPLOADS = bucket R2, etc.).
//
// Ce module n'existe QUE dans workerd (Cloudflare Workers) — il n'est pas
// installé dans node_modules. Il est donc toujours importé de façon
// DYNAMIQUE et isolé dans src/lib/upload-store.ts (try/catch) :
//   - Workers (web)  → import résolu, bindings accessibles ;
//   - Node (EXE desktop / next dev) → import échoue → mode disque.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
