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

  it('imports OFX transactions with deduplication and normalization', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedBankingFixtures(organizationId);

    const bankAccountResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/accounts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        accountId: fixtures.bankLedgerAccount.id,
        name: 'Compte OFX',
        iban: VALID_IBAN,
        bic: 'AGRIFRPP',
      });

    const bankAccountId = bankAccountResponse.body.data.id as string;

    // Create a rule via API instead of direct DB insert
    const ruleResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/ofx-rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ normalizedLabel: 'Cotisation annuelle', pattern: 'ADH[ÉE]SION', priority: 10 });
    expect(ruleResponse.statusCode).toBe(201);

    await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      await tx.bankTransaction.create({
        data: {
          organizationId,
          bankAccountId,
          fitId: 'FIT-002',
          valueDate: new Date('2025-01-10T00:00:00.000Z'),
          amount: '-70.00',
          rawLabel: 'Frais bancaires',
          normalizedLabel: 'Frais bancaires',
          memo: 'Commission bancaire',
        },
      });
    });

    const ofxPayload = `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n<OFX>\n  <BANKMSGSRSV1>\n    <STMTTRNRS>\n      <STMTRS>\n        <BANKTRANLIST>\n          <DTSTART>20250101000000\n          <DTEND>20250131000000\n          <STMTTRN>\n            <TRNTYPE>CREDIT\n            <DTPOSTED>20250105120000\n            <TRNAMT>200.00\n            <FITID>FIT-001\n            <NAME>Adhésion annuelle\n            <MEMO>Adhésion 2025\n          </STMTTRN>\n          <STMTTRN>\n            <TRNTYPE>DEBIT\n            <DTPOSTED>20250110120000\n            <TRNAMT>-70.00\n            <FITID>FIT-002\n            <NAME>Frais bancaires\n            <MEMO>Commission bancaire\n          </STMTTRN>\n          <STMTTRN>\n            <TRNTYPE>CREDIT\n            <DTPOSTED>20250105120000\n            <TRNAMT>200.00\n            <FITID>FIT-001\n            <NAME>Adhésion annuelle duplicate\n          </STMTTRN>\n        </BANKTRANLIST>\n      </STMTRS>\n    </STMTTRNRS>\n  </BANKMSGSRSV1>\n</OFX>\n`;

    const importResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/import-ofx`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ bankAccountId, ofx: ofxPayload });

    expect(importResponse.statusCode).toBe(201);
    expect(importResponse.body.data.imported).toBe(1);
    expect(importResponse.body.data.duplicates).toBe(2);
    expect(importResponse.body.data.transactions).toHaveLength(1);
    expect(importResponse.body.data.transactions[0].rawLabel).toBe('Adhésion annuelle');
    expect(importResponse.body.data.transactions[0].normalizedLabel).toBe('Cotisation annuelle');

    const transactions = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.bankTransaction.findMany({
        where: { bankAccountId },
        orderBy: { valueDate: 'asc' },
      });
    });

    expect(transactions).toHaveLength(2);
    expect(transactions.some((txn) => txn.fitId === 'FIT-001')).toBe(true);
    expect(transactions.some((txn) => txn.fitId === 'FIT-002')).toBe(true);
  });

  it('manages OFX rules (list/create/update/delete)', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedBankingFixtures(organizationId);

    const bankAccountResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/accounts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        accountId: fixtures.bankLedgerAccount.id,
        name: 'Compte primaire',
        iban: VALID_IBAN,
        bic: 'AGRIFRPP',
      });
    expect(bankAccountResponse.statusCode).toBe(201);
    const bankAccountId = bankAccountResponse.body.data.id as string;

    // Create with bankAccountId
    const createResp = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/ofx-rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ bankAccountId, pattern: 'COTIS', normalizedLabel: 'Cotisation', priority: 5, isActive: true });
    expect(createResp.statusCode).toBe(201);
    const ruleId = createResp.body.data.id as string;

    const auditsAfterCreate = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.auditLog.findMany({ where: { entity: 'ofx_rule', entityId: ruleId } });
    });
    expect(auditsAfterCreate.some((a) => a.action === 'OFX_RULE_CREATED')).toBe(true);

    // List filtered by active
    const listActive = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/bank/ofx-rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ active: true });
    expect(listActive.statusCode).toBe(200);
    expect(listActive.body.data.some((r: { id: string }) => r.id === ruleId)).toBe(true);

    // Update
    const updateResp = await request(app.server)
      .patch(`/api/v1/orgs/${organizationId}/bank/ofx-rules/${ruleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: false, priority: 1 });
    expect(updateResp.statusCode).toBe(200);
    expect(updateResp.body.data.isActive).toBe(false);
    expect(updateResp.body.data.priority).toBe(1);

    // Delete
    const deleteResp = await request(app.server)
      .delete(`/api/v1/orgs/${organizationId}/bank/ofx-rules/${ruleId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(deleteResp.statusCode).toBe(204);

    const listAfterDelete = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/bank/ofx-rules`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ bankAccountId: fixtures.bankLedgerAccount.id });
    expect(listAfterDelete.statusCode).toBe(200);
    expect(listAfterDelete.body.data.some((r: { id: string }) => r.id === ruleId)).toBe(false);
  });

  it('suggests reconciliation candidates with exact and fuzzy rules', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedBankingFixtures(organizationId);

    const bankAccountResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/accounts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        accountId: fixtures.bankLedgerAccount.id,
        name: 'Compte Reco',
        iban: VALID_IBAN,
        bic: 'AGRIFRPP',
      });

    const bankAccountId = bankAccountResponse.body.data.id as string;

    const exactEntryResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-01-09',
        memo: 'Cotisation annuelle Janvier',
        lines: [
          { accountId: fixtures.bankLedgerAccount.id, debit: '200.00' },
          { accountId: fixtures.revenueAccount.id, credit: '200.00' },
        ],
      });

    const fuzzyEntryResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-01-10',
        memo: 'Cotisation annuelle règlement',
        lines: [
          { accountId: fixtures.bankLedgerAccount.id, debit: '199.99' },
          { accountId: fixtures.revenueAccount.id, credit: '199.99' },
        ],
      });

    const transaction = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.bankTransaction.create({
        data: {
          organizationId,
          bankAccountId,
          fitId: 'RECO-001',
          valueDate: new Date('2025-01-08T00:00:00.000Z'),
          amount: '200.00',
          rawLabel: 'Cotisation annuelle',
          normalizedLabel: 'Cotisation annuelle',
        },
      });
    });

    const reconcileResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/reconcile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ transactionId: transaction.id });

    expect(reconcileResponse.statusCode).toBe(200);
    expect(reconcileResponse.body.data.transactionId).toBe(transaction.id);
    expect(reconcileResponse.body.data.suggestions.length).toBeGreaterThanOrEqual(2);

    const [firstSuggestion, secondSuggestion] = reconcileResponse.body.data.suggestions as Array<{
      entryId: string;
      matchType: string;
      similarity?: number;
    }>;

    expect(firstSuggestion.entryId).toBe(exactEntryResponse.body.data.id);
    expect(firstSuggestion.matchType).toBe('EXACT');
    expect(secondSuggestion.entryId).toBe(fuzzyEntryResponse.body.data.id);
    expect(secondSuggestion.matchType).toBe('FUZZY');
    expect(secondSuggestion.similarity).toBeGreaterThanOrEqual(0.7);
  });

  it('confirms reconciliation and flags bank ledger line', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedBankingFixtures(organizationId);

    const bankAccountResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/accounts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        accountId: fixtures.bankLedgerAccount.id,
        name: 'Compte Reco Confirm',
        iban: VALID_IBAN,
        bic: 'AGRIFRPP',
      });
    const bankAccountId = bankAccountResponse.body.data.id as string;

    const entryResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-01-12',
        memo: 'Encaissement cotisation',
        lines: [
          { accountId: fixtures.bankLedgerAccount.id, debit: '150.00' },
          { accountId: fixtures.revenueAccount.id, credit: '150.00' },
        ],
      });
    expect(entryResponse.statusCode).toBe(201);
    const entryId = entryResponse.body.data.id as string;

    const transaction = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.bankTransaction.create({
        data: {
          organizationId,
          bankAccountId,
          fitId: 'CONF-001',
          valueDate: new Date('2025-01-12T00:00:00.000Z'),
          amount: '150.00',
          rawLabel: 'Cotisation',
          normalizedLabel: 'Cotisation',
        },
      });
    });

    const confirmResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/bank/reconcile/confirm`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ transactionId: transaction.id, entryId });
    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.body.data.transactionId).toBe(transaction.id);
    expect(confirmResponse.body.data.entryId).toBe(entryId);

    const [updatedTxn, bankLine] = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      const t = await tx.bankTransaction.findUnique({ where: { id: transaction.id } });
      const l = await tx.entryLine.findFirst({ where: { entryId, accountId: fixtures.bankLedgerAccount.id } });
      return [t, l];
    });
    expect(updatedTxn?.matchedEntryId).toBe(entryId);
    expect(bankLine?.reconciledAt).toBeTruthy();

    const audit = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.auditLog.findMany({ where: { entity: 'bank_transaction', entityId: transaction.id } });
    });
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(audit[0].action).toBe('BANK_RECONCILIATION_CONFIRMED');
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
    isSuperAdmin: false,
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
