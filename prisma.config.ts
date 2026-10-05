import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'prisma/config'

// prisma.config.ts prend le relais du chargement d'environnement de la CLI :
//   1) ./.env        — versionné (chemin sandbox distant, ne pas toucher)
//   2) ./prisma/.env — gitignoré, écrase DATABASE_URL pour toutes les commandes
//      CLI locales (validate / generate / db push / migrate) : la base de dev
//      est Neon (Postgres), pas le SQLite du .env racine.
// Sans ce fichier, la CLI charge ./.env en premier (no-override) et refuse
// le provider postgresql (« URL must start with postgresql:// »).
loadEnv({ path: '.env' })
loadEnv({ path: 'prisma/.env', override: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
})
