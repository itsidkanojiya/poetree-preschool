import PDFDocument from 'pdfkit';
import type { FeeInvoiceDetail, InstallmentState } from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { FONT, fontFile, money, rupeesInWords, toBuffer } from '../lib/pdf.js';
import { drawLogo, INK, MUTED, tint, WHITE } from '../lib/pdfArt.js';
import { installmentState, schoolToday } from '../lib/feeSchedule.js';
import { studentName } from '../lib/names.js';
import { invoiceDetail } from './fee.service.js';
import { schoolBranding } from './printAssets.service.js';
import { schoolLetterhead } from './document.service.js';

/**
 * A fee invoice on A4: one installment, as the school issues it.
 *
 * Laid out the way an accountant reads one — who issued it, who it is for,
 * what it is for line by line, what is paid and what is owed — and the way a
 * parent does: the amount and the date are the largest things on the page.
 *
 * Everything on it is recorded data. No bank account, QR code or tax number
 * the school has not given is ever printed, and an invoice says "Invoice"
 * whatever its state: a receipt is a separate document, issued for a payment
 * that was actually recorded.
 */

const PAGE = { width: 595.28, height: 841.89 };
const SIDE = 40;
const WIDTH = PAGE.width - SIDE * 2;
/** Where content stops, leaving room for the footer. */
const BOTTOM = PAGE.height - 64;

const NAVY = '#1E2A5A';
const LINE = '#E3E7F0';
const SOFT = '#F5F7FB';

const STATE_STYLE: Record<InstallmentState, { label: string; color: string }> = {
  PAID: { label: 'Paid', color: '#1F9D55' },
  PARTIAL: { label: 'Partially paid', color: '#C2410C' },
  OVERDUE: { label: 'Overdue', color: '#DC2626' },
  DUE_TODAY: { label: 'Due today', color: '#DC2626' },
  DUE_SOON: { label: 'Due soon', color: '#B45309' },
  UPCOMING: { label: 'Upcoming', color: '#2563EB' },
  CANCELLED: { label: 'Cancelled', color: '#6B7280' },
};

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CARD: 'Card',
  ONLINE: 'Online',
};

const date = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export interface InvoiceArt {
  invoice: FeeInvoiceDetail;
  school: {
    name: string;
    addressLines: string[];
    phone: string | null;
    email: string | null;
    brand: string;
    logo: Buffer | null;
  };
  student: {
    name: string;
    admissionNo: string;
    classroom: string | null;
    guardians: string[];
  };
  year: { totalInPaise: number; paidInPaise: number };
  installments: Array<{
    label: string;
    dueDate: string;
    netInPaise: number;
    state: InstallmentState;
    current: boolean;
  }>;
}

