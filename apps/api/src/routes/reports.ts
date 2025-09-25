import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { HttpProblemError } from '../lib/problem-details';
import {
  getJournalReport,
  generateFecReport,
  getIncomeStatementReport,
  getLedgerReport,
  getTrialBalanceReport,
  type JournalReport,
  type IncomeStatementReport,
  type LedgerReport,
  type TrialBalanceReport,
} from '../modules/accounting/reports';

const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

const reportQuerySchema = z.object({
  fiscalYearId: z.string().uuid(),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
  watermark: z.enum(['none', 'copy']).default('none'),
});

const fecQuerySchema = z.object({
  fiscalYearId: z.string().uuid(),
});

const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  const requireReportRole = fastify.authorizeRoles(
    UserRole.ADMIN,
    UserRole.TREASURER,
    UserRole.SECRETARY,
    UserRole.VIEWER
  );
  const requireFecRole = fastify.authorizeRoles(UserRole.ADMIN, UserRole.TREASURER);

  fastify.get(
    '/orgs/:orgId/reports/journal',
    { preHandler: requireReportRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      const query = reportQuerySchema.parse(request.query);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const report = await getJournalReport(request.prisma, orgId, query.fiscalYearId);

      if (query.format === 'json') {
        return { data: report };
      }

      if (query.format === 'csv') {
        const csv = formatJournalCsv(report);
        reply
          .type('text/csv; charset=utf-8')
          .header(
            'Content-Disposition',
            `attachment; filename="journal-${report.fiscalYear.label}.csv"`
          )
          .send(csv);
        return;
      }

      const watermarkText = query.watermark === 'copy' ? 'Copy' : undefined;
      const pdf = await formatJournalPdf(report, { watermarkText });
      reply
        .type('application/pdf')
        .header(
          'Content-Disposition',
          `attachment; filename="journal-${report.fiscalYear.label}.pdf"`
        )
        .send(Buffer.from(pdf));
    }
  );

  fastify.get(
    '/orgs/:orgId/reports/balance',
    { preHandler: requireReportRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      const query = reportQuerySchema.parse(request.query);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const report = await getTrialBalanceReport(request.prisma, orgId, query.fiscalYearId);

      if (query.format === 'json') {
        return { data: report };
      }

      if (query.format === 'csv') {
        const csv = formatTrialBalanceCsv(report);
        reply
          .type('text/csv; charset=utf-8')
          .header(
            'Content-Disposition',
            `attachment; filename="trial-balance-${report.fiscalYear.label}.csv"`
          )
          .send(csv);
        return;
      }

      const watermarkText = query.watermark === 'copy' ? 'Copy' : undefined;
      const pdf = await formatTrialBalancePdf(report, { watermarkText });
      reply
        .type('application/pdf')
        .header(
          'Content-Disposition',
          `attachment; filename="trial-balance-${report.fiscalYear.label}.pdf"`
        )
        .send(Buffer.from(pdf));
    }
  );

  fastify.get(
    '/orgs/:orgId/reports/ledger',
    { preHandler: requireReportRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      const query = reportQuerySchema.parse(request.query);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const report = await getLedgerReport(request.prisma, orgId, query.fiscalYearId);

      if (query.format === 'json') {
        return { data: report };
      }

      if (query.format === 'csv') {
        const csv = formatLedgerCsv(report);
        reply
          .type('text/csv; charset=utf-8')
          .header(
            'Content-Disposition',
            `attachment; filename="general-ledger-${report.fiscalYear.label}.csv"`
          )
          .send(csv);
        return;
      }

      const watermarkText = query.watermark === 'copy' ? 'Copy' : undefined;
      const pdf = await formatLedgerPdf(report, { watermarkText });
      reply
        .type('application/pdf')
        .header(
          'Content-Disposition',
          `attachment; filename="general-ledger-${report.fiscalYear.label}.pdf"`
        )
        .send(Buffer.from(pdf));
    }
  );

  fastify.get(
    '/orgs/:orgId/reports/income',
    { preHandler: requireReportRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      const query = reportQuerySchema.parse(request.query);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const report = await getIncomeStatementReport(request.prisma, orgId, query.fiscalYearId);

      if (query.format === 'json') {
        return { data: report };
      }

      if (query.format === 'csv') {
        const csv = formatIncomeStatementCsv(report);
        reply
          .type('text/csv; charset=utf-8')
          .header(
            'Content-Disposition',
            `attachment; filename="income-statement-${report.fiscalYear.label}.csv"`
          )
          .send(csv);
        return;
      }

      const watermarkText = query.watermark === 'copy' ? 'Copy' : undefined;
      const pdf = await formatIncomeStatementPdf(report, { watermarkText });
      reply
        .type('application/pdf')
        .header(
          'Content-Disposition',
          `attachment; filename="income-statement-${report.fiscalYear.label}.pdf"`
        )
        .send(Buffer.from(pdf));
    }
  );

  fastify.get(
    '/orgs/:orgId/reports/fec',
    { preHandler: requireFecRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      const query = fecQuerySchema.parse(request.query);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const report = await generateFecReport(request.prisma, orgId, query.fiscalYearId);

      reply
        .type('text/csv; charset=utf-8')
        .header(
          'Content-Disposition',
          `attachment; filename="FEC_${orgId}_${report.fiscalYear.label}.csv"`
        )
        .header('x-report-checksum', report.checksum)
        .send(report.csv);
    }
  );
};

