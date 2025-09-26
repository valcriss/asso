import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client as PgClient } from 'pg';
import { Prisma, PrismaClient } from '@prisma/client';

export const ADMIN_ROOT_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
export const APP_ROLE = 'app_user';
export const APP_PASSWORD = 'app_user_password';

let currentDatabaseName: string | null = null;
let initializationPromise: Promise<void> | null = null;
let activeClients = 0;
let roleInitializationPromise: Promise<void> | null = null;
let setupLock: Promise<void> = Promise.resolve();
let releaseSetupLock: (() => void) | null = null;

export async function setupTestDatabase(): Promise<void> {
  await setupLock;

  setupLock = new Promise<void>((resolve) => {
    releaseSetupLock = resolve;
  });

  activeClients += 1;

  if (!initializationPromise) {
    initializationPromise = initializeDatabase().catch((error) => {
      initializationPromise = null;
      releaseCurrentSetupLock();
      activeClients = Math.max(0, activeClients - 1);
      throw error;
    });
  }

  await initializationPromise;

  if (!currentDatabaseName) {
    releaseCurrentSetupLock();
    activeClients = Math.max(0, activeClients - 1);
    throw new Error('Test database initialization failed');
  }

  process.env.DATABASE_URL = buildAppDatabaseUrl(currentDatabaseName);
}

export async function teardownTestDatabase(): Promise<void> {
  activeClients = Math.max(0, activeClients - 1);

  if (activeClients > 0 || !currentDatabaseName) {
    if (activeClients === 0) {
      releaseCurrentSetupLock();
    }
    return;
  }

  const databaseName = currentDatabaseName;
  currentDatabaseName = null;
  initializationPromise = null;

  const adminClient = new PgClient({ connectionString: ADMIN_ROOT_URL });
  await adminClient.connect();
  await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await adminClient.end();

  releaseCurrentSetupLock();
}

export async function resetDatabase(): Promise<void> {
  if (!currentDatabaseName) {
    throw new Error('Test database is not initialized');
  }

  const adminClient = new PgClient({ connectionString: buildAdminDatabaseUrl(currentDatabaseName) });
  await adminClient.connect();
  await adminClient.query(
    'TRUNCATE TABLE "refresh_token", "user_org_role", "user", "member_payment", "member_fee_assignment", "membership_fee_template", "member", "attachment", "fec_export", "bank_transaction", "ofx_rule", "donation", "project_period", "project", "entry_line", "entry", "bank_statement", "bank_account", "donation_receipt_sequence", "sequence_number", "journal", "account", "fiscal_year", "audit_log", "organization" RESTART IDENTITY CASCADE'
  );
  await adminClient.end();
}

export function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured. Did you call setupTestDatabase()?');
  }

  return new PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
  });
}

export async function applyTenantContext(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const statement = Prisma.sql`SET LOCAL app.current_org = ${Prisma.raw(`'${organizationId}'`)}`;
  await tx.$executeRaw(statement);
}

function buildAdminDatabaseUrl(name: string): string {
  return `postgresql://postgres:postgres@localhost:5432/${name}`;
}

function buildAppDatabaseUrl(name: string): string {
  return `postgresql://${APP_ROLE}:${APP_PASSWORD}@localhost:5432/${name}`;
}

async function recreateDatabase(name: string): Promise<void> {
  const adminClient = new PgClient({ connectionString: ADMIN_ROOT_URL });
  await adminClient.connect();
  await adminClient.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  try {
    await adminClient.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    if (!isDuplicateDatabaseError(error)) {
      await adminClient.end();
      throw error;
    }
  }
  await adminClient.end();
}

async function ensureApplicationRole(): Promise<void> {
  const adminClient = new PgClient({ connectionString: ADMIN_ROOT_URL });
  await adminClient.connect();
  const result = await adminClient.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP_ROLE]);

  if (result.rowCount === 0) {
    try {
      await adminClient.query(`CREATE ROLE "${APP_ROLE}" WITH LOGIN PASSWORD '${APP_PASSWORD}'`);
    } catch (error) {
      if (!isDuplicateRoleError(error)) {
        throw error;
      }
    }
  } else {
    try {
      await adminClient.query(`ALTER ROLE "${APP_ROLE}" WITH PASSWORD '${APP_PASSWORD}'`);
    } catch (error) {
      if (!isConcurrentUpdateError(error)) {
        throw error;
      }
    }
  }

  await adminClient.end();
}

async function runMigrations(databaseName: string): Promise<void> {
  const client = new PgClient({ connectionString: buildAdminDatabaseUrl(databaseName) });
  await client.connect();

  const migrationsDir = join(__dirname, '../../../prisma/migrations');
  const migrationFolders = (await readdir(migrationsDir)).sort();

  for (const folder of migrationFolders) {
    const sql = await readFile(join(migrationsDir, folder, 'migration.sql'), 'utf8');
    await client.query(sql);
  }

  await client.end();
}

async function grantApplicationPrivileges(databaseName: string): Promise<void> {
  const rootClient = new PgClient({ connectionString: ADMIN_ROOT_URL });
  await rootClient.connect();
  await rootClient.query(`GRANT CONNECT ON DATABASE "${databaseName}" TO "${APP_ROLE}"`);
  await rootClient.end();

  const adminClient = new PgClient({ connectionString: buildAdminDatabaseUrl(databaseName) });
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

async function initializeDatabase(): Promise<void> {
  const databaseName = generateDatabaseName();
  await ensureRoleInitialized();
  await recreateDatabase(databaseName);
  await runMigrations(databaseName);
  await grantApplicationPrivileges(databaseName);
  currentDatabaseName = databaseName;
  process.env.DATABASE_URL = buildAppDatabaseUrl(databaseName);
}

async function ensureRoleInitialized(): Promise<void> {
  if (!roleInitializationPromise) {
    roleInitializationPromise = ensureApplicationRole().catch((error) => {
      roleInitializationPromise = null;
      throw error;
    });
  }

  await roleInitializationPromise;
}

function generateDatabaseName(): string {
  return `asso_test_${randomUUID().replace(/-/g, '')}`;
}

function releaseCurrentSetupLock(): void {
  if (releaseSetupLock) {
    releaseSetupLock();
    releaseSetupLock = null;
    setupLock = Promise.resolve();
  }
}

interface PgError {
  code?: string;
  message?: string;
}

function isDuplicateDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const pgError = error as PgError;
  return pgError.code === '42P04' || pgError.code === '23505';
}

function isDuplicateRoleError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const pgError = error as PgError;
  return pgError.code === '42710' || pgError.code === '23505';
}

function isConcurrentUpdateError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const pgError = error as PgError;
  const messageIndicatesConcurrency =
    typeof pgError.message === 'string' && pgError.message.includes('tuple concurrently updated');
  return pgError.code === '40001' || messageIndicatesConcurrency;
}