/** The invoice for one installment, for the office or the child's own family. */
export async function feeInvoice(invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
  // Checks the caller may read it — a parent, only their own child's.
  const invoice = await invoiceDetail(invoiceId);

  const row = await prisma.feeInvoice.findFirstOrThrow({
    where: { id: invoiceId },
    select: {
      studentId: true,
      studentFeePlanId: true,
      student: {
        select: {
          firstName: true,
          middleName: true,
          lastName: true,
          admissionNo: true,
          enrolments: {
            where: { academicYearId: invoice.academicYearId },
            orderBy: { enrolledOn: 'desc' },
            take: 1,
            select: {
              classroom: { select: { section: true, classLevel: { select: { name: true } } } },
            },
          },
          guardians: {
            orderBy: { isPrimary: 'desc' },
            select: { parentProfile: { select: { user: { select: { name: true } } } } },
          },
        },
      },
    },
  });

  const [branding, letterhead, yearInvoices] = await Promise.all([
    schoolBranding(),
    schoolLetterhead(),
    prisma.feeInvoice.findMany({
      where: {
        studentId: row.studentId,
        academicYearId: invoice.academicYearId,
        status: { not: 'CANCELLED' },
      },
      orderBy: { dueDate: 'asc' },
      select: {
        id: true,
        periodLabel: true,
        dueDate: true,
        status: true,
        netInPaise: true,
        paidInPaise: true,
        studentFeePlanId: true,
      },
    }),
  ]);

  const today = schoolToday(new Date());
  const enrolment = row.student.enrolments[0];
  const art: InvoiceArt = {
    invoice,
    school: {
      name: branding.name,
      addressLines: [
        letterhead.addressLine1,
        letterhead.addressLine2,
        [letterhead.city, letterhead.state, letterhead.postalCode].filter(Boolean).join(', '),
      ].filter((line): line is string => Boolean(line && line.trim())),
      phone: letterhead.phone,
      email: letterhead.email,
      brand: /^#[0-9a-f]{6}$/i.test(branding.primaryColor) ? branding.primaryColor : NAVY,
      logo: branding.logo,
    },
    student: {
      name: studentName(row.student),
      admissionNo: row.student.admissionNo,
      classroom: enrolment
        ? `${enrolment.classroom.classLevel.name} — ${enrolment.classroom.section}`
        : null,
      guardians: row.student.guardians.map((g) => g.parentProfile.user.name),
    },
    year: {
      totalInPaise: yearInvoices.reduce((s, i) => s + i.netInPaise, 0),
      paidInPaise: yearInvoices.reduce((s, i) => s + i.paidInPaise, 0),
    },
    installments: row.studentFeePlanId
      ? yearInvoices
          .filter((i) => i.studentFeePlanId === row.studentFeePlanId)
          .map((i) => {
            const dueDate = i.dueDate.toISOString().slice(0, 10);
            return {
              label: i.periodLabel,
              dueDate,
              netInPaise: i.netInPaise,
              state: installmentState(
                { status: i.status, netInPaise: i.netInPaise, paidInPaise: i.paidInPaise, dueDate },
                today,
              ),
              current: i.id === invoice.id,
            };
          })
      : [],
  };

  const doc = invoiceDocument(`Invoice ${invoice.invoiceNo}`, branding.name);
  drawInvoice(doc, art);

  return {
    buffer: await toBuffer(doc),
    filename: `invoice-${invoice.invoiceNo}.pdf`,
  };
}

/** A4, with the fonts that carry the rupee sign, buffered for page numbers. */
export function invoiceDocument(title: string, author: string): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margin: SIDE,
    bufferPages: true,
    info: { Title: title, Author: author, Producer: 'Poetree Preschool Platform' },
  });
  doc.registerFont(FONT.regular, fontFile('Poppins-Regular.ttf') ?? 'Helvetica');
  doc.registerFont(FONT.bold, fontFile('Poppins-SemiBold.ttf') ?? 'Helvetica-Bold');
  return doc;
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                    */
/* -------------------------------------------------------------------------- */

