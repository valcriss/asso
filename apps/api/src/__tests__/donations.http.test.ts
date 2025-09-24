import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import buildServer from '../server';
import {
  applyTenantContext,
  createPrismaClient,
  resetDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from './helpers/database';
import type { ObjectStorage } from '../plugins/object-storage';

const TEST_ACCESS_SECRET = 'test-access-secret-change-me-12345678901234567890';
const TEST_REFRESH_SECRET = 'test-refresh-secret-change-me-12345678901234567890';

interface StoredObject {
  key: string;
  body: Buffer;
  contentType: string;
  versionId: string;
}

let app: FastifyInstance;
let prisma: PrismaClient;
let storedObjects: StoredObject[];

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_REFRESH_SECRET;
  process.env.REFRESH_TOKEN_TTL_DAYS = '30';
  process.env.NODE_ENV = 'test';
  process.env.S3_ACCESS_KEY_ID = 'test-access';
  process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
  process.env.S3_BUCKET = 'test-bucket';
  process.env.S3_REGION = 'eu-west-1';
  process.env.S3_ENDPOINT = 'http://localhost:9000';
  process.env.S3_PUBLIC_URL = 'https://cdn.example.org/storage';

  await setupTestDatabase();

  prisma = createPrismaClient();
  await prisma.$connect();

  app = await buildServer();
  await app.ready();

  storedObjects = [];
  const stubStorage: ObjectStorage = {
    async putObject({ key, body, contentType }) {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
      const versionId = `v${storedObjects.length + 1}`;
      storedObjects.push({ key, body: buffer, contentType, versionId });
      return { key, url: `https://cdn.example.org/storage/${key}`, versionId };
    },
    getPublicUrl(key: string) {
      return `https://cdn.example.org/storage/${key}`;
    },
  };

  app.objectStorage = stubStorage;
  app.addHook('onRequest', (request, _reply, done) => {
    request.objectStorage = app.objectStorage;
    done();
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await teardownTestDatabase();
});

beforeEach(async () => {
  storedObjects = [];
  await resetDatabase();
});

describe('donations HTTP routes', () => {
  it('issues sequential receipts per fiscal year and stores compliant PDFs', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedDonationFixtures(organizationId);

    const entry2025A = await createBalancedEntry(organizationId, {
      fiscalYearId: fixtures.fiscalYear2025.id,
      journalId: fixtures.journal.id,
      debitAccountId: fixtures.debitAccount.id,
      creditAccountId: fixtures.creditAccount.id,
      amount: '150.00',
      date: '2025-03-10',
      reference: 'DON-ENTRY-2025-A',
    });

    const firstResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/donations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        entryId: entry2025A.id,
        amount: '150.00',
        receivedAt: '2025-03-10',
        donor: { name: 'Alice Martin', email: 'alice@example.org' },
      });

    expect(firstResponse.statusCode).toBe(201);
    expect(firstResponse.body.data.receiptNumber).toBe('2025-DON-000001');
    expect(firstResponse.body.data.receiptUrl).toMatch(
      /^https:\/\/cdn\.example\.org\/storage\/donations\//
    );
    expect(storedObjects).toHaveLength(1);
    expect(storedObjects[0].contentType).toBe('application/pdf');
    expect(storedObjects[0].body.subarray(0, 4).toString()).toBe('%PDF');

    const expectedHash = createHash('sha256').update(storedObjects[0].body).digest('hex');
    expect(firstResponse.body.data.receiptHash).toBe(expectedHash);

    const pdfText = storedObjects[0].body.toString('latin1');
    expect(pdfText).toContain('Reçu fiscal de don');
    expect(pdfText).toContain('Alice Martin');
    expect(pdfText).toContain('150,00');

    const entry2025B = await createBalancedEntry(organizationId, {
      fiscalYearId: fixtures.fiscalYear2025.id,
      journalId: fixtures.journal.id,
      debitAccountId: fixtures.debitAccount.id,
      creditAccountId: fixtures.creditAccount.id,
      amount: '90.00',
      date: '2025-05-20',
      reference: 'DON-ENTRY-2025-B',
    });

    const secondResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/donations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        entryId: entry2025B.id,
        amount: '90.00',
        receivedAt: '2025-05-20',
        donor: { name: 'Bob Leroy' },
      });

    expect(secondResponse.statusCode).toBe(201);
    expect(secondResponse.body.data.receiptNumber).toBe('2025-DON-000002');

    const entry2026 = await createBalancedEntry(organizationId, {
      fiscalYearId: fixtures.fiscalYear2026.id,
      journalId: fixtures.journal.id,
      debitAccountId: fixtures.debitAccount.id,
      creditAccountId: fixtures.creditAccount.id,
      amount: '120.00',
      date: '2026-02-12',
      reference: 'DON-ENTRY-2026-A',
    });

    const thirdResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/donations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        entryId: entry2026.id,
        amount: '120.00',
        receivedAt: '2026-02-12',
        donor: { name: 'Carla Dupont' },
      });

    expect(thirdResponse.statusCode).toBe(201);
    expect(thirdResponse.body.data.receiptNumber).toBe('2026-DON-000001');
    expect(storedObjects).toHaveLength(3);
  });

  it('lists donations with pagination metadata', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedDonationFixtures(organizationId);

    const entryA = await createBalancedEntry(organizationId, {
      fiscalYearId: fixtures.fiscalYear2025.id,
      journalId: fixtures.journal.id,
      debitAccountId: fixtures.debitAccount.id,
      creditAccountId: fixtures.creditAccount.id,
      amount: '60.00',
      date: '2025-01-15',
      reference: 'DON-LIST-A',
    });
    const entryB = await createBalancedEntry(organizationId, {
      fiscalYearId: fixtures.fiscalYear2025.id,
      journalId: fixtures.journal.id,
      debitAccountId: fixtures.debitAccount.id,
      creditAccountId: fixtures.creditAccount.id,
      amount: '80.00',
      date: '2025-02-20',
      reference: 'DON-LIST-B',
    });
    const entryC = await createBalancedEntry(organizationId, {
      fiscalYearId: fixtures.fiscalYear2025.id,
      journalId: fixtures.journal.id,
      debitAccountId: fixtures.debitAccount.id,
      creditAccountId: fixtures.creditAccount.id,
      amount: '40.00',
      date: '2025-03-10',
      reference: 'DON-LIST-C',
    });

    await createDonationViaApi(organizationId, accessToken, entryA.id, '60.00', '2025-01-15', 'Donateur A');
    await createDonationViaApi(organizationId, accessToken, entryB.id, '80.00', '2025-02-20', 'Donateur B');
    await createDonationViaApi(organizationId, accessToken, entryC.id, '40.00', '2025-03-10', 'Donateur C');

    const listResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/donations`)
      .query({ page: 1, limit: 2 })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data).toHaveLength(2);
    expect(listResponse.body.meta).toEqual({ total: 3, page: 1, limit: 2 });
    expect(listResponse.body.data[0].receiptNumber).toBe('2025-DON-000003');
    expect(listResponse.body.data[1].receiptNumber).toBe('2025-DON-000002');
  });

  it('exports annual donations as CSV', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedDonationFixtures(organizationId);

    const entryA = await createBalancedEntry(organizationId, {
      fiscalYearId: fixtures.fiscalYear2025.id,
      journalId: fixtures.journal.id,
      debitAccountId: fixtures.debitAccount.id,
      creditAccountId: fixtures.creditAccount.id,
      amount: '110.00',
      date: '2025-06-01',
      reference: 'DON-CSV-A',
    });
    const entryB = await createBalancedEntry(organizationId, {
      fiscalYearId: fixtures.fiscalYear2025.id,
      journalId: fixtures.journal.id,
      debitAccountId: fixtures.debitAccount.id,
      creditAccountId: fixtures.creditAccount.id,
      amount: '95.00',
      date: '2025-09-12',
      reference: 'DON-CSV-B',
    });

    await createDonationViaApi(organizationId, accessToken, entryA.id, '110.00', '2025-06-01', 'Export Alice');
    await createDonationViaApi(organizationId, accessToken, entryB.id, '95.00', '2025-09-12', 'Export Bob');

    const exportResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/donations/export`)
      .query({ fiscalYearId: fixtures.fiscalYear2025.id })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(exportResponse.headers['content-disposition']).toBe(
      'attachment; filename="donations-FY2025.csv"'
    );
    const csvBody = exportResponse.text;
    expect(csvBody).toContain('Receipt Number;Received At;Issued At;Donor Name');
    expect(csvBody).toContain('2025-DON-000001');
    expect(csvBody).toContain('2025-DON-000002');
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

  return { organizationId: organization.id, accessToken };
}

