import type { jsPDF as JsPdfConstructor } from 'jspdf';

import type { LegalDocumentSection } from '../components/LegalDocumentPage.vue';

interface ExportOptions {
  title: string;
  description: string;
  lastUpdated: string;
  sections: LegalDocumentSection[];
  fileName: string;
}

const PAGE_MARGIN_X = 14;
const PAGE_MARGIN_TOP = 20;

export async function exportLegalDocumentToPdf(options: ExportOptions) {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageHeight = doc.internal.pageSize.getHeight();

  let cursorY = PAGE_MARGIN_TOP;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(options.title, PAGE_MARGIN_X, cursorY);

  cursorY += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  cursorY = writeWrappedText(doc, options.description, cursorY, 6);

  doc.setFontSize(10);
  doc.setTextColor(120);
  cursorY = writeWrappedText(doc, options.lastUpdated, cursorY + 2, 5);

  doc.setFontSize(12);
  doc.setTextColor(0);

  for (const section of options.sections) {
    cursorY = ensureSpace(doc, cursorY, 10, pageHeight);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(section.title, PAGE_MARGIN_X, cursorY);
    cursorY += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    for (const paragraph of section.paragraphs) {
      cursorY = ensureSpace(doc, cursorY, 8, pageHeight);
      cursorY = writeWrappedText(doc, paragraph, cursorY, 6);
      cursorY += 2;
    }
  }

  doc.save(options.fileName);
}

function ensureSpace(doc: InstanceType<JsPdfConstructor>, cursorY: number, minSpace: number, pageHeight: number) {
  if (cursorY + minSpace > pageHeight - PAGE_MARGIN_TOP) {
    doc.addPage();
    return PAGE_MARGIN_TOP;
  }
  return cursorY;
}

function writeWrappedText(
  doc: InstanceType<JsPdfConstructor>,
  text: string,
  cursorY: number,
  lineHeight: number,
) {
  const maxWidth = doc.internal.pageSize.getWidth() - PAGE_MARGIN_X * 2;
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, PAGE_MARGIN_X, cursorY);
  return cursorY + lines.length * lineHeight;
}
