import type { Prisma } from '@prisma/client';
import type {
  ApprovePaymentProofInput,
  FeePaymentInfo,
  PaymentDetailsInput,
  PaymentDetailsView,
  PaymentProofStatus,
  PaymentProofView,
  RejectPaymentProofInput,
  SettleFeesInput,
  SubmitPaymentProofInput,
} from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { studentName } from '../lib/names.js';
import { writeAuditLog } from './audit.service.js';
import { assertMayReadLedger, recordPayment } from './fee.service.js';
import { changePlan, payInFullOffer } from './feePlan.service.js';
import { guardianUserIdsFor, notifySafe } from './notification.service.js';

/**
 * Families paying by bank transfer or UPI, outside the app, and showing the
 * school a screenshot. Nothing is paid until the office has looked at it:
 * approving records an ordinary payment — receipt, ledger and all — and
 * rejecting tells the family why, so they can send it again.
 */

const inRupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

/* -------------------------------------------------------------------------- */
/* The school's bank account and UPI ID                                       */
/* -------------------------------------------------------------------------- */

const NO_DETAILS: PaymentDetailsView = {
  bankEnabled: false,
  bankAccountName: null,
  bankAccountNo: null,
  bankIfsc: null,
  bankName: null,
  upiEnabled: false,
  upiId: null,
  upiName: null,
};

export async function paymentDetails(): Promise<PaymentDetailsView> {
  const row = await prisma.schoolPaymentDetails.findFirst({});
  if (!row) return { ...NO_DETAILS };
  return {
    bankEnabled: row.bankEnabled,
    bankAccountName: row.bankAccountName,
    bankAccountNo: row.bankAccountNo,
    bankIfsc: row.bankIfsc,
    bankName: row.bankName,
    upiEnabled: row.upiEnabled,
    upiId: row.upiId,
    upiName: row.upiName,
  };
}

export async function savePaymentDetails(
  input: PaymentDetailsInput,
  actorUserId: string,
): Promise<PaymentDetailsView> {
  const schoolId = requireSchoolId();
  const before = await paymentDetails();
  const existing = await prisma.schoolPaymentDetails.findFirst({ select: { id: true } });
  if (existing) {
    await prisma.schoolPaymentDetails.update({ where: { id: existing.id }, data: input });
  } else {
    await prisma.schoolPaymentDetails.create({ data: { schoolId, ...input } });
  }
  await writeAuditLog({
    action: 'FEE_PAYMENT_DETAILS_UPDATED',
    entity: 'SchoolPaymentDetails',
    entityId: schoolId,
    schoolId,
    actorUserId,
    before,
    after: input,
  });
  return paymentDetails();
}

/* -------------------------------------------------------------------------- */
/* Reading proofs                                                             */
/* -------------------------------------------------------------------------- */

const proofInclude = {
  invoice: { select: { periodLabel: true } },
  payment: { select: { receiptNo: true } },
  student: {
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      admissionNo: true,
      enrolments: {
        where: { status: 'ACTIVE' as const },
        orderBy: { enrolledOn: 'desc' as const },
        take: 1,
        select: {
          classroom: { select: { section: true, classLevel: { select: { name: true } } } },
        },
      },
    },
  },
} satisfies Prisma.PaymentProofInclude;

type ProofRow = Prisma.PaymentProofGetPayload<{ include: typeof proofInclude }>;

function toView(row: ProofRow): PaymentProofView {
  const enrolment = row.student.enrolments[0];
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    invoiceId: row.invoiceId,
    label: row.kind === 'PAY_IN_FULL' ? 'Full year' : (row.invoice?.periodLabel ?? 'Installment'),
    amountInPaise: row.amountInPaise,
    method: row.method === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'UPI',
    reference: row.reference,
    screenshotFileId: row.screenshotFileId,
    rejectReason: row.rejectReason,
    receiptNo: row.payment?.receiptNo ?? null,
    paymentId: row.paymentId,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    student: {
      id: row.student.id,
      name: studentName(row.student),
      admissionNo: row.student.admissionNo,
      classroomLabel: enrolment
        ? `${enrolment.classroom.classLevel.name} — ${enrolment.classroom.section}`
        : null,
    },
  };
}

/** The office's queue: waiting first, oldest first, so nobody waits longest. */
export async function listProofs(status?: PaymentProofStatus): Promise<PaymentProofView[]> {
  const rows = await prisma.paymentProof.findMany({
    where: status ? { status } : {},
    include: proofInclude,
    orderBy: status === 'WAITING' ? { createdAt: 'asc' } : { createdAt: 'desc' },
    take: 200,
  });
  return rows.map(toView);
}

