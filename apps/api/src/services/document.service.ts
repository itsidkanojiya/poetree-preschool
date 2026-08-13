import { prisma } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { assertMayReadLedger } from './fee.service.js';
import {
  createDocument,
  field,
  FONT,
  footer,
  letterhead,
  longDate,
  money,
  rule,
  rupeesInWords,
  table,
  toBuffer,
  type Letterhead,
} from '../lib/pdf.js';

/**
 * The documents a school hands to a parent.
 *
 * Rendered from stored rows only. A receipt is a financial record, and a
 * parent asking for a copy two years later must be given the same document
 * that was issued — not today's recalculation of it.
 */

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CARD: 'Card',
  ONLINE: 'Online',
};

async function schoolLetterhead(): Promise<Letterhead> {
  const school = await prisma.school.findFirstOrThrow({
    select: {
      name: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      email: true,
    },
  });
  return school;
}

function classroomLabel(
  enrolment: { classroom: { section: string; classLevel: { name: string } } } | undefined,
): string {
  if (!enrolment) return 'Not enrolled';
  return `${enrolment.classroom.classLevel.name} — ${enrolment.classroom.section}`;
}

/** A receipt for one payment. */
export async function paymentReceipt(paymentId: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId },
    include: {
      student: {
        include: {
          enrolments: {
            where: { status: 'ACTIVE' },
            orderBy: { enrolledOn: 'desc' },
            take: 1,
            include: { classroom: { include: { classLevel: { select: { code: true, name: true } } } } },
          },
        },
      },
      recordedBy: { select: { name: true } },
      allocations: { include: { invoice: true } },
    },
  });

  if (!payment) throw ApiError.notFound('Payment not found');

  // A parent may print their own child's receipt; anyone else's does not
  // resolve. Same guard the ledger uses.
  await assertMayReadLedger(payment.studentId);

  const school = await schoolLetterhead();
  const doc = createDocument(`Receipt ${payment.receiptNo}`);

  letterhead(doc, school, 'Fee Receipt');

  const isRefund = payment.amountInPaise < 0;
  const left = doc.page.margins.left;
  const half = (doc.page.width - left - doc.page.margins.right) / 2;

  let row = doc.y;
  field(doc, 'Receipt no.', payment.receiptNo, { x: left, width: half - 10 });
  doc.y = row;
  field(doc, 'Date', longDate(payment.paidOn), { x: left + half, width: half });
  doc.moveDown(0.8);

  row = doc.y;
  const fullName = [payment.student.firstName, payment.student.lastName]
    .filter(Boolean)
    .join(' ');
  field(doc, 'Received from', fullName, { x: left, width: half - 10 });
  doc.y = row;
  field(doc, 'Admission no.', payment.student.admissionNo, { x: left + half, width: half });
  doc.moveDown(0.8);

  row = doc.y;
  field(doc, 'Class', classroomLabel(payment.student.enrolments[0]), {
    x: left,
    width: half - 10,
  });
  doc.y = row;
  field(doc, 'Paid by', METHOD_LABELS[payment.method] ?? payment.method, {
    x: left + half,
    width: half,
  });
  doc.moveDown(0.8);

  if (payment.reference) {
    field(doc, 'Reference', payment.reference);
    doc.moveDown(0.8);
  }

  doc.moveDown(0.4);

  // What the money was put against. A parent seeing only a total cannot tell
  // which term has been cleared.
  if (payment.allocations.length > 0) {
    table(
      doc,
      [
        { header: 'Bill', width: 150 },
        { header: 'Period', width: 160 },
        { header: 'Applied', width: 193, align: 'right' },
      ],
      payment.allocations.map((allocation) => [
        allocation.invoice.invoiceNo,
        allocation.invoice.periodLabel,
        money(allocation.amountInPaise),
      ]),
    );
  } else {
    doc
      .font(FONT.regular)
      .fontSize(10)
      .text(
        isRefund
          ? 'Refund issued against this account.'
          : 'Received on account. Will be applied to the next bill raised.',
      );
    doc.moveDown(0.6);
  }

  doc.moveDown(0.5);
  rule(doc);
  doc.moveDown(0.7);

  const totalLabel = isRefund ? 'Total refunded' : 'Total received';
  doc.font(FONT.bold).fontSize(15).text(`${totalLabel}   ${money(payment.amountInPaise)}`);
  doc.moveDown(0.3);
  doc
    .font(FONT.regular)
    .fontSize(9.5)
    .fillColor('#6B7280')
    .text(rupeesInWords(payment.amountInPaise));

  doc.moveDown(2.4);
  doc.font(FONT.regular).fontSize(9).fillColor('#1A1D29');
  doc.text(`Recorded by ${payment.recordedBy.name}`);

  footer(
    doc,
    'This is a computer-generated receipt and is valid without a signature.',
  );

  return {
    buffer: await toBuffer(doc),
    filename: `receipt-${payment.receiptNo}.pdf`,
  };
}

