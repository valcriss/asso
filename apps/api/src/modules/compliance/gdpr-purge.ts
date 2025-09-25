import type { PrismaClient } from '@prisma/client';

export interface GdprPurgeResult {
  membersPurged: number;
  memberFeeAssignmentsPurged: number;
  memberPaymentsPurged: number;
  donationsPurged: number;
}

export async function purgeSoftDeletedRecords(
  prisma: Pick<
    PrismaClient,
    'memberPayment' | 'memberFeeAssignment' | 'member' | 'donation'
  >,
  now: Date = new Date()
): Promise<GdprPurgeResult> {
  const memberCutoff = subtractYears(now, 3);
  const donationCutoff = subtractYears(now, 6);

  const memberPaymentsResult = await prisma.memberPayment.deleteMany({
    where: {
      member: {
        deletedAt: { not: null, lt: memberCutoff },
      },
    },
  });

  const memberAssignmentsResult = await prisma.memberFeeAssignment.deleteMany({
    where: {
      member: {
        deletedAt: { not: null, lt: memberCutoff },
      },
    },
  });

  const memberResult = await prisma.member.deleteMany({
    where: {
      deletedAt: { not: null, lt: memberCutoff },
    },
  });

  const donationResult = await prisma.donation.deleteMany({
    where: {
      deletedAt: { not: null, lt: donationCutoff },
    },
  });

  return {
    membersPurged: memberResult.count,
    memberFeeAssignmentsPurged: memberAssignmentsResult.count,
    memberPaymentsPurged: memberPaymentsResult.count,
    donationsPurged: donationResult.count,
  };
}

function subtractYears(date: Date, years: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCFullYear(copy.getUTCFullYear() - years);
  return copy;
}
