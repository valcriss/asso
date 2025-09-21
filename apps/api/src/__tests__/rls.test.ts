import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client as PgClient } from 'pg';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';

const ADMIN_ROOT_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
const DATABASE_NAME = 'asso_test';
const ADMIN_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${DATABASE_NAME}`;
const APP_ROLE = 'app_user';
const APP_PASSWORD = 'app_user_password';
const APP_DATABASE_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@localhost:5432/${DATABASE_NAME}`;

let prisma: PrismaClient;

beforeAll(async () => {
  await recreateDatabase(DATABASE_NAME);
  await ensureApplicationRole();
  await runMigrations();
  await grantApplicationPrivileges();

  process.env.DATABASE_URL = APP_DATABASE_URL;

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: APP_DATABASE_URL,
      },
    },
  });

  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();

  const adminClient = new PgClient({ connectionString: ADMIN_ROOT_URL });
  await adminClient.connect();
  await adminClient.query(`DROP DATABASE IF EXISTS "${DATABASE_NAME}"`);
  await adminClient.end();
});

beforeEach(async () => {
  const adminClient = new PgClient({ connectionString: ADMIN_DATABASE_URL });
  await adminClient.connect();
  await adminClient.query(
    'TRUNCATE TABLE "attachment", "entry_line", "entry", "journal", "account", "fiscal_year", "organization" RESTART IDENTITY CASCADE'
  );
  await adminClient.end();
});

describe('row level security', () => {
  it('prevents reading data from another organization', async () => {
    const orgA = await prisma.organization.create({ data: { name: 'Org A' } });
    const orgB = await prisma.organization.create({ data: { name: 'Org B' } });

    const accountA = await createAccountForOrganization(orgA.id, '701', 'Revenue A');
    const accountB = await createAccountForOrganization(orgB.id, '702', 'Revenue B');

    const accountsVisibleForOrgA = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, orgA.id);
      return tx.account.findMany({ orderBy: { code: 'asc' } });
    });

    expect(accountsVisibleForOrgA).toHaveLength(1);
    expect(accountsVisibleForOrgA[0]?.id).toBe(accountA.id);

    const crossTenantLookup = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, orgA.id);
      return tx.account.findUnique({ where: { id: accountB.id } });
    });

    expect(crossTenantLookup).toBeNull();
  });

  it('rejects writes targeting another organization', async () => {
    const orgA = await prisma.organization.create({ data: { name: 'Org A' } });
    const orgB = await prisma.organization.create({ data: { name: 'Org B' } });

    await expect(
      prisma.$transaction(async (tx) => {
        await applyTenantContext(tx, orgA.id);
        return tx.account.create({
          data: {
            organizationId: orgB.id,
            code: '703',
            name: 'Cross tenant attempt',
            type: 'ASSET',
          },
        });
      })
    ).rejects.toThrowError(/row-level security policy/);
  });
});

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

  const migrationsDir = join(__dirname, '../../prisma/migrations');
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

async function createAccountForOrganization(organizationId: string, code: string, name: string) {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organizationId);
    return tx.account.create({
      data: {
        organizationId,
        code,
        name,
        type: 'ASSET',
      },
    });
  });
}

async function applyTenantContext(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const statement = Prisma.sql`SET LOCAL app.current_org = ${Prisma.raw(`'${organizationId}'`)}`;
  await tx.$executeRaw(statement);
}