/** Every bill and payment for one child — the fee card an office is asked for. */
export async function feeCard(studentId: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  await assertMayReadLedger(studentId);

  const student = await prisma.student.findFirst({
    where: { id: studentId },
    include: {
      enrolments: {
        where: { status: 'ACTIVE' },
        orderBy: { enrolledOn: 'desc' },
        take: 1,
        include: {
          classroom: { include: { classLevel: { select: { code: true, name: true } } } },
          academicYear: { select: { name: true } },
        },
      },
    },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const [invoices, payments] = await Promise.all([
    prisma.feeInvoice.findMany({ where: { studentId }, orderBy: { dueDate: 'asc' } }),
    prisma.payment.findMany({ where: { studentId }, orderBy: { paidOn: 'asc' } }),
  ]);

  const school = await schoolLetterhead();
  const doc = createDocument(`Fee card — ${student.admissionNo}`);
  letterhead(doc, school, 'Fee Card');

  const left = doc.page.margins.left;
  const half = (doc.page.width - left - doc.page.margins.right) / 2;

  let row = doc.y;
  field(doc, 'Child', [student.firstName, student.lastName].filter(Boolean).join(' '), {
    x: left,
    width: half - 10,
  });
  doc.y = row;
  field(doc, 'Admission no.', student.admissionNo, { x: left + half, width: half });
  doc.moveDown(0.8);

  row = doc.y;
  field(doc, 'Class', classroomLabel(student.enrolments[0]), { x: left, width: half - 10 });
  doc.y = row;
  field(doc, 'Academic year', student.enrolments[0]?.academicYear.name ?? '—', {
    x: left + half,
    width: half,
  });
  doc.moveDown(1.2);

  doc.font(FONT.bold).fontSize(11).text('Bills');
  doc.moveDown(0.4);

  // Cancelled bills are shown rather than hidden: a parent who remembers being
  // billed should be able to see it was withdrawn, not find it missing.
  table(
    doc,
    [
      { header: 'Bill', width: 110 },
      { header: 'Period', width: 110 },
      { header: 'Due', width: 90 },
      { header: 'Billed', width: 90, align: 'right' },
      { header: 'Paid', width: 103, align: 'right' },
    ],
    invoices.map((invoice) => [
      invoice.invoiceNo,
      invoice.status === 'CANCELLED' ? `${invoice.periodLabel} (cancelled)` : invoice.periodLabel,
      longDate(invoice.dueDate),
      money(invoice.netInPaise),
      money(invoice.paidInPaise),
    ]),
  );

  doc.moveDown(0.8);
  doc.font(FONT.bold).fontSize(11).text('Payments');
  doc.moveDown(0.4);

  table(
    doc,
    [
      { header: 'Receipt', width: 140 },
      { header: 'Date', width: 140 },
      { header: 'Method', width: 110 },
      { header: 'Amount', width: 113, align: 'right' },
    ],
    payments.length > 0
      ? payments.map((payment) => [
          payment.receiptNo,
          longDate(payment.paidOn),
          METHOD_LABELS[payment.method] ?? payment.method,
          money(payment.amountInPaise),
        ])
      : [['—', 'Nothing paid yet', '', '']],
  );

  const billed = invoices
    .filter((i) => i.status !== 'CANCELLED')
    .reduce((sum, i) => sum + i.netInPaise, 0);
  const paid = invoices.reduce((sum, i) => sum + i.paidInPaise, 0);

  doc.moveDown(0.8);
  rule(doc);
  doc.moveDown(0.7);

  doc.font(FONT.bold).fontSize(12);
  doc.text(`Billed   ${money(billed)}`);
  doc.text(`Paid   ${money(paid)}`);
  doc.moveDown(0.2);
  doc.fontSize(14).text(`Outstanding   ${money(billed - paid)}`);

  footer(doc, `Issued ${longDate(new Date())} · ${school.name}`);

  return {
    buffer: await toBuffer(doc),
    filename: `fee-card-${student.admissionNo}.pdf`,
  };
}
