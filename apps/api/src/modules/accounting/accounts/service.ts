import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpProblemError } from '../../../lib/problem-details';
import {
  createAccountInputSchema,
  updateAccountInputSchema,
  type AccountType,
  isAccountTypeCompatible,
} from './schemas';
import { DEFAULT_CHART_OF_ACCOUNTS } from './default-plan';

export type AccountClient = PrismaClient | Prisma.TransactionClient;

export async function listAccounts(client: AccountClient, organizationId: string) {
  return client.account.findMany({
    where: { organizationId },
    orderBy: [{ code: 'asc' }],
  });
}

export async function createAccount(
  client: AccountClient,
  organizationId: string,
  input: unknown
) {
  const parsed = createAccountInputSchema.parse(input);

  await ensureAccountCodeAvailable(client, organizationId, parsed.code);

  return client.account.create({
    data: {
      organizationId,
      code: parsed.code,
      name: parsed.name,
      type: parsed.type,
      isActive: parsed.isActive,
    },
  });
}

export async function updateAccount(
  client: AccountClient,
  organizationId: string,
  accountId: string,
  input: unknown
) {
  const parsed = updateAccountInputSchema.parse(input);

  const existing = await client.account.findFirst({
    where: { id: accountId, organizationId },
  });

  if (!existing) {
    throw new HttpProblemError({
      status: 404,
      title: 'ACCOUNT_NOT_FOUND',
      detail: 'The requested account does not exist in this organization.',
    });
  }

  if (parsed.code && parsed.code !== existing.code) {
    await ensureAccountCodeAvailable(client, organizationId, parsed.code);
  }

  const nextCode = parsed.code ?? existing.code;
  const nextType = (parsed.type ?? existing.type) as AccountType;

  if (!isAccountTypeCompatible(nextCode, nextType)) {
    throw incompatibleTypeError(nextCode, nextType);
  }

  const data: Prisma.AccountUpdateInput = {};
  if (parsed.code !== undefined) {
    data.code = parsed.code;
  }
  if (parsed.name !== undefined) {
    data.name = parsed.name;
  }
  if (parsed.type !== undefined) {
    data.type = parsed.type;
  }
  if (parsed.isActive !== undefined) {
    data.isActive = parsed.isActive;
  }

  return client.account.update({
    where: { id: existing.id },
    data,
  });
}

export async function importDefaultAccounts(
  client: AccountClient,
  organizationId: string
): Promise<{ imported: number }> {
  const data = DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({
    organizationId,
    code: account.code,
    name: account.name,
    type: account.type,
  }));

  const result = await client.account.createMany({
    data,
    skipDuplicates: true,
  });

  return { imported: result.count };
}

async function ensureAccountCodeAvailable(
  client: AccountClient,
  organizationId: string,
  code: string
): Promise<void> {
  const existing = await client.account.findUnique({
    where: {
      organizationId_code: { organizationId, code },
    },
    select: { id: true },
  });

  if (existing) {
    throw new HttpProblemError({
      status: 409,
      title: 'ACCOUNT_CODE_ALREADY_EXISTS',
      detail: `An account with code ${code} already exists in this organization.`,
    });
  }
}

function incompatibleTypeError(code: string, type: AccountType): HttpProblemError {
  return new HttpProblemError({
    status: 400,
    title: 'ACCOUNT_TYPE_INCOMPATIBLE',
    detail: `Account code ${code} is not compatible with type ${type}.`,
  });
}
