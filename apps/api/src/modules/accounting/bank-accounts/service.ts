import type { Prisma, PrismaClient } from '@prisma/client';
import { Prisma as PrismaNamespace } from '@prisma/client';
import { z } from 'zod';
import { HttpProblemError } from '../../../lib/problem-details';
import { createBankAccountInputSchema, updateBankAccountInputSchema } from './schemas';

export type BankAccountClient = PrismaClient | Prisma.TransactionClient;

export async function listBankAccounts(client: BankAccountClient, organizationId: string) {
  return client.bankAccount.findMany({
    where: { organizationId },
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function getBankAccount(
  client: BankAccountClient,
  organizationId: string,
  bankAccountId: string
) {
  const account = await client.bankAccount.findFirst({
    where: { id: bankAccountId, organizationId },
  });

  if (!account) {
    throw bankAccountNotFound();
  }

  return account;
}

export async function createBankAccount(
  client: BankAccountClient,
  organizationId: string,
  input: unknown
) {
  const parsed = parseInput(createBankAccountInputSchema, input, 'Invalid bank account payload.');

  await ensureAccountBelongsToOrganization(client, organizationId, parsed.accountId);
  await ensureAccountAvailable(client, organizationId, parsed.accountId);
  await ensureIbanAvailable(client, organizationId, parsed.iban);

  try {
    return await client.bankAccount.create({
      data: {
        organizationId,
        accountId: parsed.accountId,
        name: parsed.name,
        iban: parsed.iban,
        bic: parsed.bic ?? null,
      },
    });
  } catch (error) {
    handleKnownPrismaErrors(error);
    throw error;
  }
}

export async function updateBankAccount(
  client: BankAccountClient,
  organizationId: string,
  bankAccountId: string,
  input: unknown
) {
  const parsed = parseInput(updateBankAccountInputSchema, input, 'Invalid bank account update payload.');

  const existing = await client.bankAccount.findFirst({
    where: { id: bankAccountId, organizationId },
  });

  if (!existing) {
    throw bankAccountNotFound();
  }

  if (parsed.accountId && parsed.accountId !== existing.accountId) {
    await ensureAccountBelongsToOrganization(client, organizationId, parsed.accountId);
    await ensureAccountAvailable(client, organizationId, parsed.accountId);
  }

  if (parsed.iban && parsed.iban !== existing.iban) {
    await ensureIbanAvailable(client, organizationId, parsed.iban);
  }

  const data: Prisma.BankAccountUpdateInput = {};

  if (parsed.accountId !== undefined) {
    data.account = { connect: { id: parsed.accountId } };
  }
  if (parsed.name !== undefined) {
    data.name = parsed.name;
  }
  if (parsed.iban !== undefined) {
    data.iban = parsed.iban;
  }
  if (parsed.bic !== undefined) {
    data.bic = parsed.bic;
  }

  try {
    return await client.bankAccount.update({
      where: { id: existing.id },
      data,
    });
  } catch (error) {
    handleKnownPrismaErrors(error);
    throw error;
  }
}

export async function deleteBankAccount(
  client: BankAccountClient,
  organizationId: string,
  bankAccountId: string
): Promise<void> {
  const existing = await client.bankAccount.findFirst({
    where: { id: bankAccountId, organizationId },
    select: { id: true },
  });

  if (!existing) {
    throw bankAccountNotFound();
  }

  const statementCount = await client.bankStatement.count({
    where: { organizationId, bankAccountId },
  });

  if (statementCount > 0) {
    throw new HttpProblemError({
      status: 409,
      title: 'BANK_ACCOUNT_HAS_STATEMENTS',
      detail: 'The bank account cannot be deleted while statements are linked to it.',
    });
  }

  await client.bankAccount.delete({
    where: { id: existing.id },
  });
}

async function ensureAccountBelongsToOrganization(
  client: BankAccountClient,
  organizationId: string,
  accountId: string
): Promise<void> {
  const account = await client.account.findFirst({
    where: { id: accountId, organizationId },
    select: { id: true },
  });

  if (!account) {
    throw new HttpProblemError({
      status: 404,
      title: 'ACCOUNT_NOT_FOUND',
      detail: 'The specified general ledger account does not exist in this organization.',
    });
  }
}

async function ensureAccountAvailable(
  client: BankAccountClient,
  organizationId: string,
  accountId: string
): Promise<void> {
  const existing = await client.bankAccount.findFirst({
    where: { organizationId, accountId },
    select: { id: true },
  });

  if (existing) {
    throw new HttpProblemError({
      status: 409,
      title: 'BANK_ACCOUNT_ACCOUNT_ALREADY_LINKED',
      detail: 'This general ledger account is already linked to a bank account.',
    });
  }
}

async function ensureIbanAvailable(
  client: BankAccountClient,
  organizationId: string,
  iban: string
): Promise<void> {
  const existing = await client.bankAccount.findFirst({
    where: { organizationId, iban },
    select: { id: true },
  });

  if (existing) {
    throw new HttpProblemError({
      status: 409,
      title: 'BANK_ACCOUNT_IBAN_ALREADY_EXISTS',
      detail: 'A bank account with this IBAN already exists for the organization.',
    });
  }
}

function handleKnownPrismaErrors(error: unknown): void {
  if (!(error instanceof PrismaNamespace.PrismaClientKnownRequestError)) {
    return;
  }

  if (error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta?.target.join(',') : String(error.meta?.target ?? '');

    if (target.includes('bank_account_org_account_key')) {
      throw new HttpProblemError({
        status: 409,
        title: 'BANK_ACCOUNT_ACCOUNT_ALREADY_LINKED',
        detail: 'This general ledger account is already linked to a bank account.',
      });
    }

    if (target.includes('bank_account_org_iban_key')) {
      throw new HttpProblemError({
        status: 409,
        title: 'BANK_ACCOUNT_IBAN_ALREADY_EXISTS',
        detail: 'A bank account with this IBAN already exists for the organization.',
      });
    }
  }
}

function bankAccountNotFound(): HttpProblemError {
  return new HttpProblemError({
    status: 404,
    title: 'BANK_ACCOUNT_NOT_FOUND',
    detail: 'The requested bank account does not exist for this organization.',
  });
}

function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown, detail: string): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpProblemError({
      status: 400,
      title: 'VALIDATION_ERROR',
      detail,
      cause: result.error,
    });
  }

  return result.data;
}
