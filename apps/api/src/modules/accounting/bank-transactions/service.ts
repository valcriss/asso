import type { BankTransaction, OfxRule, Prisma, PrismaClient } from '@prisma/client';
import { Prisma as PrismaNamespace } from '@prisma/client';
import { z } from 'zod';
import { HttpProblemError } from '../../../lib/problem-details';
import type { ParsedOfxTransaction } from './ofx-parser';
import { parseOfxTransactions } from './ofx-parser';
import { importOfxInputSchema, reconcileSuggestionsInputSchema } from './schemas';

export type BankTransactionClient = PrismaClient | Prisma.TransactionClient;

interface PreparedTransaction {
  fitId: string;
  valueDate: Date;
  amount: PrismaNamespace.Decimal;
  rawLabel: string;
  memo: string | null;
}

interface CompiledOfxRule {
  regex: RegExp;
  normalizedLabel: string;
}

export interface ImportOfxResult {
  imported: number;
  duplicates: number;
  transactions: BankTransaction[];
}

export interface ReconciliationSuggestion {
  entryId: string;
  entryDate: Date;
  amount: PrismaNamespace.Decimal;
  memo: string | null;
  reference: string | null;
  matchType: 'EXACT' | 'FUZZY';
  similarity?: number;
}

export interface ReconciliationSuggestionsResult {
  transactionId: string;
  suggestions: ReconciliationSuggestion[];
}

const EXACT_MATCH_WINDOW_DAYS = 3;
const FUZZY_SIMILARITY_THRESHOLD = 0.7;
const FUZZY_AMOUNT_TOLERANCE = new PrismaNamespace.Decimal('0.01');
const FUZZY_DATE_WINDOW_DAYS = 10;

export async function importOfxTransactions(
  client: BankTransactionClient,
  organizationId: string,
  input: unknown
): Promise<ImportOfxResult> {
  const parsed = parseInput(importOfxInputSchema, input, 'Invalid OFX import payload.');

  const bankAccount = await client.bankAccount.findFirst({
    where: { id: parsed.bankAccountId, organizationId },
    select: { id: true },
  });

  if (!bankAccount) {
    throw new HttpProblemError({
      status: 404,
      title: 'BANK_ACCOUNT_NOT_FOUND',
      detail: 'The specified bank account does not exist for this organization.',
    });
  }

  let parsedTransactions;
  try {
    parsedTransactions = parseOfxTransactions(parsed.ofx);
  } catch (error) {
    throw new HttpProblemError({
      status: 400,
      title: 'OFX_PARSE_ERROR',
      detail: 'The OFX file could not be parsed.',
      cause: error instanceof Error ? error : undefined,
    });
  }

  if (parsedTransactions.length === 0) {
    return { imported: 0, duplicates: 0, transactions: [] };
  }

  const preparedTransactions = prepareTransactions(parsedTransactions);

  if (preparedTransactions.length === 0) {
    return { imported: 0, duplicates: parsedTransactions.length, transactions: [] };
  }

  const existingKeys = await loadExistingTransactionKeys(
    client,
    organizationId,
    parsed.bankAccountId,
    preparedTransactions
  );

  const rules = await loadNormalizationRules(client, organizationId, parsed.bankAccountId);

  const transactionsToInsert = preparedTransactions.filter((transaction) => {
    const key = buildTransactionKey(transaction.fitId, transaction.amount, transaction.valueDate);
    return !existingKeys.has(key);
  });

  if (transactionsToInsert.length === 0) {
    return {
      imported: 0,
      duplicates: parsedTransactions.length,
      transactions: [],
    };
  }

  const compiledRules = compileOfxRules(rules);
  const created: BankTransaction[] = [];

  for (const transaction of transactionsToInsert) {
    const normalizedLabel = applyNormalization(transaction.rawLabel, transaction.memo, compiledRules);

    const createdTransaction = await client.bankTransaction.create({
      data: {
        organizationId,
        bankAccountId: parsed.bankAccountId,
        fitId: transaction.fitId,
        valueDate: transaction.valueDate,
        amount: transaction.amount,
        rawLabel: transaction.rawLabel,
        normalizedLabel,
        memo: transaction.memo,
      },
    });

    created.push(createdTransaction);
  }

  return {
    imported: created.length,
    duplicates: parsedTransactions.length - created.length,
    transactions: created,
  };
}

