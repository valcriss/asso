import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client as PgClient } from 'pg';
import { Prisma, PrismaClient } from '@prisma/client';

export const ADMIN_ROOT_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
export const DATABASE_NAME = 'asso_test';
export const ADMIN_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${DATABASE_NAME}`;
export const APP_ROLE = 'app_user';
export const APP_PASSWORD = 'app_user_password';
export const APP_DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@localhost:5432/${DATABASE_NAME}`;

export async function setupTestDatabase(): Promise<void> {
  await recreateDatabase(DATABASE_NAME);
  await ensureApplicationRole();
  await runMigrations();
  await grantApplicationPrivileges();

  process.env.DATABASE_URL = APP_DATABASE_URL;
}

export async function teardownTestDatabase(): Promise<void> {
  const adminClient = new PgClient({ connectionString: ADMIN_ROOT_URL });
  await adminClient.connect();
  await adminClient.query(`DROP DATABASE IF EXISTS "${DATABASE_NAME}"`);
  await adminClient.end();
}

export async function resetDatabase(): Promise<void> {
  const adminClient = new PgClient({ connectionString: ADMIN_DATABASE_URL });
  await adminClient.connect();
  await adminClient.query(
    'TRUNCATE TABLE "refresh_token", "user_org_role", "user", "attachment", "entry_line", "entry", "journal", "account", "fiscal_year", "organization" RESTART IDENTITY CASCADE'
  );
  await adminClient.end();
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: APP_DATABASE_URL,
      },
    },
  });
}

export async function applyTenantContext(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const statement = Prisma.sql`SET LOCAL app.current_org = ${Prisma.raw(`'${organizationId}'`)}`;
  await tx.$executeRaw(statement);
}

async function recreateDatabase(name: string): Promise<void> {
  const adminClient = new PgClient({ connectionString: ADMIN_ROOT_URL });
  await adminClient.connect();
  await adminClient.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [name]);
  await adminClient.query(`DROP DATABASE IF EXISTS "${name}"`);
  await adminClient.query(`CREATE DATABASE "${name}"`);
  await adminClient.end();
}

async function ensureApplicationRole(): Promise<void> {
  const adminClient = new PgClient({ connectionString: ADMIN_ROOT_URL });
  await adminClient.connect();
  const result = await adminClient.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP_ROLE]);

  if (result.rowCount === 0) {
    await adminClient.query(`CREATE ROLE "${APP_ROLE}" WITH LOGIN PASSWORD '${APP_PASSWORD}'`);
  } else {
    await adminClient.query(`ALTER ROLE "${APP_ROLE}" WITH PASSWORD '${APP_PASSWORD}'`);
  }

  await adminClient.end();
}

async function runMigrations(): Promise<void> {
  const client = new PgClient({ connectionString: ADMIN_DATABASE_URL });
  await client.connect();

  const migrationsDir = join(__dirname, '../../../prisma/migrations');
  const migrationFolders = (await readdir(migrationsDir)).sort();

  for (const folder of migrationFolders) {
    const sql = await readFile(join(migrationsDir, folder, 'migration.sql'), 'utf8');
    await client.query(sql);
  }

  await client.end();
}

async function grantApplicationPrivileges(): Promise<void> {
  const rootClient = new PgClient({ connectionString: ADMIN_ROOT_URL });
  await rootClient.connect();
  await rootClient.query(`GRANT CONNECT ON DATABASE "${DATABASE_NAME}" TO "${APP_ROLE}"`);
  await rootClient.end();

  const adminClient = new PgClient({ connectionString: ADMIN_DATABASE_URL });
  await adminClient.connect();
  await adminClient.query(`GRANT USAGE ON SCHEMA public TO "${APP_ROLE}"`);
  await adminClient.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${APP_ROLE}"`);
  await adminClient.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${APP_ROLE}"`);
  await adminClient.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_ROLE}"`
  );
  await adminClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${APP_ROLE}"`);
  await adminClient.end();
}
