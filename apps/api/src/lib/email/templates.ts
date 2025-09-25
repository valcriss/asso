import mjml2html from 'mjml';
import { htmlToText } from 'html-to-text';

export type EmailTemplateId = keyof EmailTemplatePayloads;

export interface ReceiptTemplateData {
  organizationName: string;
  recipientName: string;
  amount: string;
  receiptNumber: string;
  issuedAt: string;
  downloadUrl?: string;
  fiscalYearLabel?: string;
}

export interface ReminderTemplateData {
  organizationName: string;
  memberName: string;
  dueDate: string;
  amount: string;
  paymentLink?: string;
  supportContact?: string;
}

export interface AlertTemplateData {
  organizationName: string;
  title: string;
  message: string;
  severity?: 'info' | 'warning' | 'critical';
  actionLabel?: string;
  actionUrl?: string;
}

export interface EmailTemplatePayloads {
  receipt: ReceiptTemplateData;
  reminder: ReminderTemplateData;
  alert: AlertTemplateData;
}

interface TemplateDefinition<TPayload> {
  subject(payload: TPayload): string;
  previewText?(payload: TPayload): string;
  category: 'receipt' | 'reminder' | 'alert';
  mjml(payload: TPayload): string;
}

export interface RenderedEmailTemplate {
  subject: string;
  html: string;
  text: string;
  category: 'receipt' | 'reminder' | 'alert';
}

export class EmailTemplateRenderingError extends Error {
  readonly templateId: EmailTemplateId;

  constructor(templateId: EmailTemplateId, message: string) {
    super(message);
    this.templateId = templateId;
    this.name = 'EmailTemplateRenderingError';
  }
}

