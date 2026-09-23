# Tech Context

## Technologies Used
- Next.js 16 (App Router, output: standalone pour le desktop), TypeScript 5, React 19
- Bun (runtime + package manager) — `bun run dev` port 3000
- Prisma 6 + SQLite (fichier : `db/custom.db`, URL absolue dans .env)
- Tailwind CSS 4 + shadcn/ui (New York) + Lucide icons
- Zustand (state client) ; auth par token Bearer maison (`src/lib/auth.ts`)
- Electron 33 + electron-builder 25 (desktop/) — splash + NSIS + portable
- Baileys (WhatsApp) — mini-service port 3001 (`mini-services/whatsapp-server/`)
- better-sqlite3 (lecture des .db importés — API /api/school/import-db)
- @playwright/mcp (MCP Playwright, config .mcp.json)

## Development Setup
- Dev : `setsid nohup bun run dev < /dev/null > /dev/null 2>&1 &` (le sandbox
  tue les process sinon) — relance auto via `scripts/ensure-server.sh`
- DB : `bun run db:push` après modification de `prisma/schema.prisma`
  ⚠️ Prisma résout les chemins SQLite relatifs PAR RAPPORT AU DOSSIER DU SCHEMA
  (prisma/) — d'où DATABASE_URL="file:../db/…" dans le workflow CI.
- Lint : `bun run lint` (baseline : 94 problèmes préexistants)

## Dependencies
- Voir package.json ; desktop : electron, electron-builder, @playwright/mcp (dev)
