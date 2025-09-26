import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole } from '@prisma/client';
import buildServer from '../server';
import {
  applyTenantContext,
  createPrismaClient,
  resetDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from './helpers/database';
import type { ObjectStorage } from '../plugins/object-storage';
import type { AntivirusScanResult, AntivirusScanner } from '../plugins/antivirus';

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
let nextScanResult: AntivirusScanResult | null;

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
  process.env.CLAMAV_ENABLED = 'false';

  await setupTestDatabase();

  prisma = createPrismaClient();
  await prisma.$connect();

  app = await buildServer();
  await app.ready();

  storedObjects = [];
  nextScanResult = null;

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

  const stubAntivirus: AntivirusScanner = {
    get isEnabled() {
      return Boolean(nextScanResult);
    },
    async scanBuffer(buffer: Buffer) {
      void buffer;
      if (nextScanResult) {
        const result = nextScanResult;
        nextScanResult = null;
        return result;
      }

      return { status: 'clean' };
    },
  };

  app.objectStorage = stubStorage;
  app.antivirus = stubAntivirus;
  app.addHook('onRequest', (request, _reply, done) => {
    request.objectStorage = app.objectStorage;
    request.antivirus = app.antivirus;
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
  nextScanResult = null;
  await resetDatabase();
});

describe('uploads HTTP routes', () => {
  it('stores attachments for entries with SHA-256 and metadata', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const entry = await seedEntry(organizationId);

    const fileBuffer = Buffer.from('%PDF-1.7\nTest document');
    const expectedHash = createHash('sha256').update(fileBuffer).digest('hex');

    const response = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/uploads`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('targetType', 'entry')
      .field('targetId', entry.id)
      .attach('file', fileBuffer, { filename: 'Justificatif facture.pdf', contentType: 'application/pdf' });

    expect(response.statusCode).toBe(201);
    expect(response.body.data.sha256).toBe(expectedHash);
    expect(response.body.data.byteSize).toBe(fileBuffer.length);
    expect(response.body.data.versionId).toBe('v1');
    expect(response.body.data.entryId).toBe(entry.id);
    expect(response.body.data.projectId).toBeNull();

    expect(storedObjects).toHaveLength(1);
    expect(storedObjects[0]?.contentType).toBe('application/pdf');
    expect(storedObjects[0]?.versionId).toBe('v1');
    expect(storedObjects[0]?.key).toContain(`/entries/${entry.id}/`);

    const attachmentInDb = await prisma.attachment.findFirst({
      where: { organizationId },
    });

    expect(attachmentInDb?.sha256).toBe(expectedHash);
    expect(attachmentInDb?.byteSize).toBe(fileBuffer.length);
    expect(attachmentInDb?.storageKey).toBe(response.body.data.storageKey);
    expect(attachmentInDb?.versionId).toBe('v1');
  });

  it('rejects uploads flagged as infected by antivirus', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const entry = await seedEntry(organizationId);

    nextScanResult = { status: 'infected', signature: 'Eicar-Test-Signature' };

    const response = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/uploads`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('targetType', 'entry')
      .field('targetId', entry.id)
      .attach('file', Buffer.from('dummy'), { filename: 'virus.txt', contentType: 'text/plain' });

    expect(response.statusCode).toBe(422);
    expect(response.body.title).toBe('FILE_INFECTED');
    expect(await prisma.attachment.count()).toBe(0);
    expect(storedObjects).toHaveLength(0);
  });

  it('supports uploading attachments linked to projects', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.SECRETARY);
    const project = await seedProject(organizationId);

    const buffer = Buffer.from('Project attachment');
    const expectedHash = createHash('sha256').update(buffer).digest('hex');

    const response = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/uploads`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('targetType', 'project')
      .field('targetId', project.id)
      .attach('file', buffer, { filename: 'synthese.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    expect(response.statusCode).toBe(201);
    expect(response.body.data.projectId).toBe(project.id);
    expect(response.body.data.entryId).toBeNull();
    expect(response.body.data.sha256).toBe(expectedHash);
    expect(storedObjects[0]?.key).toContain(`/projects/${project.id}/`);

    const stored = await prisma.attachment.findFirst({ where: { projectId: project.id } });
    expect(stored?.entryId).toBeNull();
    expect(stored?.sha256).toBe(expectedHash);
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

  return { organizationId: organization.id, accessToken };
}

async function seedEntry(organizationId: string) {
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
        name: 'Banque',
        type: 'BANK',
      },
    });

    const entry = await tx.entry.create({
      data: {
        organizationId,
        fiscalYearId: fiscalYear.id,
        journalId: journal.id,
        date: new Date('2025-02-10'),
        memo: 'Pièce justificative',
      },
    });

    return entry;
  });
}

async function seedProject(organizationId: string) {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organizationId);

    const project = await tx.project.create({
      data: {
        organizationId,
        code: `PROJ-${Math.random().toString(16).slice(2, 8)}`,
        name: 'Projet subvention',
      },
    });

    return project;
  });
}