export function drawInvoice(doc: PDFKit.PDFDocument, art: InvoiceArt): void {
  const { invoice, school } = art;
  const brand = school.brand;
  const state = STATE_STYLE[invoice.state];

  // --- The school, and what this is ------------------------------------------
  const logoSize = 54;
  const hasLogo = drawLogo(doc, school.logo, SIDE, SIDE, logoSize);
  const textX = hasLogo ? SIDE + logoSize + 14 : SIDE;
  const rightWidth = 170;
  const leftWidth = WIDTH - (textX - SIDE) - rightWidth - 16;

  doc.font(FONT.bold).fontSize(15).fillColor(INK);
  doc.text(school.name, textX, SIDE, { width: leftWidth });
  doc.font(FONT.regular).fontSize(8.5).fillColor(MUTED);
  for (const line of school.addressLines) doc.text(line, textX, doc.y + 1, { width: leftWidth });
  const contact = [school.phone, school.email].filter(Boolean).join('  ·  ');
  if (contact) doc.text(contact, textX, doc.y + 1, { width: leftWidth });
  const leftBottom = Math.max(doc.y, hasLogo ? SIDE + logoSize : SIDE);

  const rightX = PAGE.width - SIDE - rightWidth;
  doc.font(FONT.bold).fontSize(20).fillColor(brand);
  doc.text('INVOICE', rightX, SIDE - 2, { width: rightWidth, align: 'right', characterSpacing: 1 });
  doc.font(FONT.regular).fontSize(9).fillColor(MUTED);
  doc.text(invoice.invoiceNo, rightX, doc.y, { width: rightWidth, align: 'right' });
  chip(doc, state.label, state.color, PAGE.width - SIDE, doc.y + 6, 'right');
  const rightBottom = doc.y + 30;

  let y = Math.max(leftBottom, rightBottom) + 14;
  doc.rect(SIDE, y, WIDTH, 3).fill(brand);
  y += 18;

  // --- Billed to, and the invoice itself ---------------------------------------
  const cardWidth = (WIDTH - 14) / 2;
  const billedTo: Array<[string, string]> = [
    ['Admission no.', art.student.admissionNo],
    ['Class', art.student.classroom ?? '—'],
    ['Academic year', invoice.academicYearName],
  ];
  if (art.student.guardians.length > 0) {
    billedTo.push(['Parent / guardian', art.student.guardians.slice(0, 2).join(', ')]);
  }
  const details: Array<[string, string]> = [
    ['Invoice no.', invoice.invoiceNo],
    ['Issue date', date(invoice.issuedOn)],
    ['Due date', date(invoice.dueDate)],
    [
      'Installment',
      invoice.plan
        ? `${invoice.periodLabel} · ${invoice.plan.position} of ${invoice.plan.count} (${invoice.plan.name})`
        : invoice.periodLabel,
    ],
    ['Status', state.label],
  ];

  const leftHeight = infoCard(
    doc,
    SIDE,
    y,
    cardWidth,
    'Billed to',
    art.student.name,
    billedTo,
    true,
  );
  const rightHeight = infoCard(
    doc,
    SIDE + cardWidth + 14,
    y,
    cardWidth,
    'Invoice details',
    null,
    details,
    true,
  );
  const cardHeight = Math.max(leftHeight, rightHeight);
  infoCard(doc, SIDE, y, cardWidth, 'Billed to', art.student.name, billedTo, false, cardHeight);
  infoCard(
    doc,
    SIDE + cardWidth + 14,
    y,
    cardWidth,
    'Invoice details',
    null,
    details,
    false,
    cardHeight,
  );
  y += cardHeight + 22;

  // --- What it is for -----------------------------------------------------------
  y = heading(doc, 'Fee breakdown', y);
  const columns = [
    { header: 'Description', width: WIDTH - 90 - 90 - 100, align: 'left' as const },
    { header: 'Amount', width: 100, align: 'right' as const },
    { header: 'Discount', width: 90, align: 'right' as const },
    { header: 'Total', width: 90, align: 'right' as const },
  ];
  y = drawTable(
    doc,
    y,
    columns,
    invoice.lines.map((line) => [
      line.description,
      money(line.amountInPaise),
      line.discountInPaise > 0 ? `− ${money(line.discountInPaise)}` : '—',
      money(line.amountInPaise - line.discountInPaise),
    ]),
    brand,
    art,
  );

  // --- The totals, with the amount in words beside them --------------------------
  y = ensureSpace(doc, y + 14, 120, art);
  const totalsWidth = 230;
  const totalsX = PAGE.width - SIDE - totalsWidth;
  const totals: Array<[string, string, 'plain' | 'strong' | 'due']> = [
    ['Subtotal', money(invoice.grossInPaise), 'plain'],
  ];
  if (invoice.discountInPaise > 0) {
    totals.push(['Discounts', `− ${money(invoice.discountInPaise)}`, 'plain']);
  }
  totals.push(['Total payable', money(invoice.netInPaise), 'strong']);
  totals.push(['Amount paid', money(invoice.paidInPaise), 'plain']);
  totals.push(['Balance due', money(Math.max(invoice.outstandingInPaise, 0)), 'due']);

  let ty = y;
  for (const [label, value, kind] of totals) {
    if (kind === 'strong') {
      doc
        .moveTo(totalsX, ty)
        .lineTo(totalsX + totalsWidth, ty)
        .lineWidth(0.8)
        .strokeColor(LINE)
        .stroke();
      ty += 6;
    }
    if (kind === 'due') {
      const dueColor = invoice.outstandingInPaise > 0 ? state.color : STATE_STYLE.PAID.color;
      doc.roundedRect(totalsX, ty - 2, totalsWidth, 26, 6).fill(tint(dueColor, 0.9));
      doc.font(FONT.bold).fontSize(11).fillColor(dueColor);
      doc.text(label, totalsX + 10, ty + 5, { width: 110 });
      doc.text(value, totalsX + 10, ty + 5, { width: totalsWidth - 20, align: 'right' });
      ty += 30;
      continue;
    }
    const strong = kind === 'strong';
    doc
      .font(strong ? FONT.bold : FONT.regular)
      .fontSize(strong ? 11 : 9.5)
      .fillColor(strong ? INK : MUTED);
    doc.text(label, totalsX + 10, ty, { width: 120 });
    doc.font(strong ? FONT.bold : FONT.regular).fillColor(INK);
    doc.text(value, totalsX + 10, ty, { width: totalsWidth - 20, align: 'right' });
    ty += strong ? 20 : 17;
  }

  const wordsWidth = WIDTH - totalsWidth - 24;
  doc.font(FONT.regular).fontSize(7.5).fillColor(MUTED);
  doc.text('AMOUNT IN WORDS', SIDE, y, { width: wordsWidth, characterSpacing: 0.6 });
  doc.font(FONT.bold).fontSize(9).fillColor(INK);
  doc.text(rupeesInWords(invoice.netInPaise), SIDE, doc.y + 2, { width: wordsWidth });
  y = Math.max(ty, doc.y) + 18;

  // --- The year, and the plan ------------------------------------------------------
  y = ensureSpace(doc, y, 90, art);
  y = heading(doc, `Payment summary — ${invoice.academicYearName}`, y);
  const stats: Array<[string, number, string]> = [
    ['Total fee billed', art.year.totalInPaise, INK],
    ['Paid', art.year.paidInPaise, STATE_STYLE.PAID.color],
    [
      'Outstanding',
      Math.max(art.year.totalInPaise - art.year.paidInPaise, 0),
      art.year.totalInPaise - art.year.paidInPaise > 0 ? STATE_STYLE.OVERDUE.color : INK,
    ],
  ];
  const statWidth = (WIDTH - 20) / 3;
  stats.forEach(([label, value, color], index) => {
    const x = SIDE + index * (statWidth + 10);
    doc.roundedRect(x, y, statWidth, 50, 8).fill(SOFT);
    doc
      .font(FONT.regular)
      .fontSize(8)
      .fillColor(MUTED)
      .text(label, x + 12, y + 9, { width: statWidth - 24 });
    doc
      .font(FONT.bold)
      .fontSize(13)
      .fillColor(color)
      .text(money(value), x + 12, y + 23, { width: statWidth - 24 });
  });
  y += 62;

  if (art.installments.length > 0 && invoice.plan) {
    y = ensureSpace(doc, y, 60, art);
    doc.font(FONT.bold).fontSize(9.5).fillColor(INK);
    doc.text(`${invoice.plan.name} plan — ${art.installments.length} installments`, SIDE, y);
    y = doc.y + 6;
    y = drawTable(
      doc,
      y,
      [
        { header: 'Installment', width: WIDTH - 110 - 110 - 110, align: 'left' },
        { header: 'Due date', width: 110, align: 'left' },
        { header: 'Amount', width: 110, align: 'right' },
        { header: 'Status', width: 110, align: 'right' },
      ],
      art.installments.map((i) => [
        i.current ? `${i.label}  (this invoice)` : i.label,
        date(i.dueDate),
        money(i.netInPaise),
        STATE_STYLE[i.state].label,
      ]),
      brand,
      art,
      { compact: true },
    );
    y += 10;
  }

  // --- Money actually received ------------------------------------------------------
  y = ensureSpace(doc, y + 8, 70, art);
  y = heading(doc, 'Payment history', y);
  if (invoice.payments.length === 0) {
    doc.roundedRect(SIDE, y, WIDTH, 34, 8).fill(SOFT);
    doc.font(FONT.regular).fontSize(9).fillColor(MUTED);
    doc.text('No payments have been recorded against this invoice yet.', SIDE + 14, y + 11, {
      width: WIDTH - 28,
    });
    y += 46;
  } else {
    y = drawTable(
      doc,
      y,
      [
        { header: 'Receipt no.', width: 110, align: 'left' },
        { header: 'Date', width: 95, align: 'left' },
        { header: 'Method', width: 90, align: 'left' },
        { header: 'Reference', width: WIDTH - 110 - 95 - 90 - 100, align: 'left' },
        { header: 'Amount', width: 100, align: 'right' },
      ],
      invoice.payments.map((p) => [
        p.receiptNo,
        date(p.paidOn),
        METHOD_LABELS[p.method] ?? p.method,
        p.reference ?? '—',
        `${money(p.amountInPaise)}${p.status === 'REFUNDED' ? ' (refunded)' : ''}`,
      ]),
      brand,
      art,
    );
    y += 10;
  }

  // --- How to pay ---------------------------------------------------------------------
  y = ensureSpace(doc, y + 6, 70, art);
  const paidInFull = invoice.outstandingInPaise <= 0 && invoice.state !== 'CANCELLED';
  const office = [school.phone, school.email].filter(Boolean).join(' or ');
  const notes = [
    paidInFull
      ? 'This invoice is paid in full. A receipt was issued for each payment recorded above.'
      : `Please pay the balance due by ${date(invoice.dueDate)} at the school office and keep the receipt you are given.`,
    'This document is an invoice, not a receipt. A receipt is issued for every payment the school records.',
    office
      ? `Questions about this invoice: contact the school office at ${office}.`
      : 'Questions about this invoice: contact the school office.',
  ];
  doc.font(FONT.bold).fontSize(8.5).fillColor(INK).text('Notes', SIDE, y);
  doc.font(FONT.regular).fontSize(8.5).fillColor(MUTED);
  for (const note of notes) doc.text(`•  ${note}`, SIDE, doc.y + 3, { width: WIDTH });

  // --- Footers, now the page count is known ----------------------------------------
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    // Below the bottom margin on purpose; without this PDFKit would take the
    // footer for overflow and start a new page for it.
    doc.page.margins.bottom = 0;
    const fy = PAGE.height - 44;
    doc
      .moveTo(SIDE, fy)
      .lineTo(PAGE.width - SIDE, fy)
      .lineWidth(0.6)
      .strokeColor(LINE)
      .stroke();
    doc.font(FONT.regular).fontSize(7.5).fillColor(MUTED);
    doc.text(
      [school.name, school.phone, school.email].filter(Boolean).join('  ·  '),
      SIDE,
      fy + 8,
      {
        width: WIDTH - 90,
        lineBreak: false,
        ellipsis: true,
      },
    );
    doc.text(`Page ${i + 1} of ${range.count}`, PAGE.width - SIDE - 90, fy + 8, {
      width: 90,
      align: 'right',
      lineBreak: false,
    });
  }
}

