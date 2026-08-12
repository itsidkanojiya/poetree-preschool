import type { Prisma } from '@prisma/client';
import { prisma, type TenantTransactionClient } from '../db/prisma.js';
import { getRequestContext, requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { writeAuditLog } from './audit.service.js';
import { nextDocumentNumber } from './sequence.service.js';
import { guardianStudentIds } from './scope.service.js';
import { guardianUserIdsFor, notifySafe } from './notification.service.js';

/**
 * Fees.
 *
 * Three rules shape everything here:
 *
 *  1. Money is integer paise. No floats, anywhere.
 *  2. Nothing that has been issued is ever edited or deleted. An invoice is
 *     cancelled, a payment is reversed by a second negative payment. A receipt
 *     must be reproducible years later exactly as it was handed over.
 *  3. Generation is idempotent. Running July twice must not charge a child
 *     twice, which the unique key (student, year, period) enforces in the
 *     database rather than in a code path someone might skip.
 */

type Frequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL';

/**
 * Which billing periods a frequency produces.
 *
 * The school chooses the cadence per fee structure, so tuition can be quarterly
 * while an annual activity fee is charged once - both live in one structure.
 */
export function periodsFor(frequency: Frequency, yearStart: Date): string[] {
  switch (frequency) {
    case 'ANNUAL':
    case 'ONE_TIME':
      return ['Annual'];
    case 'HALF_YEARLY':
      return ['H1', 'H2'];
    case 'QUARTERLY':
      return ['Q1', 'Q2', 'Q3', 'Q4'];
    case 'MONTHLY': {
      const labels: string[] = [];
      for (let i = 0; i < 12; i += 1) {
        const d = new Date(
          Date.UTC(yearStart.getUTCFullYear(), yearStart.getUTCMonth() + i, 1),
        );
        labels.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
      }
      return labels;
    }
  }
}

/** Concessions reduce a line; percent is applied first, then fixed amounts. */
function applyConcessions(
  amountInPaise: number,
  concessions: Array<{ kind: 'PERCENT' | 'FIXED'; value: number; feeHeadId: string | null }>,
  feeHeadId: string,
): number {
  const applicable = concessions.filter((c) => c.feeHeadId === null || c.feeHeadId === feeHeadId);

  let discount = 0;
  for (const c of applicable) {
    if (c.kind === 'PERCENT') discount += Math.round((amountInPaise * c.value) / 100);
    else discount += c.value;
  }

  // Never discount below zero, and never turn a discount into a credit.
  return Math.min(discount, amountInPaise);
}

export interface GenerateInvoicesInput {
  academicYearId: string;
  periodLabel: string;
  dueDate: Date;
  /** Restrict to one class level; omit to bill every level with a structure. */
  classLevelId?: string;
}

export interface GenerationResult {
  created: number;
  skipped: number;
  totalBilledInPaise: number;
}

/**
 * Raises invoices for a billing period.
 *
 * Idempotent: children who already have an invoice for this period are counted
 * as skipped rather than charged again.
 */
export async function generateInvoices(
  input: GenerateInvoicesInput,
  actorUserId: string,
): Promise<GenerationResult> {
  const schoolId = requireSchoolId();

  const year = await prisma.academicYear.findFirst({
    where: { id: input.academicYearId },
    select: { id: true, startDate: true },
  });
  if (!year) throw ApiError.badRequest('That academic year does not exist at your school');

  const structures = await prisma.feeStructure.findMany({
    where: {
      academicYearId: input.academicYearId,
      isActive: true,
      ...(input.classLevelId ? { classLevelId: input.classLevelId } : {}),
    },
    include: { items: { include: { feeHead: { select: { id: true, name: true } } } } },
  });

  if (structures.length === 0) {
    throw ApiError.badRequest('No active fee structure for that academic year');
  }

  // A period label that matches no cadence anywhere used to bill nothing and
  // report success — `{created: 0, skipped: 0}`. An admin who typed "Term 1"
  // against a quarterly structure got a silent no-op with no hint that the
  // labels are Q1 to Q4, and no reason to think the run had failed. Say so.
  const acceptable = new Set(
    structures.flatMap((structure) =>
      structure.items.flatMap((item) => periodsFor(item.frequency as Frequency, year.startDate)),
    ),
  );

  if (!acceptable.has(input.periodLabel)) {
    throw ApiError.badRequest(
      `"${input.periodLabel}" is not a billing period for these fee structures`,
      { expected: [...acceptable].sort() },
    );
  }

  let created = 0;
  let skipped = 0;
  let totalBilled = 0;

  for (const structure of structures) {
    // Only the items whose cadence actually includes this period get billed.
    const dueItems = structure.items.filter((item) =>
      periodsFor(item.frequency as Frequency, year.startDate).includes(input.periodLabel),
    );
    if (dueItems.length === 0) continue;

    const enrolments = await prisma.studentEnrolment.findMany({
      where: {
        academicYearId: input.academicYearId,
        status: 'ACTIVE',
        classroom: { classLevelId: structure.classLevelId },
      },
      select: { studentId: true },
    });

    for (const enrolment of enrolments) {
      const existing = await prisma.feeInvoice.findFirst({
        where: {
          studentId: enrolment.studentId,
          academicYearId: input.academicYearId,
          periodLabel: input.periodLabel,
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const concessions = await prisma.feeConcession.findMany({
        where: { studentId: enrolment.studentId, academicYearId: input.academicYearId },
        select: { kind: true, value: true, feeHeadId: true },
      });

      const lines = dueItems.map((item) => {
        const discount = applyConcessions(item.amountInPaise, concessions, item.feeHeadId);
        return {
          feeHeadId: item.feeHeadId,
          description: `${item.feeHead.name} - ${input.periodLabel}`,
          amountInPaise: item.amountInPaise,
          discountInPaise: discount,
        };
      });

      const gross = lines.reduce((sum, l) => sum + l.amountInPaise, 0);
      const discount = lines.reduce((sum, l) => sum + l.discountInPaise, 0);
      const net = gross - discount;

      await prisma.$transaction(async (tx) => {
        const invoiceNo = await nextDocumentNumber(tx, {
          schoolId,
          kind: 'INVOICE',
          academicYearId: input.academicYearId,
          defaultPrefix: 'INV-',
          padTo: 5,
        });

        const invoice = await tx.feeInvoice.create({
          data: {
            schoolId,
            studentId: enrolment.studentId,
            academicYearId: input.academicYearId,
            invoiceNo,
            periodLabel: input.periodLabel,
            dueDate: input.dueDate,
            grossInPaise: gross,
            discountInPaise: discount,
            netInPaise: net,
            status: 'ISSUED',
          },
        });

        await tx.feeInvoiceLine.createMany({
          data: lines.map((line) => ({ schoolId, invoiceId: invoice.id, ...line })),
        });
      });

      created += 1;
      totalBilled += net;
    }
  }

  await writeAuditLog({
    action: 'INVOICES_GENERATED',
    entity: 'FeeInvoice',
    entityId: input.academicYearId,
    schoolId,
    actorUserId,
    metadata: { periodLabel: input.periodLabel, created, skipped, totalBilledInPaise: totalBilled },
  });

  return { created, skipped, totalBilledInPaise: totalBilled };
}

/** Recomputes an invoice's paid total and status from its allocations. */
async function settleInvoice(tx: TenantTransactionClient, invoiceId: string): Promise<void> {
  const invoice = await tx.feeInvoice.findFirstOrThrow({
    where: { id: invoiceId },
    select: { netInPaise: true, status: true },
  });

  const allocations = await tx.paymentAllocation.findMany({
    where: { invoiceId },
    select: { amountInPaise: true },
  });

  const paid = allocations.reduce((sum, a) => sum + a.amountInPaise, 0);

  // OVERDUE is deliberately not stored - it is derived from dueDate at read
  // time, so it can never go stale between nightly jobs.
  const status =
    invoice.status === 'CANCELLED'
      ? 'CANCELLED'
      : paid <= 0
        ? 'ISSUED'
        : paid >= invoice.netInPaise
          ? 'PAID'
          : 'PARTIAL';

  await tx.feeInvoice.update({
    where: { id: invoiceId },
    data: { paidInPaise: paid, status },
  });
}

export interface RecordPaymentInput {
  studentId: string;
  amountInPaise: number;
  method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'ONLINE';
  paidOn: Date;
  reference?: string;
  note?: string;
  /** Explicit allocation; omitted means oldest-invoice-first. */
  allocations?: Array<{ invoiceId: string; amountInPaise: number }>;
}

/**
 * Records money received and allocates it across invoices.
 *
 * The receipt number is allocated inside this transaction under a row lock, so
 * two clerks taking fees at the same moment cannot be handed the same number.
 */
export async function recordPayment(
  input: RecordPaymentInput,
  actorUserId: string,
): Promise<{ receiptNo: string; paymentId: string; allocated: number; unallocated: number }> {
  const schoolId = requireSchoolId();

  if (input.amountInPaise <= 0) {
    throw ApiError.badRequest('A payment must be greater than zero. Use a refund to reverse one.');
  }

  const student = await prisma.student.findFirst({
    where: { id: input.studentId },
    select: { id: true },
  });
  if (!student) throw ApiError.notFound('Student not found');

  // Oldest first, so a parent paying a lump sum clears their arrears before
  // this month - which is what both sides expect.
  const open = await prisma.feeInvoice.findMany({
    where: { studentId: input.studentId, status: { in: ['ISSUED', 'PARTIAL'] } },
    orderBy: { dueDate: 'asc' },
    select: { id: true, netInPaise: true, paidInPaise: true },
  });

  const plan: Array<{ invoiceId: string; amountInPaise: number }> = [];

  if (input.allocations?.length) {
    const byId = new Map(open.map((i) => [i.id, i]));
    for (const allocation of input.allocations) {
      const invoice = byId.get(allocation.invoiceId);
      if (!invoice) throw ApiError.badRequest('An invoice in the allocation is not open');
      const outstanding = invoice.netInPaise - invoice.paidInPaise;
      if (allocation.amountInPaise > outstanding) {
        throw ApiError.badRequest('An allocation exceeds what that invoice still owes');
      }
      plan.push(allocation);
    }
  } else {
    let remaining = input.amountInPaise;
    for (const invoice of open) {
      if (remaining <= 0) break;
      const outstanding = invoice.netInPaise - invoice.paidInPaise;
      if (outstanding <= 0) continue;
      const take = Math.min(remaining, outstanding);
      plan.push({ invoiceId: invoice.id, amountInPaise: take });
      remaining -= take;
    }
  }

  const allocated = plan.reduce((sum, p) => sum + p.amountInPaise, 0);
  if (allocated > input.amountInPaise) {
    throw ApiError.badRequest('Allocations exceed the payment amount');
  }

  // Receipt series restarts each academic year, matching how school accounts
  // are closed and audited.
  const currentYear = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true },
  });
  if (!currentYear) {
    throw ApiError.badRequest('Set a current academic year before taking payments.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const receiptNo = await nextDocumentNumber(tx, {
      schoolId,
      kind: 'RECEIPT',
      academicYearId: currentYear.id,
      defaultPrefix: `RCP-${currentYear.name.slice(0, 4)}-`,
      padTo: 4,
    });

    const payment = await tx.payment.create({
      data: {
        schoolId,
        studentId: input.studentId,
        receiptNo,
        amountInPaise: input.amountInPaise,
        method: input.method,
        reference: input.reference ?? null,
        note: input.note ?? null,
        paidOn: input.paidOn,
        recordedById: actorUserId,
        status: 'RECORDED',
      },
    });

    for (const allocation of plan) {
      await tx.paymentAllocation.create({
        data: { schoolId, paymentId: payment.id, ...allocation },
      });
      await settleInvoice(tx, allocation.invoiceId);
    }

    return { receiptNo, paymentId: payment.id };
  });

  await writeAuditLog({
    action: 'PAYMENT_RECORDED',
    entity: 'Payment',
    entityId: result.paymentId,
    schoolId,
    actorUserId,
    after: {
      receiptNo: result.receiptNo,
      amountInPaise: input.amountInPaise,
      method: input.method,
      allocated,
    },
  });

  // A receipt in the app is the confirmation a parent who paid cash at the gate
  // otherwise has no record of. Amount only — never a balance, which would put
  // a family's debt on a lock screen for anyone to read.
  const guardians = await guardianUserIdsFor([input.studentId]);
  if (guardians.length > 0) {
    notifySafe({
      schoolId,
      userIds: guardians,
      type: 'FEE_RECEIPT',
      title: 'Payment received',
      body: `₹${(input.amountInPaise / 100).toLocaleString('en-IN')} received. Receipt ${result.receiptNo}.`,
      entityType: 'Payment',
      entityId: result.paymentId,
    });
  }

  return {
    ...result,
    allocated,
    // Money received beyond what is owed sits as an unallocated credit rather
    // than being silently absorbed.
    unallocated: input.amountInPaise - allocated,
  };
}

