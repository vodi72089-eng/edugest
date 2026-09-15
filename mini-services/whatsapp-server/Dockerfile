FROM oven/bun:1

WORKDIR /srv

# Copier d'abord les manifests pour tirer parti du cache Docker
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY patch.mjs index.ts ./
# Patch idempotent de la lib (const → let dans luxu.js, requis par Bun)
RUN bun patch.mjs

# Session Baileys : dossier volume (persistant, jamais dans l'image)
ENV WHATSAPP_AUTH_DIR=/data/whatsapp-auth
VOLUME /data/whatsapp-auth

EXPOSE 3001

CMD ["bun", "index.ts"]