const brandColor = '#2563eb';
const textColor = '#1f2937';
const backgroundColor = '#f3f4f6';
const cardBackground = '#ffffff';
const footerTextColor = '#6b7280';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildLayout(options: {
  heading: string;
  previewText?: string;
  content: string;
  organizationName: string;
}): string {
  const footerLine = `© ${new Date().getFullYear()} ${escapeHtml(options.organizationName)}. Tous droits réservés.`;

  return `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Inter, Arial, sans-serif" />
      <mj-text color="${textColor}" font-size="16px" line-height="24px" />
      <mj-button background-color="${brandColor}" color="#ffffff" font-weight="600" border-radius="6px" />
    </mj-attributes>
    ${options.previewText ? `<mj-preview>${escapeHtml(options.previewText)}</mj-preview>` : ''}
  </mj-head>
  <mj-body background-color="${backgroundColor}">
    <mj-section background-color="${brandColor}" padding="24px 0">
      <mj-column>
        <mj-text align="center" color="#ffffff" font-size="22px" font-weight="600">${escapeHtml(options.heading)}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="${cardBackground}" padding="32px 24px 16px 24px">
      <mj-column>
        ${options.content}
      </mj-column>
    </mj-section>
    <mj-section padding="16px 24px 32px 24px">
      <mj-column>
        <mj-text align="center" color="${footerTextColor}" font-size="12px" line-height="18px">
          ${footerLine}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;
}

const templateDefinitions: { [K in EmailTemplateId]: TemplateDefinition<EmailTemplatePayloads[K]> } = {
  receipt: {
    category: 'receipt',
    subject: (payload) =>
      `${payload.organizationName} — Reçu ${payload.receiptNumber}`,
    previewText: (payload) =>
      `Votre reçu pour ${payload.organizationName} est disponible (${payload.amount}).`,
    mjml: (payload) => {
      const greeting = `<mj-text>Bonjour ${escapeHtml(payload.recipientName)},</mj-text>`;
      const intro = `<mj-text>Nous confirmons la réception de votre contribution de <strong>${escapeHtml(payload.amount)}</strong> au profit de ${escapeHtml(payload.organizationName)}.</mj-text>`;
      const details = `
<mj-table cellpadding="6px" width="100%">
  <tr>
    <td style="color:${footerTextColor}; font-size:14px;">Numéro de reçu</td>
    <td style="text-align:right; font-weight:600;">${escapeHtml(payload.receiptNumber)}</td>
  </tr>
  <tr>
    <td style="color:${footerTextColor}; font-size:14px;">Date d'émission</td>
    <td style="text-align:right; font-weight:600;">${escapeHtml(payload.issuedAt)}</td>
  </tr>
  <tr>
    <td style="color:${footerTextColor}; font-size:14px;">Montant</td>
    <td style="text-align:right; font-weight:600;">${escapeHtml(payload.amount)}</td>
  </tr>
  ${payload.fiscalYearLabel ? `<tr><td style="color:${footerTextColor}; font-size:14px;">Exercice</td><td style="text-align:right; font-weight:600;">${escapeHtml(payload.fiscalYearLabel)}</td></tr>` : ''}
</mj-table>`;
      const button = payload.downloadUrl
        ? `<mj-button href="${encodeURI(payload.downloadUrl)}" align="left" padding="20px 0 0 0">Télécharger le reçu</mj-button>`
        : '';
      const closing = `<mj-text>Merci pour votre soutien précieux.<br />L'équipe ${escapeHtml(payload.organizationName)}</mj-text>`;

      return buildLayout({
        heading: 'Reçu de contribution',
        organizationName: payload.organizationName,
        previewText: templateDefinitions.receipt.previewText?.(payload),
        content: `${greeting}<mj-spacer height="12px" />${intro}<mj-spacer height="16px" />${details}${button ? `<mj-spacer height="12px" />${button}` : ''}<mj-spacer height="24px" />${closing}`,
      });
    },
  },
  reminder: {
    category: 'reminder',
    subject: (payload) =>
      `Relance cotisation — ${payload.memberName}`,
    previewText: (payload) =>
      `Relance de cotisation ${payload.amount} due le ${payload.dueDate}.`,
    mjml: (payload) => {
      const greeting = `<mj-text>Bonjour ${escapeHtml(payload.memberName)},</mj-text>`;
      const intro = `<mj-text>Nous vous rappelons que votre cotisation de <strong>${escapeHtml(payload.amount)}</strong> pour ${escapeHtml(payload.organizationName)} est attendue avant le <strong>${escapeHtml(payload.dueDate)}</strong>.</mj-text>`;
      const support = payload.supportContact
        ? `<mj-text font-size="14px" color="${footerTextColor}">Pour toute question, vous pouvez contacter ${escapeHtml(payload.supportContact)}.</mj-text>`
        : '';
      const button = payload.paymentLink
        ? `<mj-button href="${encodeURI(payload.paymentLink)}" align="left" padding="20px 0 0 0">Régler ma cotisation</mj-button>`
        : '';
      const closing = `<mj-text>Merci de votre engagement auprès de ${escapeHtml(payload.organizationName)}.</mj-text>`;

      return buildLayout({
        heading: 'Relance de cotisation',
        organizationName: payload.organizationName,
        previewText: templateDefinitions.reminder.previewText?.(payload),
        content: `${greeting}<mj-spacer height="12px" />${intro}<mj-spacer height="16px" />${support}${button ? `<mj-spacer height="12px" />${button}` : ''}<mj-spacer height="24px" />${closing}`,
      });
    },
  },
  alert: {
    category: 'alert',
    subject: (payload) =>
      `${payload.organizationName} — ${payload.title}`,
    previewText: (payload) =>
      payload.message.length > 120 ? `${payload.message.slice(0, 117)}...` : payload.message,
    mjml: (payload) => {
      const severityColor =
        payload.severity === 'critical' ? '#dc2626' : payload.severity === 'warning' ? '#d97706' : brandColor;
      const intro = `<mj-text>${escapeHtml(payload.message)}</mj-text>`;
      const button = payload.actionUrl
        ? `<mj-button href="${encodeURI(payload.actionUrl)}" background-color="${severityColor}" align="left" padding="20px 0 0 0">${escapeHtml(payload.actionLabel ?? 'Voir les détails')}</mj-button>`
        : '';

      return buildLayout({
        heading: payload.title,
        organizationName: payload.organizationName,
        previewText: templateDefinitions.alert.previewText?.(payload),
        content: `${intro}${button ? `<mj-spacer height="12px" />${button}` : ''}`,
      });
    },
  },
};

export function renderEmailTemplate<K extends EmailTemplateId>(
  templateId: K,
  payload: EmailTemplatePayloads[K]
): RenderedEmailTemplate {
  const definition = templateDefinitions[templateId];
  if (!definition) {
    throw new EmailTemplateRenderingError(templateId, `Unknown email template: ${templateId}`);
  }

  const { html, errors } = mjml2html(definition.mjml(payload), {
    validationLevel: 'strict',
    keepComments: false,
  });

  if (errors.length > 0) {
    const messages = errors.map((error) => error.formattedMessage ?? error.message).join('\n');
    throw new EmailTemplateRenderingError(templateId, messages);
  }

  return {
    subject: definition.subject(payload),
    html,
    text: htmlToText(html, { wordwrap: 120 }),
    category: definition.category,
  };
}
