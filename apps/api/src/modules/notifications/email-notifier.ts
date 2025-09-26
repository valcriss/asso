import type { EmailService } from '../../lib/email/service';
import type {
  AlertTemplateData,
  ReminderTemplateData,
  ReceiptTemplateData,
} from '../../lib/email/templates';

interface EmailEnvelope {
  to: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}

export type ContributionReceiptEmailInput = EmailEnvelope & ReceiptTemplateData;
export type MembershipReminderEmailInput = EmailEnvelope & ReminderTemplateData;

export interface SubsidyAlertEmailInput extends EmailEnvelope {
  organizationName: string;
  subsidyLabel: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  severity?: NonNullable<AlertTemplateData['severity']>;
}

export interface ExportReadyAlertEmailInput extends EmailEnvelope {
  organizationName: string;
  exportLabel: string;
  downloadUrl: string;
  expiresAt?: string;
}

export interface EmailNotifier {
  queueContributionReceipt(input: ContributionReceiptEmailInput): Promise<void>;
  queueMembershipReminder(input: MembershipReminderEmailInput): Promise<void>;
  queueSubsidyAlert(input: SubsidyAlertEmailInput): Promise<void>;
  queueExportReadyAlert(input: ExportReadyAlertEmailInput): Promise<void>;
}

class DefaultEmailNotifier implements EmailNotifier {
  constructor(private readonly emailService: EmailService) {}

  async queueContributionReceipt(input: ContributionReceiptEmailInput): Promise<void> {
    const { to, cc, bcc, replyTo, ...payload } = input;

    await this.emailService.send({
      to,
      cc,
      bcc,
      replyTo,
      template: 'receipt',
      payload,
    });
  }

  async queueMembershipReminder(input: MembershipReminderEmailInput): Promise<void> {
    const { to, cc, bcc, replyTo, ...payload } = input;

    await this.emailService.send({
      to,
      cc,
      bcc,
      replyTo,
      template: 'reminder',
      payload,
    });
  }

  async queueSubsidyAlert(input: SubsidyAlertEmailInput): Promise<void> {
    const { to, cc, bcc, replyTo, organizationName, subsidyLabel, message, actionUrl, actionLabel, severity } = input;

    const payload: AlertTemplateData = {
      organizationName,
      title: `Suivi de subvention — ${subsidyLabel}`,
      message,
      severity: severity ?? 'warning',
      actionUrl,
      actionLabel: actionLabel ?? (actionUrl ? 'Consulter le dossier' : undefined),
    };

    await this.emailService.send({
      to,
      cc,
      bcc,
      replyTo,
      template: 'alert',
      payload,
    });
  }

  async queueExportReadyAlert(input: ExportReadyAlertEmailInput): Promise<void> {
    const { to, cc, bcc, replyTo, organizationName, exportLabel, downloadUrl, expiresAt } = input;

    const payload: AlertTemplateData = {
      organizationName,
      title: `${exportLabel} prêt à télécharger`,
      message: expiresAt
        ? `L'export ${exportLabel} est maintenant disponible. Pensez à le télécharger avant le ${expiresAt}.`
        : `L'export ${exportLabel} est maintenant disponible.`,
      severity: 'info',
      actionUrl: downloadUrl,
      actionLabel: 'Télécharger l’export',
    };

    await this.emailService.send({
      to,
      cc,
      bcc,
      replyTo,
      template: 'alert',
      payload,
    });
  }
}

export function createEmailNotifier(emailService: EmailService): EmailNotifier {
  return new DefaultEmailNotifier(emailService);
}