export async function getReconciliationSuggestions(
  client: BankTransactionClient,
  organizationId: string,
  input: unknown
): Promise<ReconciliationSuggestionsResult> {
  const parsed = parseInput(
    reconcileSuggestionsInputSchema,
    input,
    'Invalid reconciliation payload.'
  );

  const transaction = await client.bankTransaction.findFirst({
    where: { id: parsed.transactionId, organizationId },
    select: {
      id: true,
      bankAccountId: true,
      valueDate: true,
      amount: true,
      rawLabel: true,
      normalizedLabel: true,
      bankAccount: { select: { accountId: true } },
    },
  });

  if (!transaction) {
    throw new HttpProblemError({
      status: 404,
      title: 'BANK_TRANSACTION_NOT_FOUND',
      detail: 'The requested bank transaction does not exist for this organization.',
    });
  }

  const ledgerAccountId = transaction.bankAccount.accountId;
  const transactionAmount = new PrismaNamespace.Decimal(transaction.amount.toString());
  const valueDate = startOfUtcDay(transaction.valueDate);

  const searchStart = addDays(valueDate, -30);
  const searchEnd = addDays(valueDate, 30);

  const entries = await client.entry.findMany({
    where: {
      organizationId,
      date: { gte: searchStart, lte: searchEnd },
      lines: { some: { accountId: ledgerAccountId } },
      bankMatches: { none: {} },
    },
    select: {
      id: true,
      date: true,
      memo: true,
      reference: true,
      lines: {
        where: { accountId: ledgerAccountId },
        select: { debit: true, credit: true },
      },
    },
    take: 100,
  });

  const entrySummaries = entries.map((entry) => ({
    id: entry.id,
    date: startOfUtcDay(entry.date),
    memo: entry.memo ?? null,
    reference: entry.reference ?? null,
    amount: sumEntryLines(entry.lines),
  }));

  const suggestions: ReconciliationSuggestion[] = [];
  const usedEntryIds = new Set<string>();

  const exactCandidates = entrySummaries
    .map((entry) => ({
      ...entry,
      dateDiff: differenceInDays(entry.date, valueDate),
    }))
    .filter((entry) => entry.amount.equals(transactionAmount) && entry.dateDiff <= EXACT_MATCH_WINDOW_DAYS)
    .sort((a, b) => {
      if (a.dateDiff !== b.dateDiff) {
        return a.dateDiff - b.dateDiff;
      }
      return a.id.localeCompare(b.id);
    });

  for (const candidate of exactCandidates) {
    if (suggestions.length >= parsed.maxSuggestions) {
      break;
    }

    suggestions.push({
      entryId: candidate.id,
      entryDate: candidate.date,
      amount: candidate.amount,
      memo: candidate.memo,
      reference: candidate.reference,
      matchType: 'EXACT',
    });
    usedEntryIds.add(candidate.id);
  }

  if (suggestions.length < parsed.maxSuggestions) {
    const baseLabel = (transaction.normalizedLabel ?? transaction.rawLabel).trim();
    const normalizedTransactionLabel = normalizeComparisonText(baseLabel);

    if (normalizedTransactionLabel) {
      const fuzzyCandidates = entrySummaries
        .filter((entry) => !usedEntryIds.has(entry.id))
        .map((entry) => {
          const similarity = trigramSimilarity(
            normalizedTransactionLabel,
            normalizeComparisonText(entry.memo ?? entry.reference ?? '')
          );
          const amountDiff = entry.amount.sub(transactionAmount).abs();
          const dateDiff = differenceInDays(entry.date, valueDate);
          return { entry, similarity, amountDiff, dateDiff };
        })
        .filter(
          ({ similarity, amountDiff, dateDiff }) =>
            similarity >= FUZZY_SIMILARITY_THRESHOLD &&
            amountDiff.lessThanOrEqualTo(FUZZY_AMOUNT_TOLERANCE) &&
            dateDiff <= FUZZY_DATE_WINDOW_DAYS
        )
        .sort((a, b) => {
          if (b.similarity !== a.similarity) {
            return b.similarity - a.similarity;
          }
          if (a.dateDiff !== b.dateDiff) {
            return a.dateDiff - b.dateDiff;
          }
          return a.entry.id.localeCompare(b.entry.id);
        });

      for (const candidate of fuzzyCandidates) {
        if (suggestions.length >= parsed.maxSuggestions) {
          break;
        }

        suggestions.push({
          entryId: candidate.entry.id,
          entryDate: candidate.entry.date,
          amount: candidate.entry.amount,
          memo: candidate.entry.memo,
          reference: candidate.entry.reference,
          matchType: 'FUZZY',
          similarity: Number(candidate.similarity.toFixed(4)),
        });
        usedEntryIds.add(candidate.entry.id);
      }
    }
  }

  return {
    transactionId: transaction.id,
    suggestions,
  };
}

