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

    const watermarkedResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/balance`)
      .query({ fiscalYearId: fixtures.fiscalYear.id, format: 'pdf', watermark: 'copy' })
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(binaryParser);

    expect(watermarkedResponse.statusCode).toBe(200);
    const watermarkedPdf = watermarkedResponse.body as Buffer;
    expect(watermarkedPdf.toString('latin1')).toContain('Copy');
  });

  it('returns the journal with entry lines and exports CSV/PDF', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedReportFixtures(organizationId, { lockFiscalYear: true });

    const response = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/journal`)
      .query({ fiscalYearId: fixtures.fiscalYear.id })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(200);
    const journal = response.body.data as JournalResponse;
    expect(journal.entries).toHaveLength(4);
    expect(journal.entries[0].lines).toHaveLength(2);

    const csvResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/journal`)
      .query({ fiscalYearId: fixtures.fiscalYear.id, format: 'csv' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(csvResponse.statusCode).toBe(200);
    expect(csvResponse.text).toContain('Date;Journal;Reference;Memo;Account Code;Account Name;Debit;Credit');
    expect(csvResponse.text).toContain('2025-01-10;BAN - Banque;E2025-0001;Cotisations Janvier;512000;Banque;500.00;0.00');

    const pdfResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/journal`)
      .query({ fiscalYearId: fixtures.fiscalYear.id, format: 'pdf' })
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(binaryParser);

    expect(pdfResponse.statusCode).toBe(200);
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

    const audit = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.auditLog.findMany({ where: { entity: 'fiscal_year', entityId: fixtures.fiscalYear.id } });
    });
    expect(audit.some((a) => a.action === 'FEC_EXPORTED')).toBe(true);
  });

  it('generates a balance sheet report in JSON and CSV', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedReportFixtures(organizationId, { lockFiscalYear: false });

    const jsonResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/balance-sheet`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ fiscalYearId: fixtures.fiscalYear.id, format: 'json' });
    expect(jsonResponse.statusCode).toBe(200);
    expect(jsonResponse.body.data.fiscalYear.id).toBe(fixtures.fiscalYear.id);

    const csvResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/balance-sheet`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ fiscalYearId: fixtures.fiscalYear.id, format: 'csv' });
    expect(csvResponse.statusCode).toBe(200);
    expect(csvResponse.text).toContain('Section;Account Code;Account Name;Balance');
  });

  it('rejects FEC export if any entry is unbalanced (precheck)', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedReportFixtures(organizationId, { lockFiscalYear: false });

    // Create an entry then tamper a line to break the balance
    const creation = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-07-01',
        lines: [
          { accountId: fixtures.bankAccount.id, debit: '10.00' },
          { accountId: fixtures.revenueAccount.id, credit: '10.00' },
        ],
      });
    expect(creation.statusCode).toBe(201);

    await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      const line = await tx.entryLine.findFirstOrThrow({ where: { entryId: creation.body.data.id, credit: new Prisma.Decimal('10.00') } });
      await tx.entryLine.update({ where: { id: line.id }, data: { credit: new Prisma.Decimal('9.99') } });
    });

    // Lock FY and try to export
    await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      await tx.fiscalYear.update({ where: { id: fixtures.fiscalYear.id }, data: { lockedAt: new Date() } });
    });

    const fecResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/reports/fec`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ fiscalYearId: fixtures.fiscalYear.id });
    expect(fecResponse.statusCode).toBe(422);
    expect(fecResponse.body.title).toBe('FEC_PRECHECK_FAILED');
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

  it('returns the fiscal dashboard with current year and journal sequences', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedReportFixtures(organizationId, { lockFiscalYear: false });

    const response = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/accounting/dashboard`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(200);
    const dashboard = response.body.data as FiscalDashboardApiResponse;
    expect(dashboard.fiscalYears).toHaveLength(1);
    expect(dashboard.currentFiscalYear?.id).toBe(fixtures.fiscalYear.id);
    expect(dashboard.journals).toHaveLength(1);
    expect(dashboard.journals[0].code).toBe(fixtures.journal.code);
    expect(dashboard.journals[0].lastReference).toBe('E2025-0004');
    expect(dashboard.journals[0].nextReference).toBe('E2025-0005');
  });
});

interface JournalResponse {
  entries: Array<{ lines: Array<{ debit: number; credit: number }>; reference: string | null }>;
}

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

interface FiscalDashboardApiResponse {
  fiscalYears: Array<{ id: string }>;
  currentFiscalYear: { id: string } | null;
  journals: Array<{ code: string; lastReference: string | null; nextReference: string | null }>;
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
    isSuperAdmin: false,
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
            create: lines.map((line, position) => ({
              organizationId,
              accountId: line.accountId,
              debit: new Prisma.Decimal(line.debit ?? '0'),
              credit: new Prisma.Decimal(line.credit ?? '0'),
              position,
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
