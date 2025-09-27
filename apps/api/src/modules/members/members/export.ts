import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { MemberFeeAssignmentStatus, MemberPaymentStatus, Prisma, PrismaClient } from '@prisma/client';
import { HttpProblemError } from '../../../lib/problem-details';

export type MemberExportClient = PrismaClient | Prisma.TransactionClient;

export interface MemberExportData {
  member: {
    id: string;
    organizationId: string;
    firstName: string;
    lastName: string;
    email: string;
    membershipType: string;
    joinedAt: string | null;
    leftAt: string | null;
    rgpdConsentAt: string | null;
    personalNotes: string | null;
    personalNotesRedactedAt: string | null;
    deletedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  assignments: MemberExportAssignment[];
  payments: MemberExportPayment[];
  entryLines: MemberExportEntryLine[];
}

export interface MemberExportAssignment {
  id: string;
  templateId: string;
  templateLabel: string;
  status: MemberFeeAssignmentStatus;
  amount: string;
  currency: string;
  periodStart: string;
  periodEnd: string | null;
  dueDate: string | null;
  autoAssigned: boolean;
  entryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberExportPayment {
  id: string;
  assignmentId: string;
  status: MemberPaymentStatus;
  amount: string;
  currency: string;
  dueDate: string | null;
  paidAt: string | null;
  entryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberExportEntryLine {
  id: string;
  entryId: string;
  entryDate: string;
  journalCode: string;
  journalName: string;
  fiscalYearLabel: string;
  reference: string | null;
  memo: string | null;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export async function buildMemberExportData(
  client: MemberExportClient,
  organizationId: string,
  memberId: string
): Promise<MemberExportData> {
  const member = await client.member.findFirst({
    where: { id: memberId, organizationId, deletedAt: null },
  });

  if (!member) {
    throw new HttpProblemError({
      status: 404,
      title: 'MEMBER_NOT_FOUND',
      detail: 'The requested member was not found for this organization.',
    });
  }

  const [assignments, payments, entryLines] = await Promise.all([
    client.memberFeeAssignment.findMany({
      where: { organizationId, memberId },
      include: { template: { select: { id: true, label: true } } },
      orderBy: [
        { dueDate: 'asc' },
        { createdAt: 'asc' },
      ],
    }),
    client.memberPayment.findMany({
      where: { organizationId, memberId },
      orderBy: [
        { dueDate: 'asc' },
        { createdAt: 'asc' },
      ],
    }),
    client.entryLine.findMany({
      where: { organizationId, memberId },
      include: {
        entry: {
          select: {
            id: true,
            date: true,
            reference: true,
            memo: true,
            journal: { select: { code: true, name: true } },
            fiscalYear: { select: { label: true } },
          },
        },
        account: { select: { code: true, name: true } },
      },
      orderBy: [
        { entry: { date: 'asc' } },
        { id: 'asc' },
      ],
    }),
  ]);

  return {
    member: {
      id: member.id,
      organizationId: member.organizationId,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      membershipType: member.membershipType,
      joinedAt: formatDateNullable(member.joinedAt),
      leftAt: formatDateNullable(member.leftAt),
      rgpdConsentAt: formatDateNullable(member.rgpdConsentAt),
      personalNotes: member.personalNotes ?? null,
      personalNotesRedactedAt: formatDateNullable(member.personalNotesRedactedAt),
      deletedAt: formatDateNullable(member.deletedAt),
      createdAt: member.createdAt.toISOString(),
      updatedAt: member.updatedAt.toISOString(),
    },
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      templateId: assignment.templateId,
      templateLabel: assignment.template.label,
      status: assignment.status,
      amount: assignment.amount.toFixed(2),
      currency: assignment.currency,
      periodStart: assignment.periodStart.toISOString(),
      periodEnd: formatDateNullable(assignment.periodEnd),
      dueDate: formatDateNullable(assignment.dueDate),
      autoAssigned: assignment.autoAssigned,
      entryId: assignment.entryId,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      assignmentId: payment.assignmentId,
      status: payment.status,
      amount: payment.amount.toFixed(2),
      currency: payment.currency,
      dueDate: formatDateNullable(payment.dueDate),
      paidAt: formatDateNullable(payment.paidAt),
      entryId: payment.entryId,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    })),
    entryLines: entryLines.map((line) => ({
      id: line.id,
      entryId: line.entryId,
      entryDate: line.entry.date.toISOString(),
      journalCode: line.entry.journal.code,
      journalName: line.entry.journal.name,
      fiscalYearLabel: line.entry.fiscalYear.label,
      reference: line.entry.reference ?? null,
      memo: line.entry.memo ?? null,
      accountCode: line.account.code,
      accountName: line.account.name,
      debit: line.debit.toFixed(2),
      credit: line.credit.toFixed(2),
    })),
  };
}

export function buildMemberExportFilename(data: MemberExportData, extension: string): string {
  const safeName = sanitizeFilename(`${data.member.lastName}-${data.member.firstName}`);
  const timestamp = new Date().toISOString().split('T')[0];
  return `member-${safeName || data.member.id}-${timestamp}.${extension}`;
}

export function buildMemberExportCsv(data: MemberExportData): string {
  const sections: string[][] = [];

  sections.push(['Section', 'Field', 'Value']);
  sections.push(['Member', 'ID', data.member.id]);
  sections.push(['Member', 'First Name', data.member.firstName]);
  sections.push(['Member', 'Last Name', data.member.lastName]);
  sections.push(['Member', 'Email', data.member.email]);
  sections.push(['Member', 'Membership Type', data.member.membershipType]);
  sections.push(['Member', 'Joined At', data.member.joinedAt ?? '']);
  sections.push(['Member', 'Left At', data.member.leftAt ?? '']);
  sections.push(['Member', 'RGPD Consent At', data.member.rgpdConsentAt ?? '']);
  sections.push(['Member', 'Personal Notes', data.member.personalNotes ?? '']);
  sections.push([
    'Member',
    'Personal Notes Redacted At',
    data.member.personalNotesRedactedAt ?? '',
  ]);
  sections.push(['Member', 'Created At', data.member.createdAt]);
  sections.push(['Member', 'Updated At', data.member.updatedAt]);

  if (data.assignments.length > 0) {
    sections.push([]);
    sections.push([
      'Section',
      'Assignment ID',
      'Template',
      'Status',
      'Amount',
      'Currency',
      'Period Start',
      'Period End',
      'Due Date',
      'Auto Assigned',
      'Entry ID',
    ]);

    for (const assignment of data.assignments) {
      sections.push([
        'Fee Assignment',
        assignment.id,
        assignment.templateLabel,
        assignment.status,
        assignment.amount,
        assignment.currency,
        assignment.periodStart,
        assignment.periodEnd ?? '',
        assignment.dueDate ?? '',
        assignment.autoAssigned ? 'true' : 'false',
        assignment.entryId ?? '',
      ]);
    }
  }

  if (data.payments.length > 0) {
    sections.push([]);
    sections.push([
      'Section',
      'Payment ID',
      'Assignment ID',
      'Status',
      'Amount',
      'Currency',
      'Due Date',
      'Paid At',
      'Entry ID',
    ]);

    for (const payment of data.payments) {
      sections.push([
        'Payment',
        payment.id,
        payment.assignmentId,
        payment.status,
        payment.amount,
        payment.currency,
        payment.dueDate ?? '',
        payment.paidAt ?? '',
        payment.entryId ?? '',
      ]);
    }
  }

  if (data.entryLines.length > 0) {
    sections.push([]);
    sections.push([
      'Section',
      'Entry ID',
      'Entry Date',
      'Journal Code',
      'Journal Name',
      'Fiscal Year',
      'Reference',
      'Memo',
      'Account Code',
      'Account Name',
      'Debit',
      'Credit',
    ]);

    for (const line of data.entryLines) {
      sections.push([
        'Entry Line',
        line.entryId,
        line.entryDate,
        line.journalCode,
        line.journalName,
        line.fiscalYearLabel,
        line.reference ?? '',
        line.memo ?? '',
        line.accountCode,
        line.accountName,
        line.debit,
        line.credit,
      ]);
    }
  }

  return sections
    .map((row) => row.map(escapeCsvValue).join(';'))
    .join('\n');
}

export async function generateMemberExportPdf(data: MemberExportData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Export membre ${data.member.firstName} ${data.member.lastName}`);
  pdf.setSubject('Export de données membre (RGPD)');
  pdf.setProducer('Association Management API');

  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 50;
  let cursorY = height - margin;

  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const fullName = `${data.member.firstName} ${data.member.lastName}`.trim();
  page.drawText('Export des données du membre', {
    x: margin,
    y: cursorY,
    size: 22,
    font: boldFont,
  });
  cursorY -= 30;

  page.drawText(fullName || data.member.email, {
    x: margin,
    y: cursorY,
    size: 16,
    font: regularFont,
  });
  cursorY -= 28;

  cursorY = drawDefinitionList(page, boldFont, regularFont, cursorY, margin, width, 'Profil', [
    ['Identifiant', data.member.id],
    ['Organisation', data.member.organizationId],
    ['Courriel', data.member.email],
    ['Type d\'adhésion', data.member.membershipType],
    ['Date d\'adhésion', formatDisplayDate(data.member.joinedAt)],
    ['Date de départ', formatDisplayDate(data.member.leftAt)],
    ['Consentement RGPD', formatDisplayDate(data.member.rgpdConsentAt)],
    ['Notes personnelles', data.member.personalNotes ?? 'Aucune'],
    [
      'Notes anonymisées le',
      data.member.personalNotesRedactedAt ? formatDisplayDate(data.member.personalNotesRedactedAt) : 'Jamais',
    ],
  ]);

  cursorY = drawListSection(
    page,
    boldFont,
    regularFont,
    cursorY - 16,
    margin,
    width,
    'Affectations de cotisations',
    data.assignments.length > 0
      ? data.assignments.map((assignment) => {
          const periodEnd = assignment.periodEnd ? formatDisplayDate(assignment.periodEnd) : '—';
          return `• ${formatDisplayDate(assignment.periodStart)} -> ${periodEnd} | ${assignment.templateLabel} | ${assignment.status} | ${assignment.amount} ${assignment.currency}`;
        })
      : ['Aucune affectation enregistrée']
  );

  cursorY = drawListSection(
    page,
    boldFont,
    regularFont,
    cursorY - 12,
    margin,
    width,
    'Paiements',
    data.payments.length > 0
      ? data.payments.map((payment) => {
          const parts = [
            `• ${payment.status}`,
            `${payment.amount} ${payment.currency}`,
            `échéance ${formatDisplayDate(payment.dueDate)}`,
          ];

          if (payment.paidAt) {
            parts.push(`payé le ${formatDisplayDate(payment.paidAt)}`);
          }

          return parts.join(' | ');
        })
      : ['Aucun paiement enregistré']
  );

  cursorY = drawListSection(
    page,
    boldFont,
    regularFont,
    cursorY - 12,
    margin,
    width,
    'Écritures comptables liées',
    data.entryLines.length > 0
      ? data.entryLines.map(
          (line) =>
            `• ${formatDisplayDate(line.entryDate)} | ${line.journalCode} ${line.journalName} | compte ${line.accountCode} ${line.accountName} | débit ${line.debit} / crédit ${line.credit}`
        )
      : ['Aucune ligne comptable associée']
  );

  cursorY -= 32;
  drawParagraph(
    page,
    regularFont,
    10,
    margin,
    cursorY,
    width - margin * 2,
    [
      'Export généré conformément au droit d\'accès et à la portabilité des données (RGPD).',
      'Conservez ce document pour vos registres internes ou transmettez-le au membre concerné.',
    ]
  );

  return pdf.save();
}

function drawDefinitionList(
  page: import('pdf-lib').PDFPage,
  boldFont: import('pdf-lib').PDFFont,
  regularFont: import('pdf-lib').PDFFont,
  startY: number,
  margin: number,
  pageWidth: number,
  title: string,
  rows: [string, string][],
): number {
  let cursorY = startY;

  page.drawText(title, {
    x: margin,
    y: cursorY,
    size: 14,
    font: boldFont,
  });
  cursorY -= 18;

  const labelWidth = 160;
  const lineHeight = 16;
  const maxValueWidth = pageWidth - margin * 2 - labelWidth - 12;

  for (const [label, rawValue] of rows) {
    const value = rawValue ?? '';
    const lines = wrapText(value, regularFont, 12, maxValueWidth);

    page.drawText(`${label} :`, {
      x: margin,
      y: cursorY,
      size: 12,
      font: boldFont,
    });

    for (const segment of lines) {
      page.drawText(segment, {
        x: margin + labelWidth,
        y: cursorY,
        size: 12,
        font: regularFont,
      });
      cursorY -= lineHeight;
    }

    cursorY -= 4;
  }

  return cursorY;
}

function drawListSection(
  page: import('pdf-lib').PDFPage,
  boldFont: import('pdf-lib').PDFFont,
  regularFont: import('pdf-lib').PDFFont,
  startY: number,
  margin: number,
  pageWidth: number,
  title: string,
  lines: string[],
): number {
  let cursorY = startY;

  page.drawText(title, {
    x: margin,
    y: cursorY,
    size: 14,
    font: boldFont,
  });
  cursorY -= 18;

  for (const line of lines) {
    const wrapped = wrapText(line, regularFont, 12, pageWidth - margin * 2);
    for (const segment of wrapped) {
      page.drawText(segment, {
        x: margin,
        y: cursorY,
        size: 12,
        font: regularFont,
      });
      cursorY -= 16;
    }
    cursorY -= 4;
  }

  return cursorY;
}

function drawParagraph(
  page: import('pdf-lib').PDFPage,
  font: import('pdf-lib').PDFFont,
  size: number,
  x: number,
  y: number,
  width: number,
  lines: string[],
): void {
  const lineHeight = size + 4;
  let cursorY = y;

  for (const line of lines) {
    const wrapped = wrapText(line, font, size, width);
    for (const segment of wrapped) {
      page.drawText(segment, {
        x,
        y: cursorY,
        size,
        font,
      });
      cursorY -= lineHeight;
    }
  }
}

function wrapText(text: string, font: import('pdf-lib').PDFFont, size: number, maxWidth: number): string[] {
  if (!text) {
    return [''];
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);

    if (width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
      }
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function escapeCsvValue(value: string): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (value.includes(';') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function formatDateNullable(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function formatDisplayDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().split('T')[0];
}
