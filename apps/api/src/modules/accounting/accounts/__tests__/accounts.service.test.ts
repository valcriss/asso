import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  setupTestDatabase,
  teardownTestDatabase,
  resetDatabase,
  createPrismaClient,
  applyTenantContext,
} from '../../../../__tests__/helpers/database';
import {
  createAccount,
  importDefaultAccounts,
  listAccounts,
  updateAccount,
} from '..';

let prisma: PrismaClient;

beforeAll(async () => {
  await setupTestDatabase();
  prisma = createPrismaClient();
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  await teardownTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('account services', () => {
  it('creates an account after validation', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Org Accounts' } });

    const created = await withTenant(organization.id, (tx) =>
      createAccount(tx, organization.id, { code: '512', name: 'Banque', type: 'ASSET' })
    );

    expect(created.code).toBe('512');
    expect(created.type).toBe('ASSET');
    expect(created.isActive).toBe(true);

    const accounts = await withTenant(organization.id, (tx) => listAccounts(tx, organization.id));
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.name).toBe('Banque');
  });

  it('rejects duplicate account codes within the same organization', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Dup Org' } });

    await withTenant(organization.id, (tx) =>
      createAccount(tx, organization.id, { code: '606', name: 'Achats', type: 'EXPENSE' })
    );

    await expect(
      withTenant(organization.id, (tx) =>
        createAccount(tx, organization.id, { code: '606', name: 'Autre achat', type: 'EXPENSE' })
      )
    ).rejects.toMatchObject({ status: 409, title: 'ACCOUNT_CODE_ALREADY_EXISTS' });
  });

  it('enforces type compatibility on update', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Compat Org' } });

    const account = await withTenant(organization.id, (tx) =>
      createAccount(tx, organization.id, { code: '701', name: 'Ventes', type: 'REVENUE' })
    );

    await expect(
      withTenant(organization.id, (tx) =>
        updateAccount(tx, organization.id, account.id, { type: 'ASSET' })
      )
    ).rejects.toMatchObject({ status: 400, title: 'ACCOUNT_TYPE_INCOMPATIBLE' });

    const updated = await withTenant(organization.id, (tx) =>
      updateAccount(tx, organization.id, account.id, { name: 'Ventes services', isActive: false })
    );

    expect(updated.name).toBe('Ventes services');
    expect(updated.isActive).toBe(false);
  });

  it('imports the default chart without duplicating existing accounts', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Import Org' } });

    const firstImport = await withTenant(organization.id, (tx) =>
      importDefaultAccounts(tx, organization.id)
    );
    expect(firstImport.imported).toBeGreaterThan(0);

    const secondImport = await withTenant(organization.id, (tx) =>
      importDefaultAccounts(tx, organization.id)
    );
    expect(secondImport.imported).toBe(0);

    const accounts = await withTenant(organization.id, (tx) => listAccounts(tx, organization.id));
    expect(accounts.length).toBeGreaterThan(0);
  });
});

async function withTenant<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organizationId);
    return fn(tx);
  });
}