/** A refund is a second, negative payment. The original is never touched. */
export async function refundPayment(
  paymentId: string,
  reason: string,
  actorUserId: string,
): Promise<{ receiptNo: string }> {
  const schoolId = requireSchoolId();

  const original = await prisma.payment.findFirst({
    where: { id: paymentId },
    include: { allocations: true },
  });
  if (!original) throw ApiError.notFound('Payment not found');
  if (original.amountInPaise < 0) throw ApiError.badRequest('That is already a refund');
  if (original.status === 'REFUNDED') throw ApiError.conflict('This payment is already refunded');

  const currentYear = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    const receiptNo = await nextDocumentNumber(tx, {
      schoolId,
      kind: 'RECEIPT',
      academicYearId: currentYear?.id ?? null,
      defaultPrefix: currentYear ? `RCP-${currentYear.name.slice(0, 4)}-` : 'RCP-',
      padTo: 4,
    });

    await tx.payment.create({
      data: {
        schoolId,
        studentId: original.studentId,
        receiptNo,
        amountInPaise: -original.amountInPaise,
        method: original.method,
        reference: original.receiptNo,
        note: reason,
        paidOn: new Date(),
        recordedById: actorUserId,
        status: 'REFUNDED',
      },
    });

    await tx.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });

    // Releasing the allocations puts the invoices back into arrears.
    for (const allocation of original.allocations) {
      await tx.paymentAllocation.delete({ where: { id: allocation.id } });
      await settleInvoice(tx, allocation.invoiceId);
    }

    return { receiptNo };
  });

  await writeAuditLog({
    action: 'PAYMENT_REFUNDED',
    entity: 'Payment',
    entityId: paymentId,
    schoolId,
    actorUserId,
    before: { receiptNo: original.receiptNo, amountInPaise: original.amountInPaise },
    after: { refundReceiptNo: result.receiptNo, reason },
  });

  return result;
}

