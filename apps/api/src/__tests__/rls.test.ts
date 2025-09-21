import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  setupTestDatabase,
  teardownTestDatabase,
  resetDatabase,
  createPrismaClient,
  applyTenantContext,
} from './helpers/database';

let prisma: PrismaClient;

beforeAll(async () => {
  await setupTestDatabase();

  prisma = createPrismaClient();

  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();

  await teardownTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
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
