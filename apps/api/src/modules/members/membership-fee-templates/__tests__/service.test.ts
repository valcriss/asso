import { describe, expect, it, vi } from 'vitest';
import { HttpProblemError } from '../../../../lib/problem-details';
import {
  createMembershipFeeTemplate,
  deleteMembershipFeeTemplate,
  getMembershipFeeTemplate,
  listMembershipFeeTemplates,
  updateMembershipFeeTemplate,
  type MembershipTemplateClient,
} from '../service';

interface MockTemplateClient extends MembershipTemplateClient {
  membershipFeeTemplate: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  memberFeeAssignment: {
    count: ReturnType<typeof vi.fn>;
  };
}

const createClient = (): MockTemplateClient => ({
  membershipFeeTemplate: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  memberFeeAssignment: {
    count: vi.fn(),
  },
} as unknown as MockTemplateClient);

describe('membership fee template service', () => {
  const organizationId = 'org-1';

  it('lists templates ordered by validity period and label', async () => {
    const client = createClient();
    client.membershipFeeTemplate.findMany.mockResolvedValue(['item']);

    const result = await listMembershipFeeTemplates(client, organizationId);

    expect(client.membershipFeeTemplate.findMany).toHaveBeenCalledWith({
      where: { organizationId },
      orderBy: [
        { validFrom: 'desc' },
        { label: 'asc' },
      ],
    });
    expect(result).toEqual(['item']);
  });

  it('returns a template or throws when not found', async () => {
    const client = createClient();
    client.membershipFeeTemplate.findFirst.mockResolvedValueOnce({ id: 'tmpl-1' });

    await expect(getMembershipFeeTemplate(client, organizationId, 'tmpl-1')).resolves.toEqual({ id: 'tmpl-1' });
    expect(client.membershipFeeTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 'tmpl-1', organizationId },
    });

    client.membershipFeeTemplate.findFirst.mockResolvedValueOnce(null);

    await expect(getMembershipFeeTemplate(client, organizationId, 'missing')).rejects.toBeInstanceOf(
      HttpProblemError
    );
  });

  it('creates a template with defaults applied', async () => {
    const client = createClient();
    client.membershipFeeTemplate.create.mockResolvedValue({ id: 'created' });

    const payload = {
      label: 'Adhésion annuelle',
      amount: '120.00',
      validFrom: '2025-01-01',
      membershipType: 'ADHERENT',
    };

    const result = await createMembershipFeeTemplate(client, organizationId, payload);

    expect(client.membershipFeeTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId,
        label: 'Adhésion annuelle',
        amount: expect.anything(),
        currency: 'EUR',
        isActive: true,
      }),
    });
    expect(result).toEqual({ id: 'created' });
  });

  it('updates template fields selectively', async () => {
    const client = createClient();
    client.membershipFeeTemplate.findFirst.mockResolvedValue({ id: 'tmpl-1' });
    client.membershipFeeTemplate.update.mockResolvedValue({ id: 'tmpl-1', label: 'Updated' });

    const payload = {
      label: 'Updated',
      currency: undefined,
      isActive: false,
      validUntil: '2025-12-31',
    };

    const result = await updateMembershipFeeTemplate(client, organizationId, 'tmpl-1', payload);

    expect(client.membershipFeeTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tmpl-1' },
      data: {
        label: 'Updated',
        isActive: false,
        validUntil: new Date('2025-12-31'),
      },
    });
    expect(result).toEqual({ id: 'tmpl-1', label: 'Updated' });
  });

  it('throws when updating or deleting a missing template', async () => {
    const client = createClient();
    client.membershipFeeTemplate.findFirst.mockResolvedValue(null);

    await expect(updateMembershipFeeTemplate(client, organizationId, 'missing', { label: 'x' })).rejects.toBeInstanceOf(
      HttpProblemError
    );

    await expect(deleteMembershipFeeTemplate(client, organizationId, 'missing')).rejects.toBeInstanceOf(
      HttpProblemError
    );
  });

  it('prevents deletion when assignments exist', async () => {
    const client = createClient();
    client.membershipFeeTemplate.findFirst.mockResolvedValue({ id: 'tmpl-1' });
    client.memberFeeAssignment.count.mockResolvedValue(2);

    await expect(deleteMembershipFeeTemplate(client, organizationId, 'tmpl-1')).rejects.toMatchObject({
      status: 409,
      title: 'TEMPLATE_HAS_ASSIGNMENTS',
    });
  });

  it('deletes templates when no assignments reference them', async () => {
    const client = createClient();
    client.membershipFeeTemplate.findFirst.mockResolvedValue({ id: 'tmpl-1' });
    client.memberFeeAssignment.count.mockResolvedValue(0);

    await deleteMembershipFeeTemplate(client, organizationId, 'tmpl-1');

    expect(client.membershipFeeTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tmpl-1' } });
  });
});
