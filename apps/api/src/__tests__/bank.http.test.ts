import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole } from '@prisma/client';
import buildServer from '../server';
import {
  setupTestDatabase,
  teardownTestDatabase,
  resetDatabase,
  createPrismaClient,
  applyTenantContext,
} from './helpers/database';

const TEST_ACCESS_SECRET = 'test-access-secret-change-me-12345678901234567890';
const TEST_REFRESH_SECRET = 'test-refresh-secret-change-me-12345678901234567890';
const VALID_IBAN = 'DE89370400440532013000';

let app: FastifyInstance;
let prisma: PrismaClient;

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_REFRESH_SECRET;
  process.env.REFRESH_TOKEN_TTL_DAYS = '30';
  process.env.NODE_ENV = 'test';

  await setupTestDatabase();

  prisma = createPrismaClient();
  await prisma.$connect();

  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await teardownTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('bank routes', () => {
  it('manages bank accounts with validations', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);

    const ledgerAccount = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.account.create({
        data: {
          organizationId,
          code: '512100',
          name: 'Banque principale',
          type: 'ASSET',
        },
      });
    });

    const createResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/accounts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        accountId: ledgerAccount.id,
        name: 'Compte courant',
        iban: 'de89 3704 0044 0532 0130 00',
        bic: 'deutdeff',
      });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.body.data.name).toBe('Compte courant');
    expect(createResponse.body.data.iban).toBe(VALID_IBAN);
    expect(createResponse.body.data.bic).toBe('DEUTDEFF');

    const listResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/bank/accounts`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);

    const accountId = createResponse.body.data.id as string;

    const getResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/bank/accounts/${accountId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.body.data.iban).toBe(VALID_IBAN);

    const updateResponse = await request(app.server)
      .patch(`/api/v1/orgs/${organizationId}/bank/accounts/${accountId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Compte Banque',
        bic: 'DEUTDEFF500',
      });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body.data.name).toBe('Compte Banque');
    expect(updateResponse.body.data.bic).toBe('DEUTDEFF500');

    const deleteResponse = await request(app.server)
      .delete(`/api/v1/orgs/${organizationId}/bank/accounts/${accountId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteResponse.statusCode).toBe(204);

    const afterDelete = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/bank/accounts`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(afterDelete.statusCode).toBe(200);
    expect(afterDelete.body.data).toHaveLength(0);
  });

  it('records bank statements and links entries', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedBankingFixtures(organizationId);

    const bankAccountResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/accounts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        accountId: fixtures.bankLedgerAccount.id,
        name: 'Compte Banque',
        iban: VALID_IBAN,
        bic: 'AGRIFRPP',
      });

    const bankAccountId = bankAccountResponse.body.data.id as string;

    const depositResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-01-15',
        memo: 'Cotisations',
        lines: [
          { accountId: fixtures.bankLedgerAccount.id, debit: '200.00' },
          { accountId: fixtures.revenueAccount.id, credit: '200.00' },
        ],
      });

    const withdrawalResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-01-20',
        memo: 'Frais bancaires',
        lines: [
          { accountId: fixtures.expenseAccount.id, debit: '70.00' },
          { accountId: fixtures.bankLedgerAccount.id, credit: '70.00' },
        ],
      });

    const entryIds = [depositResponse.body.data.id as string, withdrawalResponse.body.data.id as string];

    const statementResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/statements`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        bankAccountId,
        statementDate: '2025-01-31',
        openingBalance: '1000.00',
        closingBalance: '1130.00',
        entryIds,
      });

    expect(statementResponse.statusCode).toBe(201);
    expect(statementResponse.body.data.openingBalance).toBe('1000.00');
    expect(statementResponse.body.data.closingBalance).toBe('1130.00');
    expect(statementResponse.body.data.entries).toHaveLength(2);

    const statementId = statementResponse.body.data.id as string;

    const entries = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.entry.findMany({
        where: { id: { in: entryIds } },
        select: { id: true, bankStatementId: true },
        orderBy: { date: 'asc' },
      });
    });

    expect(entries.every((entry) => entry.bankStatementId === statementId)).toBe(true);
  });

  it('rejects incoherent bank statement balances', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedBankingFixtures(organizationId);

    const bankAccountResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/accounts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        accountId: fixtures.bankLedgerAccount.id,
        name: 'Compte Banque',
        iban: VALID_IBAN,
        bic: 'AGRIFRPP',
      });

    const bankAccountId = bankAccountResponse.body.data.id as string;

    const depositResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-02-05',
        lines: [
          { accountId: fixtures.bankLedgerAccount.id, debit: '50.00' },
          { accountId: fixtures.revenueAccount.id, credit: '50.00' },
        ],
      });

    const entryId = depositResponse.body.data.id as string;

    const statementResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/statements`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        bankAccountId,
        statementDate: '2025-02-28',
        openingBalance: '1000.00',
        closingBalance: '1200.00',
        entryIds: [entryId],
      });

    expect(statementResponse.statusCode).toBe(422);
    expect(statementResponse.body.title).toBe('BANK_STATEMENT_BALANCE_MISMATCH');

    const entry = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.entry.findUnique({
        where: { id: entryId },
        select: { bankStatementId: true },
      });
    });

    expect(entry?.bankStatementId).toBeNull();
  });
});

async function createUserWithRole(role: UserRole) {
  const organization = await prisma.organization.create({ data: { name: `Org ${Date.now()}` } });
  const user = await prisma.user.create({
    data: {
      email: `user+${Math.random().toString(16).slice(2)}@example.org`,
      passwordHash: 'test-hash',
    },
  });

  await prisma.userOrgRole.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      role,
    },
  });

  const accessToken = app.issueAccessToken({
    userId: user.id,
    organizationId: organization.id,
    roles: [role],
  });

  return { organizationId: organization.id, accessToken, userId: user.id };
}

async function seedBankingFixtures(organizationId: string) {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organizationId);

    const fiscalYear = await tx.fiscalYear.create({
      data: {
        organizationId,
        label: 'FY2025',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      },
    });

    const journal = await tx.journal.create({
      data: {
        organizationId,
        code: 'BAN',
        name: 'Journal Banque',
        type: 'BANK',
      },
    });

    const bankLedgerAccount = await tx.account.create({
      data: {
        organizationId,
        code: '512200',
        name: 'Banque Courante',
        type: 'ASSET',
      },
    });

    const revenueAccount = await tx.account.create({
      data: {
        organizationId,
        code: '706100',
        name: 'Cotisations',
        type: 'REVENUE',
      },
    });

    const expenseAccount = await tx.account.create({
      data: {
        organizationId,
        code: '627100',
        name: 'Frais bancaires',
        type: 'EXPENSE',
      },
    });

    return { fiscalYear, journal, bankLedgerAccount, revenueAccount, expenseAccount };
  });
}
