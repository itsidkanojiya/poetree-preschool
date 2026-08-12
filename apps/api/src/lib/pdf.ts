import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import type PDFKit from 'pdfkit';

const require = createRequire(import.meta.url);
// pdfkit is CommonJS and its ESM interop is unreliable across bundlers, so it
// is required rather than imported.
const PDFDocument = require('pdfkit') as typeof PDFKit;

/**
 * Server-side PDF, for the documents a school hands to a parent.
 *
 * PDFKit rather than a headless browser. Puppeteer would let us reuse the web
 * templates, but it means shipping Chromium onto a two-core box shared with
 * three other production projects, and a receipt is not worth 300 MB of
 * resident memory per render.
 *
 * These are financial documents: a receipt must be reproducible years later
 * exactly as issued, so everything here renders from stored rows and nothing
 * is recomputed at print time.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolved at call time rather than module load, because the layout differs
 * between `src` under tsx and `dist` after a build.
 */
function fontFile(name: string): string | null {
  const candidates = [
    path.resolve(HERE, '../../assets/fonts', name),
    path.resolve(HERE, '../../../assets/fonts', name),
    path.resolve(process.cwd(), 'assets/fonts', name),
    path.resolve(process.cwd(), 'apps/api/assets/fonts', name),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export const FONT = { regular: 'body', bold: 'heading' } as const;

/** Ink, kept sober — this is a document, not a screen. */
const INK = '#1A1D29';
const MUTED = '#6B7280';
const RULE = '#D9D5CE';

export interface Letterhead {
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Rupees from paise, with the symbol.
 *
 * The symbol is why the fonts below are embedded at all: PDF's built-in
 * Helvetica has no U+20B9, so every amount on a receipt would have printed a
 * blank box where the currency belongs.
 */
export function money(paise: number): string {
  const negative = paise < 0;
  const rupees = Math.abs(paise) / 100;
  const formatted = rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${negative ? '-' : ''}₹${formatted}`;
}

export function longDate(value: Date): string {
  return value.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Words, because a cheque-style receipt is expected to carry them. */
export function rupeesInWords(paise: number): string {
  const whole = Math.floor(Math.abs(paise) / 100);
  const paisePart = Math.abs(paise) % 100;

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const one = (n: number): string => ones[n] ?? '';
  const ten = (n: number): string => tens[n] ?? '';

  const upTo99 = (n: number): string =>
    n < 20 ? one(n) : `${ten(Math.floor(n / 10))}${n % 10 ? ` ${one(n % 10)}` : ''}`;

  const upTo999 = (n: number): string =>
    n < 100
      ? upTo99(n)
      : `${one(Math.floor(n / 100))} Hundred${n % 100 ? ` ${upTo99(n % 100)}` : ''}`;

  // Indian grouping: crore, lakh, thousand — not millions.
  const parts: string[] = [];
  let rest = whole;
  const crore = Math.floor(rest / 10_000_000);
  rest %= 10_000_000;
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;

  if (crore) parts.push(`${upTo999(crore)} Crore`);
  if (lakh) parts.push(`${upTo999(lakh)} Lakh`);
  if (thousand) parts.push(`${upTo999(thousand)} Thousand`);
  if (rest) parts.push(upTo999(rest));

  const rupeeWords = parts.length > 0 ? parts.join(' ') : 'Zero';
  const paiseWords = paisePart > 0 ? ` and ${upTo99(paisePart)} Paise` : '';
  return `${rupeeWords} Rupees${paiseWords} only`;
}

export function createDocument(title: string): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 46,
    info: { Title: title, Producer: 'Poetree Preschool Platform' },
  });

  // Embedded so the rupee sign renders and the document looks like the rest of
  // the product. Falls back to Helvetica if the files are missing rather than
  // throwing — a receipt in the wrong typeface beats no receipt.
  const regular = fontFile('Poppins-Regular.ttf');
  const bold = fontFile('Poppins-SemiBold.ttf');

  doc.registerFont(FONT.regular, regular ?? 'Helvetica');
  doc.registerFont(FONT.bold, bold ?? 'Helvetica-Bold');
  doc.font(FONT.regular).fillColor(INK);

  return doc;
}

/** The school's own name and address at the top of everything it issues. */
export function letterhead(
  doc: PDFKit.PDFDocument,
  school: Letterhead,
  documentTitle: string,
): void {
  doc.font(FONT.bold).fontSize(17).fillColor(INK).text(school.name, { align: 'left' });

  const address = [
    [school.addressLine1, school.addressLine2].filter(Boolean).join(', '),
    [school.city, school.state, school.postalCode].filter(Boolean).join(' '),
    [school.phone, school.email].filter(Boolean).join('  ·  '),
  ].filter((line) => line.length > 0);

  doc.font(FONT.regular).fontSize(9).fillColor(MUTED);
  for (const line of address) doc.text(line);

  doc.moveDown(0.9);
  rule(doc);
  doc.moveDown(0.7);

  doc
    .font(FONT.bold)
    .fontSize(13)
    .fillColor(INK)
    .text(documentTitle.toUpperCase(), { characterSpacing: 1.1 });
  doc.moveDown(0.6);
}

export function rule(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc
    .save()
    .strokeColor(RULE)
    .lineWidth(1)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke()
    .restore();
  doc.y = y + 1;
}

/** A label and its value, side by side, as a form would set them. */
export function field(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  options: { x?: number; width?: number } = {},
): void {
  const x = options.x ?? doc.page.margins.left;
  const width = options.width ?? 240;
  const top = doc.y;

  doc.font(FONT.regular).fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, top, {
    width,
    characterSpacing: 0.6,
  });
  doc.font(FONT.bold).fontSize(11).fillColor(INK).text(value, x, doc.y + 1, { width });
}

/** A simple table. Columns are fixed widths so figures line up down the page. */
export function table(
  doc: PDFKit.PDFDocument,
  columns: Array<{ header: string; width: number; align?: 'left' | 'right' }>,
  rows: string[][],
): void {
  const left = doc.page.margins.left;
  let y = doc.y;

  doc.font(FONT.bold).fontSize(8).fillColor(MUTED);
  let x = left;
  for (const column of columns) {
    doc.text(column.header.toUpperCase(), x, y, {
      width: column.width,
      align: column.align ?? 'left',
      characterSpacing: 0.6,
    });
    x += column.width;
  }

  doc.y = y + 14;
  rule(doc);
  doc.y += 6;

  doc.font(FONT.regular).fontSize(10).fillColor(INK);
  for (const row of rows) {
    y = doc.y;
    x = left;

    // Measure the tallest cell first so a wrapped description does not have
    // the next column printed through it.
    let height = 0;
    row.forEach((cell, i) => {
      const column = columns[i];
      if (!column) return;
      const h = doc.heightOfString(cell, { width: column.width - 8 });
      if (h > height) height = h;
    });

    row.forEach((cell, i) => {
      const column = columns[i];
      if (!column) return;
      doc.text(cell, x, y, {
        width: column.width - 8,
        align: column.align ?? 'left',
      });
      x += column.width;
    });

    doc.y = y + height + 7;
  }
}

export function footer(doc: PDFKit.PDFDocument, note: string): void {
  const y = doc.page.height - doc.page.margins.bottom - 24;
  doc
    .font(FONT.regular)
    .fontSize(8)
    .fillColor(MUTED)
    .text(note, doc.page.margins.left, y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'center',
    });
}

/** Collects a finished document, so it can be sent or archived. */
export function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