export async function cancelInvoice(
  invoiceId: string,
  reason: string,
  actorUserId: string,
): Promise<void> {
  const schoolId = requireSchoolId();

  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: invoiceId },
    select: { id: true, status: true, paidInPaise: true, invoiceNo: true },
  });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (invoice.paidInPaise > 0) {
    throw ApiError.badRequest('Refund the payments against this invoice before cancelling it');
  }

  await prisma.feeInvoice.update({
    where: { id: invoiceId },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledReason: reason },
  });

  await writeAuditLog({
    action: 'INVOICE_CANCELLED',
    entity: 'FeeInvoice',
    entityId: invoiceId,
    schoolId,
    actorUserId,
    before: { status: invoice.status },
    after: { status: 'CANCELLED', reason },
  });
}

export interface LedgerEntry {
  invoiceNo: string;
  periodLabel: string;
  dueDate: string;
  netInPaise: number;
  paidInPaise: number;
  outstandingInPaise: number;
  status: string;
  overdue: boolean;
}

/** A child's fee card: what was billed, what was paid, what is still owed. */
/**
 * A parent may read their own child's ledger and nobody else's.
 *
 * `fee:read` alone is not enough: parents hold it so they can see what they owe,
 * but the permission says nothing about *whose* fees. Without this, any parent
 * could read any child's arrears by guessing an id.
 */
