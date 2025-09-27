import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import {
  buildMemberExportCsv,
  buildMemberExportData,
  buildMemberExportFilename,
  generateMemberExportPdf,
  type MemberExportClient,
  type MemberExportData,
} from '../modules/members/members/export';

const decimal = (value: string): { toFixed: (digits: number) => string } => ({
  toFixed: (digits: number) => Number.parseFloat(value).toFixed(digits),
});

describe('buildMemberExportData', () => {
  const organizationId = 'org-1';
  const memberId = 'member-1';

  it('aggregates member data and normalizes formats', async () => {
    const now = new Date('2025-01-05T12:34:56.000Z');
    const member = {
      id: memberId,
      organizationId,
      firstName: 'Anaïs',
      lastName: 'Dùpont & Fils',
      email: 'anais.dupont@example.com',
      membershipType: 'ADHERENT',
      joinedAt: new Date('2024-01-10T08:00:00.000Z'),
      leftAt: null,
      rgpdConsentAt: new Date('2024-01-10T08:00:00.000Z'),
      personalNotes: 'This;note with "quotes" and newline\nSecond line here',
      personalNotesRedactedAt: new Date('2024-04-01T00:00:00.000Z'),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const assignments = [
      {
        id: 'assign-1',
        organizationId,
        memberId,
        templateId: 'tmpl-1',
        template: { id: 'tmpl-1', label: 'Template "Complex";Label' },
        status: 'PENDING',
        amount: decimal('120'),
        currency: 'EUR',
        periodStart: new Date('2025-01-01T00:00:00.000Z'),
        periodEnd: new Date('2025-12-31T00:00:00.000Z'),
        dueDate: new Date('2025-01-31T00:00:00.000Z'),
        autoAssigned: true,
        entryId: 'entry-100',
        createdAt: new Date('2025-01-01T09:00:00.000Z'),
        updatedAt: new Date('2025-01-02T09:00:00.000Z'),
      },
      {
        id: 'assign-2',
        organizationId,
        memberId,
        templateId: 'tmpl-2',
        template: { id: 'tmpl-2', label: 'Réduction spéciale' },
        status: 'OVERDUE',
        amount: decimal('60'),
        currency: 'EUR',
        periodStart: new Date('2025-07-01T00:00:00.000Z'),
        periodEnd: null,
        dueDate: null,
        autoAssigned: false,
        entryId: null,
        createdAt: new Date('2025-07-01T09:00:00.000Z'),
        updatedAt: new Date('2025-07-10T09:00:00.000Z'),
      },
    ];

    const payments = [
      {
        id: 'payment-1',
        organizationId,
        memberId,
        assignmentId: 'assign-1',
        status: 'PAID',
        amount: decimal('120'),
        currency: 'EUR',
        dueDate: new Date('2025-01-31T00:00:00.000Z'),
        paidAt: '2025-02-01T00:00:00.000Z',
        entryId: 'entry-101',
        createdAt: new Date('2025-02-01T09:00:00.000Z'),
        updatedAt: new Date('2025-02-02T09:00:00.000Z'),
      },
      {
        id: 'payment-2',
        organizationId,
        memberId,
        assignmentId: 'assign-2',
        status: 'PENDING',
        amount: decimal('60'),
        currency: 'EUR',
        dueDate: new Date('2025-07-31T00:00:00.000Z'),
        paidAt: null,
        entryId: null,
        createdAt: new Date('2025-07-02T09:00:00.000Z'),
        updatedAt: new Date('2025-07-03T09:00:00.000Z'),
      },
    ];

    const entryLines = [
      {
        id: 'line-1',
        organizationId,
        memberId,
        entryId: 'entry-101',
        entry: {
          id: 'entry-101',
          date: new Date('2025-02-01T00:00:00.000Z'),
          reference: 'DON-2025-001',
          memo: 'Don annuel',
          journal: { code: 'BANQ', name: 'Banque' },
          fiscalYear: { label: 'Exercice 2025' },
        },
        account: { code: '706', name: 'Prestations de services' },
        debit: decimal('0'),
        credit: decimal('120'),
      },
      {
        id: 'line-2',
        organizationId,
        memberId,
        entryId: 'entry-200',
        entry: {
          id: 'entry-200',
          date: new Date('2025-08-15T00:00:00.000Z'),
          reference: null,
          memo: null,
          journal: { code: 'VENT', name: 'Ventes' },
          fiscalYear: { label: 'Exercice 2025' },
        },
        account: { code: '411', name: 'Clients' },
        debit: decimal('60'),
        credit: decimal('0'),
      },
    ];

    const client: MemberExportClient = {
      member: {
        findFirst: vi.fn().mockResolvedValue(member),
      },
      memberFeeAssignment: {
        findMany: vi.fn().mockResolvedValue(assignments),
      },
      memberPayment: {
        findMany: vi.fn().mockResolvedValue(payments),
      },
      entryLine: {
        findMany: vi.fn().mockResolvedValue(entryLines),
      },
    } as unknown as MemberExportClient;

    const result = await buildMemberExportData(client, organizationId, memberId);

    expect((client.member as any).findFirst).toHaveBeenCalledWith({
      where: { id: memberId, organizationId, deletedAt: null },
    });
    expect(result.member).toEqual({
      id: memberId,
      organizationId,
      firstName: 'Anaïs',
      lastName: 'Dùpont & Fils',
      email: 'anais.dupont@example.com',
      membershipType: 'ADHERENT',
      joinedAt: '2024-01-10T08:00:00.000Z',
      leftAt: null,
      rgpdConsentAt: '2024-01-10T08:00:00.000Z',
      personalNotes: 'This;note with "quotes" and newline\nSecond line here',
      personalNotesRedactedAt: '2024-04-01T00:00:00.000Z',
      deletedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    expect(result.assignments).toEqual([
      {
        id: 'assign-1',
        templateId: 'tmpl-1',
        templateLabel: 'Template "Complex";Label',
        status: 'PENDING',
        amount: '120.00',
        currency: 'EUR',
        periodStart: '2025-01-01T00:00:00.000Z',
        periodEnd: '2025-12-31T00:00:00.000Z',
        dueDate: '2025-01-31T00:00:00.000Z',
        autoAssigned: true,
        entryId: 'entry-100',
        createdAt: '2025-01-01T09:00:00.000Z',
        updatedAt: '2025-01-02T09:00:00.000Z',
      },
      {
        id: 'assign-2',
        templateId: 'tmpl-2',
        templateLabel: 'Réduction spéciale',
        status: 'OVERDUE',
        amount: '60.00',
        currency: 'EUR',
        periodStart: '2025-07-01T00:00:00.000Z',
        periodEnd: null,
        dueDate: null,
        autoAssigned: false,
        entryId: null,
        createdAt: '2025-07-01T09:00:00.000Z',
        updatedAt: '2025-07-10T09:00:00.000Z',
      },
    ]);

    expect(result.payments).toEqual([
      {
        id: 'payment-1',
        assignmentId: 'assign-1',
        status: 'PAID',
        amount: '120.00',
        currency: 'EUR',
        dueDate: '2025-01-31T00:00:00.000Z',
        paidAt: '2025-02-01T00:00:00.000Z',
        entryId: 'entry-101',
        createdAt: '2025-02-01T09:00:00.000Z',
        updatedAt: '2025-02-02T09:00:00.000Z',
      },
      {
        id: 'payment-2',
        assignmentId: 'assign-2',
        status: 'PENDING',
        amount: '60.00',
        currency: 'EUR',
        dueDate: '2025-07-31T00:00:00.000Z',
        paidAt: null,
        entryId: null,
        createdAt: '2025-07-02T09:00:00.000Z',
        updatedAt: '2025-07-03T09:00:00.000Z',
      },
    ]);

    expect(result.entryLines).toEqual([
      {
        id: 'line-1',
        entryId: 'entry-101',
        entryDate: '2025-02-01T00:00:00.000Z',
        journalCode: 'BANQ',
        journalName: 'Banque',
        fiscalYearLabel: 'Exercice 2025',
        reference: 'DON-2025-001',
        memo: 'Don annuel',
        accountCode: '706',
        accountName: 'Prestations de services',
        debit: '0.00',
        credit: '120.00',
      },
      {
        id: 'line-2',
        entryId: 'entry-200',
        entryDate: '2025-08-15T00:00:00.000Z',
        journalCode: 'VENT',
        journalName: 'Ventes',
        fiscalYearLabel: 'Exercice 2025',
        reference: null,
        memo: null,
        accountCode: '411',
        accountName: 'Clients',
        debit: '60.00',
        credit: '0.00',
      },
    ]);
  });

  it('throws a problem error when the member does not exist', async () => {
    const client: MemberExportClient = {
      member: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      memberFeeAssignment: {
        findMany: vi.fn(),
      },
      memberPayment: {
        findMany: vi.fn(),
      },
      entryLine: {
        findMany: vi.fn(),
      },
    } as unknown as MemberExportClient;

    await expect(buildMemberExportData(client, organizationId, memberId)).rejects.toMatchObject({
      status: 404,
      title: 'MEMBER_NOT_FOUND',
    });
  });
});

describe('buildMemberExportFilename', () => {
  it('sanitizes names and appends the extension', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-02-20T10:00:00.000Z'));

    const data: MemberExportData = {
      member: {
        id: 'member-123',
        organizationId: 'org-1',
        firstName: 'Anaïs / Test',
        lastName: 'Dùpont & Fils',
        email: 'anais@example.com',
        membershipType: 'ADHERENT',
        joinedAt: null,
        leftAt: null,
        rgpdConsentAt: null,
        personalNotes: null,
        personalNotesRedactedAt: null,
        deletedAt: null,
        createdAt: '2025-02-01T00:00:00.000Z',
        updatedAt: '2025-02-02T00:00:00.000Z',
      },
      assignments: [],
      payments: [],
      entryLines: [],
    };

    const filename = buildMemberExportFilename(data, 'pdf');
    expect(filename).toBe('member-d-pont-fils-ana-s-test-2025-02-20.pdf');

    vi.setSystemTime(new Date('2025-02-21T10:00:00.000Z'));
    const fallback = buildMemberExportFilename(
      {
        ...data,
        member: {
          ...data.member,
          id: 'member-42',
          firstName: ' ',
          lastName: ' ',
        },
      },
      'csv',
    );

    expect(fallback).toBe('member-member-42-2025-02-21.csv');
    vi.useRealTimers();
  });
});

describe('buildMemberExportCsv', () => {
  const data: MemberExportData = {
    member: {
      id: 'member-1',
      organizationId: 'org-1',
      firstName: 'Anaïs',
      lastName: 'Dupont',
      email: 'anais@example.com',
      membershipType: 'ADHERENT',
      joinedAt: '2024-01-10T08:00:00.000Z',
      leftAt: null,
      rgpdConsentAt: 'invalid-date',
      personalNotes: 'Long personal note; needs "quotes" and newline\nSecond line',
      personalNotesRedactedAt: null,
      deletedAt: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    },
    assignments: [
      {
        id: 'assign-1',
        templateId: 'tmpl-1',
        templateLabel: 'Template "Complex";Label',
        status: 'PENDING',
        amount: '120.00',
        currency: 'EUR',
        periodStart: '2025-01-01T00:00:00.000Z',
        periodEnd: '2025-12-31T00:00:00.000Z',
        dueDate: '2025-01-31T00:00:00.000Z',
        autoAssigned: true,
        entryId: 'entry-100',
        createdAt: '2025-01-01T09:00:00.000Z',
        updatedAt: '2025-01-02T09:00:00.000Z',
      },
    ],
    payments: [
      {
        id: 'payment-1',
        assignmentId: 'assign-1',
        status: 'PAID',
        amount: '120.00',
        currency: 'EUR',
        dueDate: 'invalid-date',
        paidAt: '2025-02-01T00:00:00.000Z',
        entryId: 'entry-101',
        createdAt: '2025-02-01T09:00:00.000Z',
        updatedAt: '2025-02-02T09:00:00.000Z',
      },
    ],
    entryLines: [
      {
        id: 'line-1',
        entryId: 'entry-101',
        entryDate: '2025-02-01T00:00:00.000Z',
        journalCode: 'BANQ',
        journalName: 'Banque',
        fiscalYearLabel: 'Exercice 2025',
        reference: 'DON-2025-001',
        memo: 'Don annuel',
        accountCode: '706',
        accountName: 'Prestations de services',
        debit: '0.00',
        credit: '120.00',
      },
      {
        id: 'line-2',
        entryId: 'entry-200',
        entryDate: '2025-08-15T00:00:00.000Z',
        journalCode: 'VENT',
        journalName: 'Ventes',
        fiscalYearLabel: 'Exercice 2025',
        reference: null,
        memo: null,
        accountCode: '411',
        accountName: 'Clients',
        debit: '60.00',
        credit: '0.00',
      },
    ],
  };

  it('produces a csv export with escaped values and sections', () => {
    const csv = buildMemberExportCsv(data);

    expect(csv).toContain('Member;ID;member-1');
    expect(csv).toContain('Member;Personal Notes');
    expect(csv).toMatch(/"Long personal note; needs ""quotes"" and newline\nSecond line"/);
    expect(csv).toContain('Fee Assignment;assign-1;"Template ""Complex"";Label";PENDING');
    expect(csv).toContain('Payment;payment-1;assign-1;PAID;120.00;EUR;invalid-date;2025-02-01T00:00:00.000Z;entry-101');
    expect(csv).toContain('Entry Line;entry-200;2025-08-15T00:00:00.000Z;VENT;Ventes;Exercice 2025;;');
  });
});

describe('generateMemberExportPdf', () => {
  const data: MemberExportData = {
    member: {
      id: 'member-1',
      organizationId: 'org-1',
      firstName: 'Anaïs',
      lastName: 'Dupont',
      email: 'anais@example.com',
      membershipType: 'ADHERENT',
      joinedAt: '2024-01-10T08:00:00.000Z',
      leftAt: null,
      rgpdConsentAt: '2024-01-10T08:00:00.000Z',
      personalNotes:
        'Texte très long '.repeat(20) +
        'pour vérifier le retour à la ligne automatique des paragraphes dans le PDF.',
      personalNotesRedactedAt: null,
      deletedAt: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    },
    assignments: [
      {
        id: 'assign-1',
        templateId: 'tmpl-1',
        templateLabel: 'Adhésion annuelle',
        status: 'PENDING',
        amount: '120.00',
        currency: 'EUR',
        periodStart: '2025-01-01T00:00:00.000Z',
        periodEnd: '2025-12-31T00:00:00.000Z',
        dueDate: '2025-01-31T00:00:00.000Z',
        autoAssigned: true,
        entryId: 'entry-100',
        createdAt: '2025-01-01T09:00:00.000Z',
        updatedAt: '2025-01-02T09:00:00.000Z',
      },
    ],
    payments: [
      {
        id: 'payment-1',
        assignmentId: 'assign-1',
        status: 'PAID',
        amount: '120.00',
        currency: 'EUR',
        dueDate: 'invalid-date',
        paidAt: '2025-02-01T00:00:00.000Z',
        entryId: 'entry-101',
        createdAt: '2025-02-01T09:00:00.000Z',
        updatedAt: '2025-02-02T09:00:00.000Z',
      },
      {
        id: 'payment-2',
        assignmentId: 'assign-1',
        status: 'PENDING',
        amount: '120.00',
        currency: 'EUR',
        dueDate: '2025-03-01T00:00:00.000Z',
        paidAt: null,
        entryId: null,
        createdAt: '2025-02-05T09:00:00.000Z',
        updatedAt: '2025-02-06T09:00:00.000Z',
      },
    ],
    entryLines: [
      {
        id: 'line-1',
        entryId: 'entry-101',
        entryDate: '2025-02-01T00:00:00.000Z',
        journalCode: 'BANQ',
        journalName: 'Banque',
        fiscalYearLabel: 'Exercice 2025',
        reference: 'DON-2025-001',
        memo: 'Don annuel',
        accountCode: '706',
        accountName: 'Prestations de services',
        debit: '0.00',
        credit: '120.00',
      },
      {
        id: 'line-2',
        entryId: 'entry-200',
        entryDate: '2025-08-15T00:00:00.000Z',
        journalCode: 'VENT',
        journalName: 'Ventes',
        fiscalYearLabel: 'Exercice 2025',
        reference: null,
        memo: null,
        accountCode: '411',
        accountName: 'Clients',
        debit: '60.00',
        credit: '0.00',
      },
    ],
  };

  it('generates a valid pdf with metadata and content', async () => {
    const bytes = await generateMemberExportPdf(data);

    expect(bytes.length).toBeGreaterThan(1000);

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe('Export membre Anaïs Dupont');
    expect(pdf.getSubject()).toBe('Export de données membre (RGPD)');
    expect(pdf.getPages()).toHaveLength(1);
  });
});
