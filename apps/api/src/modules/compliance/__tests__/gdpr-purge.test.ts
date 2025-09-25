import { describe, expect, it, vi } from 'vitest';
import { purgeSoftDeletedRecords } from '../gdpr-purge';

describe('purgeSoftDeletedRecords', () => {
  it('removes soft deleted members and donations past retention period', async () => {
    const now = new Date('2035-01-10T00:00:00.000Z');
    const memberCutoff = new Date(now.getTime());
    memberCutoff.setUTCFullYear(memberCutoff.getUTCFullYear() - 3);
    const donationCutoff = new Date(now.getTime());
    donationCutoff.setUTCFullYear(donationCutoff.getUTCFullYear() - 6);

    const prisma = {
      memberPayment: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
      memberFeeAssignment: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
      member: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      donation: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
    } as unknown as Parameters<typeof purgeSoftDeletedRecords>[0];

    const result = await purgeSoftDeletedRecords(prisma, now);

    expect(prisma.memberPayment.deleteMany).toHaveBeenCalledWith({
      where: { member: { deletedAt: { not: null, lt: memberCutoff } } },
    });
    expect(prisma.memberFeeAssignment.deleteMany).toHaveBeenCalledWith({
      where: { member: { deletedAt: { not: null, lt: memberCutoff } } },
    });
    expect(prisma.member.deleteMany).toHaveBeenCalledWith({
      where: { deletedAt: { not: null, lt: memberCutoff } },
    });
    expect(prisma.donation.deleteMany).toHaveBeenCalledWith({
      where: { deletedAt: { not: null, lt: donationCutoff } },
    });

    expect(result).toEqual({
      membersPurged: 2,
      memberFeeAssignmentsPurged: 3,
      memberPaymentsPurged: 4,
      donationsPurged: 5,
    });
  });
});