/** A rounded status pill, its text in the state's colour on a pale wash. */
function chip(
  doc: PDFKit.PDFDocument,
  text: string,
  color: string,
  x: number,
  y: number,
  anchor: 'left' | 'right',
): void {
  doc.font(FONT.bold).fontSize(9);
  const width = doc.widthOfString(text) + 22;
  const left = anchor === 'right' ? x - width : x;
  doc.roundedRect(left, y, width, 20, 10).fill(tint(color, 0.88));
  doc.fillColor(color).text(text, left, y + 4.5, { width, align: 'center', lineBreak: false });
}

/** A section heading with a short accent underline. */
function heading(doc: PDFKit.PDFDocument, text: string, y: number): number {
  doc.font(FONT.bold).fontSize(11).fillColor(NAVY).text(text, SIDE, y);
  return doc.y + 6;
}

/**
 * A soft card of label–value rows. Measures itself on a first pass
 * (draw = false) so two cards side by side can share the taller height.
 */
function infoCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  name: string | null,
  rows: Array<[string, string]>,
  measureOnly: boolean,
  height?: number,
): number {
  const pad = 14;
  const inner = width - pad * 2;
  const labelWidth = 92;

  let used = pad + 12;
  doc.font(FONT.bold).fontSize(12);
  if (name) used += doc.heightOfString(name, { width: inner }) + 6;
  doc.font(FONT.regular).fontSize(9);
  for (const [, value] of rows)
    used += Math.max(doc.heightOfString(value, { width: inner - labelWidth }), 12) + 5;
  used += pad - 5;
  if (measureOnly) return used;

  doc.roundedRect(x, y, width, height ?? used, 10).fill(SOFT);
  doc.font(FONT.regular).fontSize(7.5).fillColor(MUTED);
  doc.text(title.toUpperCase(), x + pad, y + pad, { width: inner, characterSpacing: 0.8 });
  let cy = y + pad + 12;
  if (name) {
    doc
      .font(FONT.bold)
      .fontSize(12)
      .fillColor(INK)
      .text(name, x + pad, cy, { width: inner });
    cy = doc.y + 6;
  }
  for (const [label, value] of rows) {
    doc
      .font(FONT.regular)
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(label, x + pad, cy, { width: labelWidth });
    doc.font(FONT.bold).fontSize(9).fillColor(INK);
    const h = Math.max(doc.heightOfString(value, { width: inner - labelWidth }), 12);
    doc.text(value, x + pad + labelWidth, cy, { width: inner - labelWidth });
    cy += h + 5;
  }
  return used;
}