export async function waitingCount(): Promise<number> {
  return prisma.paymentProof.count({ where: { status: 'WAITING' } });
}

/**
 * What a family needs to pay: where to send the money, what they have sent
 * and where it stands, and whether paying the year at once is still open.
 */
export async function paymentInfo(studentId: string): Promise<FeePaymentInfo> {
  await assertMayReadLedger(studentId);
  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const [details, offer] = await Promise.all([paymentDetails(), payInFullOffer(studentId)]);
  const proofs = await prisma.paymentProof.findMany({
    where: { studentId, academicYearId: offer.academicYearId },
    include: proofInclude,
    orderBy: { createdAt: 'desc' },
  });

  return {
    details: {
      bank:
        details.bankEnabled && details.bankAccountNo && details.bankIfsc
          ? {
              accountName: details.bankAccountName,
              accountNo: details.bankAccountNo,
              ifsc: details.bankIfsc,
              bankName: details.bankName,
            }
          : null,
      upi:
        details.upiEnabled && details.upiId ? { id: details.upiId, name: details.upiName } : null,
    },
    payInFull: {
      available: offer.available,
      amountInPaise: offer.amountInPaise,
      discountInPaise: offer.discountInPaise,
      reason: offer.reason,
    },
    proofs: proofs.map(toView),
  };
}

/* -------------------------------------------------------------------------- */
/* A family sends proof                                                       */
/* -------------------------------------------------------------------------- */

export async function submitProof(
  studentId: string,
  input: SubmitPaymentProofInput,
  actorUserId: string,
): Promise<PaymentProofView> {
  const schoolId = requireSchoolId();
  await assertMayReadLedger(studentId);

  const details = await paymentDetails();
  const accepted =
    input.method === 'UPI'
      ? details.upiEnabled && !!details.upiId
      : details.bankEnabled && !!details.bankAccountNo;
  if (!accepted) {
    throw ApiError.badRequest(
      input.method === 'UPI'
        ? 'The school does not take payments by UPI.'
        : 'The school does not take payments by bank transfer.',
    );
  }

  // Their own upload, and a picture: the screenshot is the whole point.
  const screenshot = await prisma.fileObject.findFirst({
    where: { id: input.screenshotFileId, uploadedById: actorUserId },
    select: { mimeType: true },
  });
  if (!screenshot || !screenshot.mimeType.startsWith('image/')) {
    throw ApiError.badRequest('Attach a screenshot of the payment');
  }

  let academicYearId: string;
  let amountInPaise: number;
  let invoiceId: string | null = null;

  if (input.kind === 'INSTALLMENT') {
    const invoice = await prisma.feeInvoice.findFirst({
      where: { id: input.invoiceId, studentId, status: { in: ['ISSUED', 'PARTIAL'] } },
      select: { id: true, academicYearId: true, netInPaise: true, paidInPaise: true },
    });
    if (!invoice || invoice.netInPaise - invoice.paidInPaise <= 0) {
      throw ApiError.conflict('That installment has nothing left to pay.');
    }
    const waiting = await prisma.paymentProof.count({
      where: {
        studentId,
        status: 'WAITING',
        OR: [{ invoiceId: invoice.id }, { kind: 'PAY_IN_FULL' }],
      },
    });
    if (waiting > 0) {
      throw ApiError.conflict('A payment for this is already waiting for the school to check it.');
    }
    academicYearId = invoice.academicYearId;
    amountInPaise = invoice.netInPaise - invoice.paidInPaise;
    invoiceId = invoice.id;
  } else {
    const offer = await payInFullOffer(studentId);
    if (!offer.available) {
      throw ApiError.conflict(offer.reason ?? 'Paying in full is not open for this year.');
    }
    academicYearId = offer.academicYearId;
    amountInPaise = offer.amountInPaise;
  }

  const created = await prisma.paymentProof.create({
    data: {
      schoolId,
      studentId,
      academicYearId,
      invoiceId,
      kind: input.kind,
      amountInPaise,
      method: input.method,
      reference: input.reference ?? null,
      screenshotFileId: input.screenshotFileId,
      submittedById: actorUserId,
    },
    include: proofInclude,
  });

  await writeAuditLog({
    action: 'FEE_PROOF_SENT',
    entity: 'PaymentProof',
    entityId: created.id,
    schoolId,
    actorUserId,
    after: { studentId, kind: input.kind, invoiceId, amountInPaise, method: input.method },
  });

  return toView(created);
}

/* -------------------------------------------------------------------------- */
/* The office approves or rejects                                             */
/* -------------------------------------------------------------------------- */

