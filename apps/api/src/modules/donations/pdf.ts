import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { Decimal } from '@prisma/client/runtime/library';
import { appendPdfComment } from '../../lib/pdf/comments';

export interface DonationReceiptDetails {
  organizationName: string;
  organizationId: string;
  fiscalYearLabel: string;
  receiptNumber: string;
  donorName: string;
  donorEmail?: string | null;
  donorAddress?: string | null;
  amount: Decimal;
  currency: string;
  receivedAt: Date;
  issuedAt: Date;
  entryReference?: string | null;
}

export async function generateDonationReceiptPdf(details: DonationReceiptDetails): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Reçu fiscal ${details.receiptNumber}`);
  pdf.setSubject('Reçu fiscal pour don');
  pdf.setProducer('Association Management API');

  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 50;
  let cursorY = height - margin;

  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText('Reçu fiscal de don', {
    x: margin,
    y: cursorY,
    size: 24,
    font: boldFont,
  });
  cursorY -= 36;

  drawParagraph(page, regularFont, 12, margin, cursorY, width - margin * 2, [
    `Association : ${details.organizationName}`,
    `Identifiant : ${details.organizationId}`,
    `Exercice : ${details.fiscalYearLabel}`,
  ]);
  cursorY -= 64;

  cursorY = drawSection(page, boldFont, regularFont, cursorY, margin, width, 'Informations sur le donateur', [
    ['Nom du donateur', details.donorName],
    ['Adresse électronique', details.donorEmail ?? 'Non renseignée'],
    ['Adresse postale', details.donorAddress ?? 'Non renseignée'],
  ]);

  const amountFormatter = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: details.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const dateFormatter = new Intl.DateTimeFormat('fr-FR');
  const amountText = amountFormatter.format(Number(details.amount.toFixed(2)));

  cursorY = drawSection(page, boldFont, regularFont, cursorY - 12, margin, width, 'Détails du don', [
    ['Numéro de reçu', details.receiptNumber],
    ['Date de réception', dateFormatter.format(details.receivedAt)],
    ['Date d\'émission', dateFormatter.format(details.issuedAt)],
    ['Montant', amountText],
    ['Référence d\'écriture', details.entryReference ?? 'Non renseignée'],
  ]);

  cursorY -= 24;
  drawParagraph(
    page,
    regularFont,
    11,
    margin,
    cursorY,
    width - margin * 2,
    [
      'Ce reçu atteste que le don a été perçu conformément aux dispositions fiscales en vigueur.',
      'Conservez ce document pour vos déclarations fiscales. Un contrôle peut nécessiter la présentation du reçu original.',
    ]
  );
  cursorY -= 64;

  drawParagraph(
    page,
    regularFont,
    10,
    margin,
    cursorY,
    width - margin * 2,
    [
      'Document généré par la plateforme comptable associative.',
      'Signature électronique : non requise - reçu validé par hachage SHA-256 stocké en base.',
    ]
  );

  const pdfBytes = await pdf.save();

  const receiptLabel = String.fromCharCode(0x52, 0x65, 0xE7, 0x75); // Reçu in Latin-1
  const commentParts = [
    `${receiptLabel} fiscal de don`,
    details.donorName,
    amountText.replace(/[^0-9,.-]/g, ''),
  ];

  return appendPdfComment(pdfBytes, `% Receipt summary: ${commentParts.join(' | ')}`, 'latin1');
}

function drawSection(
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
    const lines = wrapText(rawValue, regularFont, 12, maxValueWidth);

    page.drawText(`${label} :`, {
      x: margin,
      y: cursorY,
      size: 12,
      font: boldFont,
    });

    for (let index = 0; index < lines.length; index += 1) {
      const value = lines[index];
      page.drawText(value, {
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
