import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpProblemError } from '../../../lib/problem-details';
import { createOfxRuleSchema, updateOfxRuleSchema, listOfxRulesQuerySchema, type CreateOfxRuleInput, type UpdateOfxRuleInput } from './schemas';

export type OfxRuleClient = PrismaClient | Prisma.TransactionClient;

export async function listOfxRules(
  client: OfxRuleClient,
  organizationId: string,
  query: unknown,
) {
  const parsed = listOfxRulesQuerySchema.parse(query ?? {});

  const where: Prisma.OfxRuleWhereInput = { organizationId };
  if (parsed.bankAccountId) where.bankAccountId = parsed.bankAccountId;
  if (parsed.active !== undefined) where.isActive = parsed.active;

  const rules = await client.ofxRule.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
  return rules;
}

export async function createOfxRule(
  client: OfxRuleClient,
  organizationId: string,
  input: unknown,
) {
  const parsed = createOfxRuleSchema.parse(input) as CreateOfxRuleInput;

  if (parsed.bankAccountId) {
    const exists = await client.bankAccount.findFirst({
      where: { id: parsed.bankAccountId, organizationId },
      select: { id: true },
    });
    if (!exists) {
      throw new HttpProblemError({ status: 404, title: 'BANK_ACCOUNT_NOT_FOUND', detail: 'Bank account not found for this organization.' });
    }
  }

  // Validate regex pattern
  try {
    RegExp(parsed.pattern);
  } catch {
    throw new HttpProblemError({ status: 400, title: 'INVALID_REGEX', detail: 'Provided pattern is not a valid regular expression.' });
  }

  const rule = await client.ofxRule.create({
    data: {
      organizationId,
      bankAccountId: parsed.bankAccountId ?? null,
      pattern: parsed.pattern,
      normalizedLabel: parsed.normalizedLabel,
      priority: parsed.priority ?? 0,
      isActive: parsed.isActive ?? true,
    },
  });
  return rule;
}

export async function updateOfxRule(
  client: OfxRuleClient,
  organizationId: string,
  ruleId: string,
  input: unknown,
) {
  const parsed = updateOfxRuleSchema.parse(input) as UpdateOfxRuleInput;

  const rule = await client.ofxRule.findFirst({ where: { id: ruleId, organizationId }, select: { id: true } });
  if (!rule) {
    throw new HttpProblemError({ status: 404, title: 'OFX_RULE_NOT_FOUND', detail: 'The OFX rule was not found.' });
  }

  if (parsed.bankAccountId !== undefined && parsed.bankAccountId !== null) {
    const exists = await client.bankAccount.findFirst({ where: { id: parsed.bankAccountId, organizationId }, select: { id: true } });
    if (!exists) {
      throw new HttpProblemError({ status: 404, title: 'BANK_ACCOUNT_NOT_FOUND', detail: 'Bank account not found for this organization.' });
    }
  }

  if (parsed.pattern !== undefined) {
    try {
      RegExp(parsed.pattern);
    } catch {
      throw new HttpProblemError({ status: 400, title: 'INVALID_REGEX', detail: 'Provided pattern is not a valid regular expression.' });
    }
  }

  const data: Prisma.OfxRuleUncheckedUpdateInput = {};
  if (parsed.bankAccountId !== undefined) data.bankAccountId = parsed.bankAccountId ?? null;
  if (parsed.pattern !== undefined) data.pattern = parsed.pattern;
  if (parsed.normalizedLabel !== undefined) data.normalizedLabel = parsed.normalizedLabel;
  if (parsed.priority !== undefined) data.priority = parsed.priority;
  if (parsed.isActive !== undefined) data.isActive = parsed.isActive;

  const updated = await client.ofxRule.update({ where: { id: ruleId }, data });
  return updated;
}

export async function deleteOfxRule(
  client: OfxRuleClient,
  organizationId: string,
  ruleId: string,
) {
  const rule = await client.ofxRule.findFirst({ where: { id: ruleId, organizationId }, select: { id: true } });
  if (!rule) {
    throw new HttpProblemError({ status: 404, title: 'OFX_RULE_NOT_FOUND', detail: 'The OFX rule was not found.' });
  }
  await client.ofxRule.delete({ where: { id: rule.id } });
}
