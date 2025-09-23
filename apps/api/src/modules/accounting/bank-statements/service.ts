import type { PrismaClient } from '@prisma/client';
import { Prisma as PrismaNamespace } from '@prisma/client';
import { z } from 'zod';
import { HttpProblemError } from '../../../lib/problem-details';
import { recordBankStatementInputSchema } from './schemas';

export type BankStatementClient = PrismaClient | PrismaNamespace.TransactionClient;

export async function recordBankStatement(
  client: BankStatementClient,
  organizationId: string,
  input: unknown
) {
  const parsed = parseInput(
    recordBankStatementInputSchema,
    input,
    'Invalid bank statement payload.'
  );

  const bankAccount = await client.bankAccount.findFirst({
    where: { id: parsed.bankAccountId, organizationId },
    select: { id: true, accountId: true },
  });

  if (!bankAccount) {
    throw new HttpProblemError({
      status: 404,
      title: 'BANK_ACCOUNT_NOT_FOUND',
      detail: 'The specified bank account does not exist for this organization.',
    });
  }

  const uniqueEntryIds = Array.from(new Set(parsed.entryIds));

  const zero = new PrismaNamespace.Decimal(0);
  let entries: Array<{
    id: string;
    bankStatementId: string | null;
    lines: { debit: PrismaNamespace.Decimal; credit: PrismaNamespace.Decimal }[];
  }> = [];

  if (uniqueEntryIds.length > 0) {
    entries = await client.entry.findMany({
      where: {
        organizationId,
        id: { in: uniqueEntryIds },
      },
      select: {
        id: true,
        bankStatementId: true,
        lines: {
          where: { accountId: bankAccount.accountId },
          select: { debit: true, credit: true },
        },
      },
    });

    if (entries.length !== uniqueEntryIds.length) {
      throw new HttpProblemError({
        status: 404,
        title: 'ENTRY_NOT_FOUND',
        detail: 'One or more entries were not found in the organization.',
      });
    }

    for (const entry of entries) {
      if (entry.bankStatementId) {
        throw new HttpProblemError({
          status: 409,
          title: 'ENTRY_ALREADY_LINKED_TO_STATEMENT',
          detail: 'An entry is already linked to a bank statement.',
        });
      }

      if (entry.lines.length === 0) {
        throw new HttpProblemError({
          status: 422,
          title: 'ENTRY_MISSING_BANK_LINE',
          detail: 'All entries must contain at least one line for the bank account.',
        });
      }
    }
  }

  const netChange = entries.reduce((sum, entry) => {
    const entryChange = entry.lines.reduce(
      (lineSum, line) => lineSum.add(line.debit).sub(line.credit),
      zero
    );
    return sum.add(entryChange);
  }, zero);

  const expectedClosing = parsed.openingBalance.add(netChange);

  if (!expectedClosing.equals(parsed.closingBalance)) {
    throw new HttpProblemError({
      status: 422,
      title: 'BANK_STATEMENT_BALANCE_MISMATCH',
      detail: 'Closing balance does not match the opening balance and linked entries.',
    });
  }

  const statement = await client.bankStatement.create({
    data: {
      organizationId,
      bankAccountId: parsed.bankAccountId,
      statementDate: parsed.statementDate,
      openingBalance: parsed.openingBalance,
      closingBalance: parsed.closingBalance,
    },
  });

  if (uniqueEntryIds.length > 0) {
    await client.entry.updateMany({
      where: { organizationId, id: { in: uniqueEntryIds } },
      data: { bankStatementId: statement.id },
    });
  }

  const persisted = await client.bankStatement.findUnique({
    where: { id: statement.id },
    include: {
      entries: {
        select: { id: true, reference: true, date: true },
        orderBy: { date: 'asc' },
      },
    },
  });

  if (!persisted) {
    throw new HttpProblemError({
      status: 500,
      title: 'BANK_STATEMENT_PERSISTENCE_ERROR',
      detail: 'The bank statement could not be retrieved after creation.',
    });
  }

  return {
    ...persisted,
    openingBalance: persisted.openingBalance.toFixed(2),
    closingBalance: persisted.closingBalance.toFixed(2),
  };
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
