import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import type { Response as SuperAgentResponse } from 'superagent';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import buildServer from '../server';
import {
  applyTenantContext,
  createPrismaClient,
  resetDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from './helpers/database';

const TEST_ACCESS_SECRET = 'test-access-secret-change-me-12345678901234567890';
const TEST_REFRESH_SECRET = 'test-refresh-secret-change-me-12345678901234567890';

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

describe('accounting reports HTTP routes', () => {
  it('returns the trial balance with totals and exports CSV/PDF', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedReportFixtures(organizationId, { lockFiscalYear: true });

    const response = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/balance`)
      .query({ fiscalYearId: fixtures.fiscalYear.id })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(200);
    const report = response.body.data as TrialBalanceResponse;
    expect(report.lines).toHaveLength(3);

    const bankLine = report.lines.find((line) => line.code === fixtures.bankAccount.code);
    const revenueLine = report.lines.find((line) => line.code === fixtures.revenueAccount.code);
    const expenseLine = report.lines.find((line) => line.code === fixtures.expenseAccount.code);

    expect(bankLine?.debit).toBeCloseTo(700);
    expect(bankLine?.credit).toBeCloseTo(170);
    expect(revenueLine?.credit).toBeCloseTo(700);
    expect(expenseLine?.debit).toBeCloseTo(170);
    expect(report.totals.debit).toBeCloseTo(870);
    expect(report.totals.credit).toBeCloseTo(870);

    const csvResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/balance`)
      .query({ fiscalYearId: fixtures.fiscalYear.id, format: 'csv' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(csvResponse.statusCode).toBe(200);
    expect(csvResponse.headers['content-type']).toContain('text/csv');
    expect(csvResponse.text).toContain('Account Code;Account Name;Debit;Credit;Balance');
    expect(csvResponse.text).toContain(
      `${fixtures.bankAccount.code};${fixtures.bankAccount.name};700.00;170.00;530.00`
    );

    const pdfResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/balance`)
      .query({ fiscalYearId: fixtures.fiscalYear.id, format: 'pdf' })
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(binaryParser);

    expect(pdfResponse.statusCode).toBe(200);
    expect(pdfResponse.headers['content-type']).toBe('application/pdf');
    const pdfBuffer = pdfResponse.body as Buffer;
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('returns the general ledger with running balances and exports CSV', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedReportFixtures(organizationId, { lockFiscalYear: true });

    const response = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/ledger`)
      .query({ fiscalYearId: fixtures.fiscalYear.id })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(200);
    const ledger = response.body.data as LedgerResponse;
    expect(ledger.accounts).toHaveLength(3);

    const bankAccount = ledger.accounts.find((account) => account.code === fixtures.bankAccount.code);
    expect(bankAccount?.movements).toHaveLength(4);
    expect(bankAccount?.movements[0].debit).toBeCloseTo(500);
    expect(bankAccount?.movements[1].credit).toBeCloseTo(120);
    expect(bankAccount?.movements[3].balance).toBeCloseTo(530);

    const csvResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/ledger`)
      .query({ fiscalYearId: fixtures.fiscalYear.id, format: 'csv' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(csvResponse.statusCode).toBe(200);
    expect(csvResponse.headers['content-type']).toContain('text/csv');
    expect(csvResponse.text).toContain('Account Code;Account Name;Date;Journal;Reference;Memo;Debit;Credit;Balance');
    expect(csvResponse.text).toContain('706000;Cotisations;2025-01-10;BAN - Banque;E2025-0001;Cotisations Janvier;0.00;500.00;-500.00');
  });

  it('returns the income statement with net result and exports PDF', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedReportFixtures(organizationId, { lockFiscalYear: true });

    const response = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/income`)
      .query({ fiscalYearId: fixtures.fiscalYear.id })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(200);
    const income = response.body.data as IncomeStatementResponse;
    expect(income.rows).toHaveLength(2);

    const revenueRow = income.rows.find((row) => row.type === 'REVENUE');
    const expenseRow = income.rows.find((row) => row.type === 'EXPENSE');

    expect(revenueRow?.result).toBeCloseTo(700);
    expect(expenseRow?.result).toBeCloseTo(170);
    expect(income.totals.net).toBeCloseTo(530);

    const pdfResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/income`)
      .query({ fiscalYearId: fixtures.fiscalYear.id, format: 'pdf' })
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(binaryParser);

    expect(pdfResponse.statusCode).toBe(200);
    expect(pdfResponse.headers['content-type']).toBe('application/pdf');
    const pdfBuffer = pdfResponse.body as Buffer;
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('generates a compliant FEC export with checksum stored in the database', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedReportFixtures(organizationId, { lockFiscalYear: true });

    const response = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/fec`)
      .query({ fiscalYearId: fixtures.fiscalYear.id })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');

    const lines = response.text.trim().split('\n');
    expect(lines[0]).toBe(
      'JournalCode;JournalLib;EcritureNum;EcritureDate;CompteNum;CompteLib;CompAuxNum;CompAuxLib;PieceRef;PieceDate;EcritureLib;Debit;Credit;EcritureLet;DateLet;ValidDate;Montantdevise;Idevise'
    );
    expect(lines).toHaveLength(9);

    const firstRow = lines[1].split(';');
    expect(firstRow[0]).toBe('BAN');
    expect(firstRow[1]).toBe('Banque');
    expect(firstRow[2]).toBe('E2025-0001');
    expect(firstRow[3]).toBe('20250110');
    expect(firstRow[4]).toBe('512000');
    expect(firstRow[5]).toBe('Banque');
    expect(firstRow[10]).toBe('Cotisations Janvier');
    expect(firstRow[11]).toBe('500.00');
    expect(firstRow[12]).toBe('0.00');

    const checksum = createHash('sha256').update(response.text, 'utf8').digest('hex');
    expect(response.headers['x-report-checksum']).toBe(checksum);

    const fecExports = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.fecExport.findMany({ where: { fiscalYearId: fixtures.fiscalYear.id } });
    });

    expect(fecExports).toHaveLength(1);
    expect(fecExports[0].checksum).toBe(checksum);
  });

  it('rejects FEC export when the fiscal year is not locked', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedReportFixtures(organizationId, { lockFiscalYear: false });

    const response = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/fec`)
      .query({ fiscalYearId: fixtures.fiscalYear.id })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(403);
    expect(response.body.title).toBe('FISCAL_YEAR_NOT_LOCKED');
  });
});

interface TrialBalanceResponse {
  lines: Array<{
    code: string;
    debit: number;
    credit: number;
    balance: number;
  }>;
  totals: {
    debit: number;
    credit: number;
    balance: number;
  };
}

interface LedgerResponse {
  accounts: Array<{
    code: string;
    movements: Array<{
      debit: number;
      credit: number;
      balance: number;
    }>;
  }>;
}

interface IncomeStatementResponse {
  rows: Array<{
    type: 'REVENUE' | 'EXPENSE';
    result: number;
  }>;
  totals: {
    revenue: number;
    expense: number;
    net: number;
  };
}

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

  return { organizationId: organization.id, accessToken };
}

interface ReportFixtureOptions {
  lockFiscalYear?: boolean;
}

async function seedReportFixtures(organizationId: string, options: ReportFixtureOptions = {}) {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organizationId);

    const fiscalYear = await tx.fiscalYear.create({
      data: {
        organizationId,
        label: 'FY2025',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        lockedAt: options.lockFiscalYear ? new Date('2025-12-31T23:59:59Z') : null,
      },
    });

    const journal = await tx.journal.create({
      data: {
        organizationId,
        code: 'BAN',
        name: 'Banque',
        type: 'BANK',
      },
    });

    const bankAccount = await tx.account.create({
      data: {
        organizationId,
        code: '512000',
        name: 'Banque',
        type: 'ASSET',
      },
    });

    const revenueAccount = await tx.account.create({
      data: {
        organizationId,
        code: '706000',
        name: 'Cotisations',
        type: 'REVENUE',
      },
    });

    const expenseAccount = await tx.account.create({
      data: {
        organizationId,
        code: '606000',
        name: 'Fournitures',
        type: 'EXPENSE',
      },
    });

    const createEntry = (
      date: string,
      reference: string,
      memo: string,
      lines: Array<{ accountId: string; debit?: string; credit?: string }>
    ) =>
      tx.entry.create({
        data: {
          organizationId,
          fiscalYearId: fiscalYear.id,
          journalId: journal.id,
          date: new Date(date),
          reference,
          memo,
          lines: {
            create: lines.map((line) => ({
              organizationId,
              accountId: line.accountId,
              debit: new Prisma.Decimal(line.debit ?? '0'),
              credit: new Prisma.Decimal(line.credit ?? '0'),
            })),
          },
        },
      });

    await createEntry('2025-01-10', 'E2025-0001', 'Cotisations Janvier', [
      { accountId: bankAccount.id, debit: '500.00' },
      { accountId: revenueAccount.id, credit: '500.00' },
    ]);

    await createEntry('2025-02-05', 'E2025-0002', 'Achat fournitures', [
      { accountId: expenseAccount.id, debit: '120.00' },
      { accountId: bankAccount.id, credit: '120.00' },
    ]);

    await createEntry('2025-03-15', 'E2025-0003', 'Cotisations Mars', [
      { accountId: bankAccount.id, debit: '200.00' },
      { accountId: revenueAccount.id, credit: '200.00' },
    ]);

    await createEntry('2025-04-20', 'E2025-0004', 'Achat papeterie', [
      { accountId: expenseAccount.id, debit: '50.00' },
      { accountId: bankAccount.id, credit: '50.00' },
    ]);

    return { fiscalYear, journal, bankAccount, revenueAccount, expenseAccount };
  });
}

function binaryParser(
  res: SuperAgentResponse,
  callback: (err: Error | null, data: Buffer) => void
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (error) => callback(error as Error, Buffer.alloc(0)));
}