function prepareTransactions(parsed: ParsedOfxTransaction[]): PreparedTransaction[] {
  const unique = new Map<string, PreparedTransaction>();

  for (const transaction of parsed) {
    const amount = safeDecimal(transaction.amount);
    if (!amount) {
      continue;
    }

    const valueDate = startOfUtcDay(transaction.postedAt);
    const rawLabel = sanitizeLabel(transaction.name);
    const memo = sanitizeOptional(transaction.memo);
    const key = buildTransactionKey(transaction.fitId, amount, valueDate);

    if (!unique.has(key)) {
      unique.set(key, { fitId: transaction.fitId, amount, valueDate, rawLabel, memo });
    }
  }

  return Array.from(unique.values());
}

async function loadExistingTransactionKeys(
  client: BankTransactionClient,
  organizationId: string,
  bankAccountId: string,
  transactions: PreparedTransaction[]
): Promise<Set<string>> {
  if (transactions.length === 0) {
    return new Set();
  }

  const existing = await client.bankTransaction.findMany({
    where: {
      organizationId,
      bankAccountId,
      OR: transactions.map((transaction) => ({
        fitId: transaction.fitId,
        amount: transaction.amount,
        valueDate: transaction.valueDate,
      })),
    },
    select: { fitId: true, amount: true, valueDate: true },
  });

  return new Set(
    existing.map((transaction) =>
      buildTransactionKey(
        transaction.fitId,
        new PrismaNamespace.Decimal(transaction.amount.toString()),
        transaction.valueDate
      )
    )
  );
}

async function loadNormalizationRules(
  client: BankTransactionClient,
  organizationId: string,
  bankAccountId: string
): Promise<OfxRule[]> {
  return client.ofxRule.findMany({
    where: {
      organizationId,
      isActive: true,
      OR: [{ bankAccountId }, { bankAccountId: null }],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
}

function compileOfxRules(rules: Array<{ pattern: string; normalizedLabel: string }>): CompiledOfxRule[] {
  const compiled: CompiledOfxRule[] = [];

  for (const rule of rules) {
    const normalizedLabel = rule.normalizedLabel.trim();
    if (!normalizedLabel) {
      continue;
    }

    try {
      const regex = new RegExp(rule.pattern, 'i');
      compiled.push({ regex, normalizedLabel });
    } catch (error) {
      // Ignore invalid regular expressions
    }
  }

  return compiled;
}

function applyNormalization(
  rawLabel: string,
  memo: string | null,
  rules: CompiledOfxRule[]
): string {
  if (rules.length === 0) {
    return rawLabel;
  }

  const haystacks = [rawLabel, memo ?? undefined].filter((value): value is string => Boolean(value && value.trim()));

  for (const rule of rules) {
    for (const haystack of haystacks) {
      rule.regex.lastIndex = 0;
      if (rule.regex.test(haystack)) {
        return rule.normalizedLabel;
      }
    }
  }

  return rawLabel;
}

function sumEntryLines(
  lines: Array<{ debit: PrismaNamespace.Decimal; credit: PrismaNamespace.Decimal }>
): PrismaNamespace.Decimal {
  return lines.reduce(
    (sum, line) => sum.add(line.debit).sub(line.credit),
    new PrismaNamespace.Decimal(0)
  );
}

function safeDecimal(value: string): PrismaNamespace.Decimal | null {
  try {
    return new PrismaNamespace.Decimal(value);
  } catch (error) {
    return null;
  }
}

function sanitizeLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Transaction';
  }

  return trimmed.replace(/\s+/g, ' ');
}

function sanitizeOptional(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildTransactionKey(
  fitId: string,
  amount: PrismaNamespace.Decimal,
  valueDate: Date
): string {
  return `${fitId}::${amount.toFixed(2)}::${formatDateKey(valueDate)}`;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatDateKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function differenceInDays(a: Date, b: Date): number {
  const startA = startOfUtcDay(a).getTime();
  const startB = startOfUtcDay(b).getTime();
  const diff = Math.abs(startA - startB);
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

function normalizeComparisonText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function trigramSimilarity(a: string, b: string): number {
  const aTrigrams = buildTrigramSet(a);
  const bTrigrams = buildTrigramSet(b);

  if (aTrigrams.size === 0 || bTrigrams.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const trigram of aTrigrams) {
    if (bTrigrams.has(trigram)) {
      intersection += 1;
    }
  }

  return (2 * intersection) / (aTrigrams.size + bTrigrams.size);
}

function buildTrigramSet(value: string): Set<string> {
  if (!value) {
    return new Set();
  }

  const padded = `  ${value} `;
  const trigrams = new Set<string>();

  for (let index = 0; index < padded.length - 2; index += 1) {
    trigrams.add(padded.slice(index, index + 3));
  }

  return trigrams;
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