async function waitingProof(proofId: string) {
  const proof = await prisma.paymentProof.findFirst({ where: { id: proofId } });
  if (!proof) throw ApiError.notFound('Payment not found');
  if (proof.status !== 'WAITING') {
    throw ApiError.conflict(
      proof.status === 'APPROVED'
        ? 'This payment has already been approved.'
        : 'This payment was rejected. The family can send it again.',
    );
  }
  return proof;
}

/** Oldest first, from what this student still owes. */
async function oldestFirst(
  studentId: string,
  amountInPaise: number,
  first: string | null,
): Promise<Array<{ invoiceId: string; amountInPaise: number }>> {
  const open = await prisma.feeInvoice.findMany({
    where: { studentId, status: { in: ['ISSUED', 'PARTIAL'] } },
    orderBy: { dueDate: 'asc' },
    select: { id: true, netInPaise: true, paidInPaise: true },
  });
  // The installment the family said they were paying, before anything older.
  open.sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : 0));

  const plan: Array<{ invoiceId: string; amountInPaise: number }> = [];
  let left = amountInPaise;
  for (const invoice of open) {
    if (left <= 0) break;
    const owed = invoice.netInPaise - invoice.paidInPaise;
    if (owed <= 0) continue;
    const take = Math.min(left, owed);
    plan.push({ invoiceId: invoice.id, amountInPaise: take });
    left -= take;
  }
  return plan;
}

/**
 * Approving records the money as an ordinary payment — the family gets their
 * receipt as with any other. Paying the year in full first moves the child
 * onto the full-year invoice, with its discount.
 */
export async function approveProof(
  proofId: string,
  input: ApprovePaymentProofInput,
  actorUserId: string,
): Promise<PaymentProofView & { receiptNo: string }> {
  const schoolId = requireSchoolId();
  const proof = await waitingProof(proofId);
  const amountInPaise = input.amountInPaise ?? proof.amountInPaise;

  if (proof.kind === 'PAY_IN_FULL') {
    await changePlan(
      proof.studentId,
      { academicYearId: proof.academicYearId, planId: 'PAY_IN_FULL' },
      actorUserId,
    );
  }

  const payment = await recordPayment(
    {
      studentId: proof.studentId,
      amountInPaise,
      method: proof.method === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'UPI',
      paidOn: proof.createdAt,
      reference: proof.reference ?? undefined,
      note: 'Paid by the family; screenshot checked by the school',
      allocations: await oldestFirst(proof.studentId, amountInPaise, proof.invoiceId),
    },
    actorUserId,
  );

  // Claimed only if still waiting, so two clerks approving at once cannot
  // both record it as approved.
  const claimed = await prisma.paymentProof.updateMany({
    where: { id: proof.id, status: 'WAITING' },
    data: {
      status: 'APPROVED',
      paymentId: payment.paymentId,
      reviewedById: actorUserId,
      reviewedAt: new Date(),
      ...(amountInPaise !== proof.amountInPaise ? { amountInPaise } : {}),
    },
  });
  if (claimed.count === 0) throw ApiError.conflict('This payment has already been approved.');

  await writeAuditLog({
    action: 'FEE_PROOF_APPROVED',
    entity: 'PaymentProof',
    entityId: proof.id,
    schoolId,
    actorUserId,
    before: { amountInPaise: proof.amountInPaise },
    after: { amountInPaise, receiptNo: payment.receiptNo, paymentId: payment.paymentId },
  });

  const row = await prisma.paymentProof.findFirstOrThrow({
    where: { id: proof.id },
    include: proofInclude,
  });
  return { ...toView(row), receiptNo: payment.receiptNo };
}

export async function rejectProof(
  proofId: string,
  input: RejectPaymentProofInput,
  actorUserId: string,
): Promise<PaymentProofView> {
  const schoolId = requireSchoolId();
  const proof = await waitingProof(proofId);

  await prisma.paymentProof.update({
    where: { id: proof.id },
    data: {
      status: 'REJECTED',
      rejectReason: input.reason,
      reviewedById: actorUserId,
      reviewedAt: new Date(),
    },
  });

  await writeAuditLog({
    action: 'FEE_PROOF_REJECTED',
    entity: 'PaymentProof',
    entityId: proof.id,
    schoolId,
    actorUserId,
    after: { reason: input.reason },
  });

  const guardians = await guardianUserIdsFor([proof.studentId]);
  if (guardians.length > 0) {
    notifySafe({
      schoolId,
      userIds: guardians,
      type: 'FEE_DUE',
      title: 'Payment not accepted',
      body: `The school could not accept your payment of ${inRupees(proof.amountInPaise)}: ${input.reason}`,
      entityType: 'PaymentProof',
      entityId: proof.id,
      data: { studentId: proof.studentId },
    });
  }

  const row = await prisma.paymentProof.findFirstOrThrow({
    where: { id: proof.id },
    include: proofInclude,
  });
  return toView(row);
}

