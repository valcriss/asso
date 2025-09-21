import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpProblemError } from '../../../lib/problem-details';
import {
  createJournalInputSchema,
  updateJournalInputSchema,
  type JournalType,
  isJournalTypeCompatible,
} from './schemas';
import { DEFAULT_JOURNALS } from './default-journals';

export type JournalClient = PrismaClient | Prisma.TransactionClient;

export async function listJournals(client: JournalClient, organizationId: string) {
  return client.journal.findMany({
    where: { organizationId },
    orderBy: [{ code: 'asc' }],
  });
}

export async function createJournal(
  client: JournalClient,
  organizationId: string,
  input: unknown
) {
  const parsed = createJournalInputSchema.parse(input);

  await ensureJournalCodeAvailable(client, organizationId, parsed.code);

  return client.journal.create({
    data: {
      organizationId,
      code: parsed.code,
      name: parsed.name,
      type: parsed.type,
    },
  });
}

export async function updateJournal(
  client: JournalClient,
  organizationId: string,
  journalId: string,
  input: unknown
) {
  const parsed = updateJournalInputSchema.parse(input);

  const existing = await client.journal.findFirst({
    where: { id: journalId, organizationId },
  });

  if (!existing) {
    throw new HttpProblemError({
      status: 404,
      title: 'JOURNAL_NOT_FOUND',
      detail: 'The requested journal does not exist in this organization.',
    });
  }

  if (parsed.code && parsed.code !== existing.code) {
    await ensureJournalCodeAvailable(client, organizationId, parsed.code);
  }

  const nextCode = parsed.code ?? existing.code;
  const nextType = (parsed.type ?? existing.type) as JournalType;

  if (!isJournalTypeCompatible(nextCode, nextType)) {
    throw new HttpProblemError({
      status: 400,
      title: 'JOURNAL_TYPE_INCOMPATIBLE',
      detail: `Journal code ${nextCode} is not compatible with type ${nextType}.`,
    });
  }

  const data: Prisma.JournalUpdateInput = {};
  if (parsed.code !== undefined) {
    data.code = parsed.code;
  }
  if (parsed.name !== undefined) {
    data.name = parsed.name;
  }
  if (parsed.type !== undefined) {
    data.type = parsed.type;
  }

  return client.journal.update({
    where: { id: existing.id },
    data,
  });
}

export async function importDefaultJournals(
  client: JournalClient,
  organizationId: string
): Promise<{ imported: number }> {
  const data = DEFAULT_JOURNALS.map((journal) => ({
    organizationId,
    code: journal.code,
    name: journal.name,
    type: journal.type,
  }));

  const result = await client.journal.createMany({
    data,
    skipDuplicates: true,
  });

  return { imported: result.count };
}

async function ensureJournalCodeAvailable(
  client: JournalClient,
  organizationId: string,
  code: string
): Promise<void> {
  const existing = await client.journal.findUnique({
    where: {
      organizationId_code: { organizationId, code },
    },
    select: { id: true },
  });

  if (existing) {
    throw new HttpProblemError({
      status: 409,
      title: 'JOURNAL_CODE_ALREADY_EXISTS',
      detail: `A journal with code ${code} already exists in this organization.`,
    });
  }
}