export async function assertMayReadLedger(studentId: string): Promise<void> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();
  if (context.role !== 'PARENT') return;

  const mine = await guardianStudentIds();
  if (!mine.includes(studentId)) {
    // Missing, not forbidden — a 403 would confirm the child exists.
    throw ApiError.notFound('Student not found');
  }
}

export async function studentLedger(studentId: string): Promise<{
  invoices: LedgerEntry[];
  payments: Array<{ receiptNo: string; amountInPaise: number; paidOn: string; method: string }>;
  totals: { billed: number; paid: number; outstanding: number };
}> {
  await assertMayReadLedger(studentId);

  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const [invoices, payments] = await Promise.all([
    prisma.feeInvoice.findMany({ where: { studentId }, orderBy: { dueDate: 'asc' } }),
    prisma.payment.findMany({ where: { studentId }, orderBy: { paidOn: 'desc' } }),
  ]);

  const today = new Date();
  const entries: LedgerEntry[] = invoices.map((invoice) => {
    const outstanding = invoice.netInPaise - invoice.paidInPaise;
    return {
      invoiceNo: invoice.invoiceNo,
      periodLabel: invoice.periodLabel,
      dueDate: invoice.dueDate.toISOString().slice(0, 10),
      netInPaise: invoice.netInPaise,
      paidInPaise: invoice.paidInPaise,
      outstandingInPaise: outstanding,
      status: invoice.status,
      // Derived, never stored.
      overdue:
        outstanding > 0 && invoice.status !== 'CANCELLED' && invoice.dueDate < today,
    };
  });

  const billed = entries
    .filter((e) => e.status !== 'CANCELLED')
    .reduce((sum, e) => sum + e.netInPaise, 0);
  const paid = entries.reduce((sum, e) => sum + e.paidInPaise, 0);

  return {
    invoices: entries,
    payments: payments.map((p) => ({
      receiptNo: p.receiptNo,
      amountInPaise: p.amountInPaise,
      paidOn: p.paidOn.toISOString().slice(0, 10),
      method: p.method,
    })),
    totals: { billed, paid, outstanding: billed - paid },
  };
}

