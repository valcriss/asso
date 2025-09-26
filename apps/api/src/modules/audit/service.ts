import { Prisma, type PrismaClient } from '@prisma/client';

export type AuditClient = PrismaClient | Prisma.TransactionClient;

export type AuditPayload = Prisma.InputJsonValue;

export async function writeAuditLog(
  client: AuditClient,
  organizationId: string,
  userId: string | null,
  action: string,
  entity: string,
  entityId: string,
  payload?: AuditPayload,
): Promise<void> {
  await client.auditLog.create({
    data: {
      organizationId,
      userId,
      action,
      entity,
      entityId,
      payloadJson: payload ?? Prisma.JsonNull,
    },
  });
}
