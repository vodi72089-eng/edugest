# syntax=docker/dockerfile:1
# ─── Look School 360 — image de production (Coolify / VPS → Neon PostgreSQL) ──
# Le repo reste en SQLite (dev local + app desktop intacts) : le provider est
# basculé vers postgresql UNIQUEMENT dans l'image (étape sed ci-dessous).
# Source de vérité = prisma/schema.prisma — ne jamais committer le swap.
#
# Plateforme : Debian (glibc) partout — oven/bun:1 (build) et node:20-slim
# (runtime) partagent la même libc, requis pour les modules natifs
# (@swc/core au build, sharp à l'exécution). Ne PAS revenir à alpine/musl.

FROM node:20-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# Dépendances — bun est le gestionnaire canonique (bun.lock verrouillé)
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build Next.js (sortie standalone)
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# .dockerignore garantit l'absence de .env* et de node_modules host
COPY . .

# Provider SQLite -> PostgreSQL dans l'image uniquement, puis génération du
# client Prisma adapté (URL runtime fournie par Coolify, jamais en build).
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma \
 && npx prisma generate

# NEXT_PUBLIC_* est inliné à la build : valeur fournie par Coolify
# (Settings → Build Time Variables / Docker Build Args)
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

RUN npm run build

# ─── Serveur de production ───────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOME=/app \
    CHECKPOINT_DISABLE=1 \
    PORT=3000

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/prisma ./prisma
# node_modules complet : prisma CLI + engines requis pour le db push au boot
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Données persistantes (montées en volumes par docker-compose.prod.yml) —
# mkdir avant création des volumes → contenu initialisé avec la bonne ownership
RUN mkdir -p .sessions upload && chown -R node:node /app

USER node

EXPOSE 3000

# Santé : /api/health (SELECT 1 vers Neon) — Coolify s'appuie dessus aussi.
# node:20-slim n'a pas de wget → fetch natif de Node 20.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# db push idempotent au démarrage. SANS --accept-data-loss : un avertissement
# de perte de données stoppe le boot (visible dans les logs Coolify) plutôt
# que de détruire des colonnes sans humain dans la boucle.
CMD ["sh", "-c", "npx prisma db push --skip-generate && exec node server.js"]