/* -------------------------------------------------------------------------- */
/* The office: mark the year as fully paid                                    */
/* -------------------------------------------------------------------------- */

/**
 * Money taken for the rest of the year — cash at the counter, or a transfer
 * the office has seen — and the year closed: nothing more is owed, and
 * nobody is reminded of it.
 *
 * With nothing paid yet and the standard offering it, the child goes onto the
 * full-year invoice with its discount first. Otherwise the money pays the
 * oldest installments, and whatever is left on the year is let go: an unpaid
 * installment is cancelled, a part-paid one closed at what was paid.
 */
export async function settleYear(
  studentId: string,
  input: SettleFeesInput,
  actorUserId: string,
): Promise<{ receiptNo: string; paymentId: string; closed: number }> {
  const schoolId = requireSchoolId();
  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const offer = await payInFullOffer(studentId);
  const academicYearId = offer.academicYearId;
  const openWhere = {
    studentId,
    academicYearId,
    status: { in: ['ISSUED' as const, 'PARTIAL' as const] },
  };

  const owedNow = async () => {
    const open = await prisma.feeInvoice.findMany({
      where: openWhere,
      select: { netInPaise: true, paidInPaise: true },
    });
    return open.reduce((sum, i) => sum + i.netInPaise - i.paidInPaise, 0);
  };

  // What the year will owe once it is set up to be closed — checked before
  // anything changes, so a mistyped amount changes nothing.
  const owed = offer.available ? offer.amountInPaise : await owedNow();
  if (owed <= 0) throw ApiError.conflict('Nothing is owed for this year.');
  if (input.amountInPaise > owed) {
    throw ApiError.badRequest(`That is more than the ${inRupees(owed)} this year still owes.`);
  }

  if (offer.available) {
    await changePlan(studentId, { academicYearId, planId: 'PAY_IN_FULL' }, actorUserId);
  }

  const payment = await recordPayment(
    {
      studentId,
      amountInPaise: input.amountInPaise,
      method: input.method,
      paidOn: input.paidOn,
      reference: input.reference ?? undefined,
      note: 'Marked as fully paid',
      allocations: await oldestFirst(studentId, input.amountInPaise, null),
    },
    actorUserId,
  );

  // Whatever the year still owes is let go.
  const closed = await prisma.$transaction(async (tx) => {
    const left = await tx.feeInvoice.findMany({
      where: openWhere,
      include: { lines: { orderBy: { amountInPaise: 'desc' } } },
    });
    for (const invoice of left) {
      const rest = invoice.netInPaise - invoice.paidInPaise;
      if (invoice.paidInPaise === 0) {
        await tx.feeInvoice.update({
          where: { id: invoice.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledReason: 'Marked as fully paid',
          },
        });
        continue;
      }
      // Part paid: closed at what was paid, the rest as discount on its
      // lines, so the lines still add up to the invoice.
      let toWrite = rest;
      for (const line of invoice.lines) {
        if (toWrite <= 0) break;
        const room = line.amountInPaise - line.discountInPaise;
        const take = Math.min(room, toWrite);
        if (take <= 0) continue;
        await tx.feeInvoiceLine.update({
          where: { id: line.id },
          data: { discountInPaise: line.discountInPaise + take },
        });
        toWrite -= take;
      }
      await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          discountInPaise: invoice.discountInPaise + rest,
          netInPaise: invoice.paidInPaise,
          status: 'PAID',
        },
      });
    }
    const ids = left.map((i) => i.id);
    if (ids.length > 0) {
      await tx.feeFollowUp.updateMany({
        where: { invoiceId: { in: ids }, status: 'PENDING' },
        data: { status: 'CANCELLED', closedAt: new Date(), closedReason: 'Marked as fully paid' },
      });
    }
    // A screenshot still waiting is answered by this.
    await tx.paymentProof.updateMany({
      where: { studentId, academicYearId, status: 'WAITING' },
      data: {
        status: 'REJECTED',
        rejectReason: 'The school has marked this year as fully paid.',
        reviewedById: actorUserId,
        reviewedAt: new Date(),
      },
    });
    return left.length;
  });

  await writeAuditLog({
    action: 'FEES_MARKED_FULLY_PAID',
    entity: 'Student',
    entityId: studentId,
    schoolId,
    actorUserId,
    after: {
      academicYearId,
      amountInPaise: input.amountInPaise,
      method: input.method,
      receiptNo: payment.receiptNo,
      payInFull: offer.available,
      closed,
    },
  });

  return { receiptNo: payment.receiptNo, paymentId: payment.paymentId, closed };
}