/** Who still owes money, worst first. The screen a school office lives in. */
export async function outstandingReport(): Promise<
  Array<{
    studentId: string;
    fullName: string;
    admissionNo: string;
    outstandingInPaise: number;
    overdueCount: number;
  }>
> {
  const invoices = await prisma.feeInvoice.findMany({
    where: { status: { in: ['ISSUED', 'PARTIAL'] } },
    include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
  });

  const today = new Date();
  const byStudent = new Map<
    string,
    { studentId: string; fullName: string; admissionNo: string; outstandingInPaise: number; overdueCount: number }
  >();

  for (const invoice of invoices) {
    const outstanding = invoice.netInPaise - invoice.paidInPaise;
    if (outstanding <= 0) continue;

    const entry = byStudent.get(invoice.studentId) ?? {
      studentId: invoice.studentId,
      fullName: [invoice.student.firstName, invoice.student.lastName].filter(Boolean).join(' '),
      admissionNo: invoice.student.admissionNo,
      outstandingInPaise: 0,
      overdueCount: 0,
    };

    entry.outstandingInPaise += outstanding;
    if (invoice.dueDate < today) entry.overdueCount += 1;
    byStudent.set(invoice.studentId, entry);
  }

  return [...byStudent.values()].sort((a, b) => b.outstandingInPaise - a.outstandingInPaise);
}

export type FeeInvoiceWhere = Prisma.FeeInvoiceWhereInput;
