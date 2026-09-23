import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // On ne logge jamais les requêtes SQL (données sensibles, pollution des
    // logs et surcoût mémoire/I/O significatif en dev sur les gros parcours).
    // Erreurs seulement, dans tous les environnements.
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db