/** Starts a new page when what comes next would not fit on this one. */
function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number, art: InvoiceArt): number {
  if (y + needed <= BOTTOM) return y;
  doc.addPage();
  doc.font(FONT.bold).fontSize(9).fillColor(MUTED);
  doc.text(`Invoice ${art.invoice.invoiceNo} — ${art.student.name} (continued)`, SIDE, SIDE, {
    width: WIDTH,
  });
  return SIDE + 24;
}

interface Column {
  header: string;
  width: number;
  align: 'left' | 'right';
}

/**
 * A table whose heading row is repeated at the top of every page it runs
 * onto, with rows tall enough for whatever wraps in them.
 */
function drawTable(
  doc: PDFKit.PDFDocument,
  startY: number,
  columns: Column[],
  rows: string[][],
  brand: string,
  art: InvoiceArt,
  options: { compact?: boolean } = {},
): number {
  const size = options.compact ? 8.5 : 9;
  const padX = 10;
  const headerHeight = 22;

  const drawHeader = (y: number) => {
    doc.roundedRect(SIDE, y, WIDTH, headerHeight, 6).fill(brand);
    let x = SIDE;
    doc.font(FONT.bold).fontSize(8).fillColor(WHITE);
    for (const column of columns) {
      doc.text(column.header, x + padX, y + 7, {
        width: column.width - padX * 2,
        align: column.align,
        lineBreak: false,
      });
      x += column.width;
    }
    return y + headerHeight;
  };

  let y = ensureSpace(doc, startY, headerHeight + 24, art);
  y = drawHeader(y);

  rows.forEach((cells, index) => {
    // Measured in the face each cell is drawn in: the first column is bold,
    // and bold wraps sooner.
    const height =
      Math.max(
        ...cells.map((cell, c) =>
          doc
            .font(c === 0 ? FONT.bold : FONT.regular)
            .fontSize(size)
            .heightOfString(cell, { width: columns[c]!.width - padX * 2 }),
        ),
      ) + (options.compact ? 10 : 13);

    if (y + height > BOTTOM) {
      y = ensureSpace(doc, y, BOTTOM, art);
      y = drawHeader(y);
    }

    if (index % 2 === 1) doc.rect(SIDE, y, WIDTH, height).fill(tint(brand, 0.95));
    let x = SIDE;
    cells.forEach((cell, c) => {
      const column = columns[c]!;
      doc
        .font(c === 0 ? FONT.bold : FONT.regular)
        .fontSize(size)
        .fillColor(INK)
        .text(cell, x + padX, y + (options.compact ? 5 : 6.5), {
          width: column.width - padX * 2,
          align: column.align,
        });
      x += column.width;
    });
    y += height;
    doc
      .moveTo(SIDE, y)
      .lineTo(SIDE + WIDTH, y)
      .lineWidth(0.5)
      .strokeColor(LINE)
      .stroke();
  });

  return y;
}