function ensureOrganizationAccess(userOrgId: string | undefined, orgId: string): void {
  if (!userOrgId) {
    throw new HttpProblemError({
      status: 401,
      title: 'UNAUTHORIZED',
      detail: 'Authentication is required.',
    });
  }

  if (userOrgId !== orgId) {
    throw new HttpProblemError({
      status: 403,
      title: 'FORBIDDEN_ORGANIZATION_ACCESS',
      detail: 'You do not have access to this organization.',
    });
  }
}

function formatTrialBalanceCsv(report: TrialBalanceReport): string {
  const header = 'Account Code;Account Name;Debit;Credit;Balance';
  const lines = report.lines.map((line) =>
    [
      line.code,
      line.name,
      formatAmount(line.debit),
      formatAmount(line.credit),
      formatAmount(line.balance),
    ].join(';')
  );
  lines.push(
    ['TOTAL', '', formatAmount(report.totals.debit), formatAmount(report.totals.credit), formatAmount(report.totals.balance)].join(';')
  );
  return [header, ...lines].join('\n');
}

function formatJournalCsv(report: JournalReport): string {
  const header = 'Date;Journal;Reference;Memo;Account Code;Account Name;Debit;Credit';
  const rows: string[] = [];

  for (const entry of report.entries) {
    for (const line of entry.lines) {
      rows.push(
        [
          entry.date,
          `${entry.journal.code} - ${entry.journal.name}`,
          entry.reference ?? '',
          entry.memo ?? '',
          line.accountCode,
          line.accountName,
          formatAmount(line.debit),
          formatAmount(line.credit),
        ].join(';')
      );
    }

    rows.push(
      [
        entry.date,
        `${entry.journal.code} - ${entry.journal.name}`,
        entry.reference ?? '',
        entry.memo ? `${entry.memo} (Total)` : 'Total',
        '',
        '',
        formatAmount(entry.totals.debit),
        formatAmount(entry.totals.credit),
      ].join(';')
    );
  }

  rows.push(
    [
      '',
      'TOTAL',
      '',
      '',
      '',
      '',
      formatAmount(report.totals.debit),
      formatAmount(report.totals.credit),
    ].join(';')
  );

  return [header, ...rows].join('\n');
}

async function formatTrialBalancePdf(
  report: TrialBalanceReport,
  options: PdfFormatOptions = {}
): Promise<Uint8Array> {
  const rows = report.lines.map((line) => [
    line.code,
    line.name,
    formatAmount(line.debit),
    formatAmount(line.credit),
    formatAmount(line.balance),
  ]);
  rows.push([
    'TOTAL',
    '',
    formatAmount(report.totals.debit),
    formatAmount(report.totals.credit),
    formatAmount(report.totals.balance),
  ]);
  return createTablePdf(
    `Trial Balance - ${report.fiscalYear.label}`,
    ['Code', 'Name', 'Debit', 'Credit', 'Balance'],
    rows,
    options
  );
}

async function formatJournalPdf(
  report: JournalReport,
  options: PdfFormatOptions = {}
): Promise<Uint8Array> {
  const rows: string[][] = [];

  for (const entry of report.entries) {
    rows.push([
      entry.date,
      `${entry.journal.code} - ${entry.journal.name}`,
      entry.reference ?? '',
      entry.memo ?? '',
      '',
      '',
      '',
      '',
    ]);

    for (const line of entry.lines) {
      rows.push([
        '',
        '',
        '',
        '',
        `${line.accountCode} - ${line.accountName}`,
        formatAmount(line.debit),
        formatAmount(line.credit),
        '',
      ]);
    }

    rows.push([
      '',
      '',
      '',
      'Total',
      '',
      formatAmount(entry.totals.debit),
      formatAmount(entry.totals.credit),
      '',
    ]);
  }

  rows.push([
    '',
    'TOTAL',
    '',
    '',
    '',
    formatAmount(report.totals.debit),
    formatAmount(report.totals.credit),
    '',
  ]);

  return createTablePdf(
    `Journal - ${report.fiscalYear.label}`,
    ['Date', 'Journal', 'Reference', 'Memo', 'Account', 'Debit', 'Credit', ''],
    rows,
    options
  );
}

