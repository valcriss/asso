import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// Charge le .env racine (monorepo) afin que DATABASE_URL et autres variables
// soient disponibles lors des commandes Prisma (generate, migrate, db seed).
// On évite de dupliquer un .env dans apps/api.
const rootEnvPath = path.join(__dirname, '..', '..', '.env');
dotenv.config({ path: rootEnvPath });

export default defineConfig({
  // Fichier de schéma principal
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  // Configuration des migrations + script de seed.
  migrations: {
    path: path.join(__dirname, 'prisma', 'migrations'),
    // Utilise tsx pour exécuter le script TypeScript sans compilation.
    seed: 'tsx prisma/seed.ts',
  },
});
