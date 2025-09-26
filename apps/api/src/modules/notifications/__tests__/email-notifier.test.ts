import { describe, expect, it, vi } from 'vitest';
import { type EmailService } from '../../../lib/email/service';
import {
  type ContributionReceiptEmailInput,
  type ExportReadyAlertEmailInput,
  type MembershipReminderEmailInput,
  type SubsidyAlertEmailInput,
  createEmailNotifier,
} from '../email-notifier';

describe('EmailNotifier', () => {
  const createMocks = () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const emailService = {
      send,
      render: vi.fn(),
      close: vi.fn(),
    } as unknown as EmailService;

    const notifier = createEmailNotifier(emailService);

    return { notifier, send };
  };

  it('queues receipt emails for contributions', async () => {
    const { notifier, send } = createMocks();
    const input: ContributionReceiptEmailInput = {
      to: 'camille@example.org',
      organizationName: 'Association Bleu',
      recipientName: 'Camille Dupont',
      amount: '150,00 €',
      receiptNumber: 'REC-2025-0012',
      issuedAt: '12/02/2025',
      fiscalYearLabel: 'Exercice 2024-2025',
      downloadUrl: 'https://asso.test/receipts/REC-2025-0012.pdf',
    };

    await notifier.queueContributionReceipt(input);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'receipt',
        to: 'camille@example.org',
        payload: expect.objectContaining({ receiptNumber: 'REC-2025-0012' }),
      })
    );
  });

  it('queues reminders for overdue memberships', async () => {
    const { notifier, send } = createMocks();
    const input: MembershipReminderEmailInput = {
      to: 'lea@example.org',
      organizationName: 'Association Bleu',
      memberName: 'Léa Martin',
      dueDate: '30/09/2025',
      amount: '75,00 €',
      paymentLink: 'https://asso.test/payments/cotisation',
      supportContact: 'tresorier@asso.test',
    };

    await notifier.queueMembershipReminder(input);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'reminder',
        payload: expect.objectContaining({ paymentLink: 'https://asso.test/payments/cotisation' }),
      })
    );
  });

  it('queues subsidy alerts with default warning severity', async () => {
    const { notifier, send } = createMocks();
    const input: SubsidyAlertEmailInput = {
      to: 'subventions@example.org',
      organizationName: 'Association Bleu',
      subsidyLabel: 'Plan de relance 2025',
      message: 'Un justificatif est requis avant le 15 mai.',
      actionUrl: 'https://asso.test/subsidies/plan-relance',
    };

    await notifier.queueSubsidyAlert(input);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'alert',
        payload: expect.objectContaining({
          title: 'Suivi de subvention — Plan de relance 2025',
          severity: 'warning',
          actionLabel: 'Consulter le dossier',
        }),
      })
    );
  });

  it('queues export-ready alerts with info severity and download CTA', async () => {
    const { notifier, send } = createMocks();
    const input: ExportReadyAlertEmailInput = {
      to: 'tresorier@example.org',
      organizationName: 'Association Bleu',
      exportLabel: 'FEC 2024',
      downloadUrl: 'https://asso.test/exports/fec-2024.csv',
      expiresAt: '15/01/2026',
    };

    await notifier.queueExportReadyAlert(input);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'alert',
        payload: expect.objectContaining({
          severity: 'info',
          actionUrl: 'https://asso.test/exports/fec-2024.csv',
          message: expect.stringContaining('avant le 15/01/2026'),
        }),
      })
    );
  });
});
