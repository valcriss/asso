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
  createJournal,
  importDefaultJournals,
  listJournals,
  updateJournal,
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

describe('journal services', () => {
  it('creates journals and lists them in order', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Journal Org' } });

    const journal = await withTenant(organization.id, (tx) =>
      createJournal(tx, organization.id, { code: 'BAN', name: 'Journal banque', type: 'BANK' })
    );

    expect(journal.code).toBe('BAN');
    expect(journal.type).toBe('BANK');

    const journals = await withTenant(organization.id, (tx) => listJournals(tx, organization.id));
    expect(journals).toHaveLength(1);
    expect(journals[0]?.code).toBe('BAN');
  });

  it('prevents duplicate journal codes for the same organization', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Journal Dup Org' } });

    await withTenant(organization.id, (tx) =>
      createJournal(tx, organization.id, { code: 'VEN', name: 'Ventes', type: 'SALES' })
    );

    await expect(
      withTenant(organization.id, (tx) =>
        createJournal(tx, organization.id, { code: 'VEN', name: 'Ventes 2', type: 'SALES' })
      )
    ).rejects.toMatchObject({ status: 409, title: 'JOURNAL_CODE_ALREADY_EXISTS' });
  });

  it('validates type compatibility during updates', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Journal Compat Org' } });

    const journal = await withTenant(organization.id, (tx) =>
      createJournal(tx, organization.id, { code: 'ACH', name: 'Achats', type: 'PURCHASE' })
    );

    await expect(
      withTenant(organization.id, (tx) =>
        updateJournal(tx, organization.id, journal.id, { type: 'BANK' })
      )
    ).rejects.toMatchObject({ status: 400, title: 'JOURNAL_TYPE_INCOMPATIBLE' });

    const updated = await withTenant(organization.id, (tx) =>
      updateJournal(tx, organization.id, journal.id, { name: 'Achats fournisseurs' })
    );

    expect(updated.name).toBe('Achats fournisseurs');
  });

  it('imports default journals only once', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Journal Import Org' } });

    const firstImport = await withTenant(organization.id, (tx) =>
      importDefaultJournals(tx, organization.id)
    );
    expect(firstImport.imported).toBeGreaterThan(0);

    const secondImport = await withTenant(organization.id, (tx) =>
      importDefaultJournals(tx, organization.id)
    );
    expect(secondImport.imported).toBe(0);
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