function formatLedgerCsv(report: LedgerReport): string {
  const header = 'Account Code;Account Name;Date;Journal;Reference;Memo;Debit;Credit;Balance';
  const rows: string[] = [];
  for (const account of report.accounts) {
    for (const movement of account.movements) {
      rows.push(
        [
          account.code,
          account.name,
          movement.date,
          `${movement.journalCode} - ${movement.journalName}`,
          movement.reference ?? '',
          movement.memo ?? '',
          formatAmount(movement.debit),
          formatAmount(movement.credit),
          formatAmount(movement.balance),
        ].join(';')
      );
    }
  }
  return [header, ...rows].join('\n');
}

async function formatLedgerPdf(report: LedgerReport, options: PdfFormatOptions = {}): Promise<Uint8Array> {
  const rows: string[][] = [];
  for (const account of report.accounts) {
    rows.push([`${account.code} - ${account.name}`, '', '', '', '', '', '', '', '']);
    for (const movement of account.movements) {
      rows.push([
        account.code,
        movement.date,
        `${movement.journalCode} - ${movement.journalName}`,
        movement.reference ?? '',
        movement.memo ?? '',
        formatAmount(movement.debit),
        formatAmount(movement.credit),
        formatAmount(movement.balance),
        '',
      ]);
    }
  }
  return createTablePdf(
    `General Ledger - ${report.fiscalYear.label}`,
    ['Account', 'Date', 'Journal', 'Reference', 'Memo', 'Debit', 'Credit', 'Balance', ''],
    rows,
    options
  );
}

function formatIncomeStatementCsv(report: IncomeStatementReport): string {
  const header = 'Account Code;Account Name;Type;Debit;Credit;Balance;Result';
  const rows = report.rows.map((row) =>
    [
      row.code,
      row.name,
      row.type,
      formatAmount(row.debit),
      formatAmount(row.credit),
      formatAmount(row.balance),
      formatAmount(row.result),
    ].join(';')
  );
  rows.push(['TOTAL_REVENUE', '', '', '', '', '', formatAmount(report.totals.revenue)].join(';'));
  rows.push(['TOTAL_EXPENSE', '', '', '', '', '', formatAmount(report.totals.expense)].join(';'));
  rows.push(['NET_RESULT', '', '', '', '', '', formatAmount(report.totals.net)].join(';'));
  return [header, ...rows].join('\n');
}

async function formatIncomeStatementPdf(
  report: IncomeStatementReport,
  options: PdfFormatOptions = {}
): Promise<Uint8Array> {
  const rows = report.rows.map((row) => [
    row.code,
    row.name,
    row.type,
    formatAmount(row.debit),
    formatAmount(row.credit),
    formatAmount(row.balance),
    formatAmount(row.result),
  ]);
  rows.push(['TOTAL_REVENUE', '', '', '', '', '', formatAmount(report.totals.revenue)]);
  rows.push(['TOTAL_EXPENSE', '', '', '', '', '', formatAmount(report.totals.expense)]);
  rows.push(['NET_RESULT', '', '', '', '', '', formatAmount(report.totals.net)]);
  return createTablePdf(
    `Income Statement - ${report.fiscalYear.label}`,
    ['Code', 'Name', 'Type', 'Debit', 'Credit', 'Balance', 'Result'],
    rows,
    options
  );
}

async function createTablePdf(
  title: string,
  headers: string[],
  rows: string[][],
  options: PdfFormatOptions = {}
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const watermarkFont = options.watermarkText ? await document.embedFont(StandardFonts.HelveticaBold) : null;
  let page = document.addPage();
  const margin = 40;
  let y = page.getHeight() - margin;

  const drawText = (text: string, size = 12) => {
    page.drawText(text, { x: margin, y, size, font });
    y -= size + 4;
  };

  drawText(title, 16);
  drawText(headers.join(' | '), 10);

  for (const row of rows) {
    if (y <= margin) {
      page = document.addPage();
      y = page.getHeight() - margin;
      drawText(headers.join(' | '), 10);
    }

    drawText(row.join(' | '), 10);
  }

  if (options.watermarkText && watermarkFont) {
    applyWatermark(document, options.watermarkText, watermarkFont);
  }

  return document.save();
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

interface PdfFormatOptions {
  watermarkText?: string;
}

function applyWatermark(document: PDFDocument, text: string, font: import('pdf-lib').PDFFont): void {
  const pages = document.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    const fontSize = Math.min(width, height) / 6;
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const x = (width - textWidth) / 2;
    const y = height / 2;

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.85, 0.2, 0.2),
      rotate: degrees(45),
      opacity: 0.15,
    });
  }
}

export default reportsRoutes;