async function seedDonationFixtures(organizationId: string) {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organizationId);

    const fiscalYear2025 = await tx.fiscalYear.create({
      data: {
        organizationId,
        label: 'FY2025',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      },
    });

    const fiscalYear2026 = await tx.fiscalYear.create({
      data: {
        organizationId,
        label: 'FY2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
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

    const debitAccount = await tx.account.create({
      data: {
        organizationId,
        code: '512000',
        name: 'Banque',
        type: 'ASSET',
      },
    });

    const creditAccount = await tx.account.create({
      data: {
        organizationId,
        code: '756000',
        name: 'Dons manuels',
        type: 'REVENUE',
      },
    });

    return { fiscalYear2025, fiscalYear2026, journal, debitAccount, creditAccount };
  });
}

interface EntryOptions {
  fiscalYearId: string;
  journalId: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  date: string;
  reference: string;
}

async function createBalancedEntry(organizationId: string, options: EntryOptions) {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organizationId);

    return tx.entry.create({
      data: {
        organizationId,
        fiscalYearId: options.fiscalYearId,
        journalId: options.journalId,
        date: new Date(options.date),
        reference: options.reference,
        lines: {
          create: [
            {
              organizationId,
              accountId: options.debitAccountId,
              debit: new Prisma.Decimal(options.amount),
              credit: new Prisma.Decimal(0),
            },
            {
              organizationId,
              accountId: options.creditAccountId,
              debit: new Prisma.Decimal(0),
              credit: new Prisma.Decimal(options.amount),
            },
          ],
        },
      },
    });
  });
}

async function createDonationViaApi(
  organizationId: string,
  accessToken: string,
  entryId: string,
  amount: string,
  receivedAt: string,
  donorName: string
) {
  const response = await request(app.server)
    .post(`/api/v1/orgs/${organizationId}/donations`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      entryId,
      amount,
      receivedAt,
      donor: { name: donorName },
    });

  expect(response.statusCode).toBe(201);
  return response.body.data;
}
