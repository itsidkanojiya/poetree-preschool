import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  chooseFeePlanSchema,
  closeFeeFollowUpSchema,
  feeReminderPolicySchema,
  idParamSchema,
  idSchema,
  logFeeFollowUpSchema,
  approvePaymentProofSchema,
  paymentDetailsSchema,
  rejectPaymentProofSchema,
  settleFeesSchema,
  type ApprovePaymentProofInput,
  type PaymentDetailsInput,
  type PaymentProofStatus,
  type RejectPaymentProofInput,
  type SettleFeesInput,
  payInFullSchema,
  saveFeePlanSchema,
  structureInstallmentSchema,
  recurringYearInPaise,
  type ChooseFeePlanInput,
  type CloseFeeFollowUpInput,
  type FeeReminderPolicyInput,
  type LogFeeFollowUpInput,
  type SaveFeePlanInput,
} from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { requireRole } from '../middleware/requireRole.js';
import { body, params, query, validate } from '../middleware/validate.js';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { writeAuditLog } from '../services/audit.service.js';
import * as fees from '../services/fee.service.js';
import * as erase from '../services/erase.service.js';
import * as documents from '../services/document.service.js';
import * as plans from '../services/feePlan.service.js';
import * as followUps from '../services/feeFollowUp.service.js';
import * as payments from '../services/feePayment.service.js';
import * as invoicePdf from '../services/feeInvoice.pdf.js';

export const feeRouter = Router();

const id = (req: Request) => params<{ id: string }>(req).id;

/* -------------------------------------------------------------------------- */
/* Fee heads and structures                                                   */
/* -------------------------------------------------------------------------- */

const feeHeadSchema = z.object({
  code: z.string().trim().toUpperCase().max(30),
  name: z.string().trim().min(2).max(80),
});

feeRouter.get(
  '/heads',
  requirePermission('fee:read'),
  asyncHandler(async (_req, res) => {
    res.json(await prisma.feeHead.findMany({ orderBy: { name: 'asc' } }));
  }),
);

feeRouter.post(
  '/heads',
  requirePermission('fee:manage_structure'),
  validate({ body: feeHeadSchema }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof feeHeadSchema>>(req);
    res
      .status(201)
      .json(await prisma.feeHead.create({ data: { schoolId: requireSchoolId(), ...input } }));
  }),
);

/**
 * A fee head, for good — and off every standard that charges it. Not one that
 * has been billed: those invoices would lose the name of what they charged.
 */
feeRouter.delete(
  '/heads/:id',
  requirePermission('fee:manage_structure'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const headId = id(req);
    const head = await prisma.feeHead.findFirst({ where: { id: headId } });
    if (!head) throw ApiError.notFound('Fee head not found');

    const billed = await prisma.feeInvoiceLine.count({ where: { feeHeadId: headId } });
    if (billed > 0) {
      throw ApiError.conflict(
        `${head.name} has already been billed to families, so it cannot be removed.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.feeStructureItem.deleteMany({ where: { feeHeadId: headId } });
      await tx.feeHead.delete({ where: { id: headId } });
    });
    await writeAuditLog({
      action: 'FEE_HEAD_DELETED',
      entity: 'FeeHead',
      entityId: headId,
      schoolId: requireSchoolId(),
      actorUserId: req.auth!.userId,
      before: { code: head.code, name: head.name },
    });
    res.status(204).end();
  }),
);

const structureSchema = z.object({
  academicYearId: idSchema,
  classLevelId: idSchema,
  name: z.string().trim().min(2).max(80),
  items: z
    .array(
      z.object({
        feeHeadId: idSchema,
        amountInPaise: z.number().int().min(0),
        frequency: z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL']),
        dueDayOfMonth: z.number().int().min(1).max(28).default(10),
      }),
    )
    .min(1),
  /** The standard's installments as typed. Left out: kept as they are. */
  installments: z.array(structureInstallmentSchema).max(12).optional(),
  payInFull: payInFullSchema.optional(),
});

const inRupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

/**
 * Typed installments must come to the year — said in rupees, with the
 * difference, so the office knows which way to adjust.
 */
function assertInstallments(input: z.infer<typeof structureSchema>): void {
  const installments = input.installments;
  if (!installments || installments.length === 0) return;

  for (let i = 1; i < installments.length; i += 1) {
    if (installments[i]!.dueDate <= installments[i - 1]!.dueDate) {
      throw ApiError.badRequest('Put the installments in date order, one date each');
    }
  }

  const year = recurringYearInPaise(input.items);
  const typed = installments.reduce((sum, i) => sum + i.amountInPaise, 0);
  if (typed !== year) {
    const gap = Math.abs(year - typed);
    throw ApiError.badRequest(
      `The installments come to ${inRupees(typed)}, ${inRupees(gap)} ${
        typed < year ? 'less' : 'more'
      } than the year’s ${inRupees(year)}.`,
    );
  }
}

feeRouter.get(
  '/structures',
  requirePermission('fee:read'),
  asyncHandler(async (_req, res) => {
    res.json(
      await prisma.feeStructure.findMany({
        include: {
          classLevel: { select: { code: true, name: true } },
          academicYear: { select: { name: true } },
          items: { include: { feeHead: { select: { name: true } } } },
          installments: { orderBy: { position: 'asc' } },
        },
      }),
    );
  }),
);

/** Replaces the structure wholesale, so the stored state is what the admin saw. */
feeRouter.put(
  '/structures',
  requirePermission('fee:manage_structure'),
  validate({ body: structureSchema }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof structureSchema>>(req);
    const schoolId = requireSchoolId();
    assertInstallments(input);

    const payInFull = input.payInFull
      ? {
          payInFullEnabled: input.payInFull.enabled,
          payInFullDiscountKind: input.payInFull.discountKind,
          payInFullDiscountValue: input.payInFull.discountValue,
        }
      : {};

    const structureId = await prisma.$transaction(async (tx) => {
      const existing = await tx.feeStructure.findFirst({
        where: { academicYearId: input.academicYearId, classLevelId: input.classLevelId },
        select: { id: true },
      });

      const structure = existing
        ? await tx.feeStructure.update({
            where: { id: existing.id },
            data: { name: input.name, isActive: true, ...payInFull },
          })
        : await tx.feeStructure.create({
            data: {
              schoolId,
              academicYearId: input.academicYearId,
              classLevelId: input.classLevelId,
              name: input.name,
              ...payInFull,
            },
          });

      await tx.feeStructureItem.deleteMany({ where: { feeStructureId: structure.id, schoolId } });
      await tx.feeStructureItem.createMany({
        data: input.items.map((item) => ({ schoolId, feeStructureId: structure.id, ...item })),
      });

      // Changing them changes what families who have not chosen yet are
      // offered. Families already billed keep their invoices.
      if (input.installments) {
        await tx.feeStructureInstallment.deleteMany({ where: { feeStructureId: structure.id } });
        await tx.feeStructureInstallment.createMany({
          data: input.installments.map((installment, position) => ({
            schoolId,
            feeStructureId: structure.id,
            position,
            label: `Installment ${position + 1}`,
            dueDate: installment.dueDate,
            amountInPaise: installment.amountInPaise,
          })),
        });
      }

      return structure.id;
    });

    await writeAuditLog({
      action: 'FEE_STRUCTURE_UPDATED',
      entity: 'FeeStructure',
      entityId: structureId,
      schoolId,
      actorUserId: req.auth!.userId,
      after: {
        name: input.name,
        items: input.items.length,
        installments: input.installments?.length ?? null,
        payInFull: input.payInFull ?? null,
      },
    });

    res.json({ id: structureId });
  }),
);

/* -------------------------------------------------------------------------- */
/* Concessions                                                                */
/* -------------------------------------------------------------------------- */

const concessionSchema = z.object({
  studentId: idSchema,
  academicYearId: idSchema,
  feeHeadId: idSchema.nullable().optional(),
  kind: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().min(1),
  reason: z.string().trim().min(3).max(200),
});

feeRouter.post(
  '/concessions',
  requirePermission('fee:manage_structure'),
  validate({ body: concessionSchema }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof concessionSchema>>(req);
    if (input.kind === 'PERCENT' && input.value > 100) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'A percentage concession cannot exceed 100' },
      });
      return;
    }

    res.status(201).json(
      await prisma.feeConcession.create({
        data: {
          schoolId: requireSchoolId(),
          studentId: input.studentId,
          academicYearId: input.academicYearId,
          feeHeadId: input.feeHeadId ?? null,
          kind: input.kind,
          value: input.value,
          reason: input.reason,
          approvedById: req.auth!.userId,
        },
      }),
    );
  }),
);

/* -------------------------------------------------------------------------- */
/* Invoices and payments                                                      */
/* -------------------------------------------------------------------------- */

const generateSchema = z.object({
  academicYearId: idSchema,
  periodLabel: z.string().trim().min(1).max(40),
  dueDate: z.coerce.date(),
  classLevelId: idSchema.optional(),
});

feeRouter.post(
  '/invoices/generate',
  requirePermission('fee:generate_invoice'),
  validate({ body: generateSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await fees.generateInvoices(body<z.infer<typeof generateSchema>>(req), req.auth!.userId),
    );
  }),
);

feeRouter.post(
  '/invoices/:id/cancel',
  requirePermission('fee:cancel_invoice'),
  validate({
    params: idParamSchema,
    body: z.object({ reason: z.string().trim().min(3).max(200) }),
  }),
  asyncHandler(async (req, res) => {
    await fees.cancelInvoice(id(req), body<{ reason: string }>(req).reason, req.auth!.userId);
    res.status(204).send();
  }),
);

const paymentSchema = z.object({
  studentId: idSchema,
  amountInPaise: z.number().int().min(1),
  method: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'CARD', 'ONLINE']),
  paidOn: z.coerce.date(),
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(200).optional(),
  allocations: z
    .array(z.object({ invoiceId: idSchema, amountInPaise: z.number().int().min(1) }))
    .optional(),
});

feeRouter.post(
  '/payments',
  requirePermission('fee:record_payment'),
  validate({ body: paymentSchema }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await fees.recordPayment(body<z.infer<typeof paymentSchema>>(req), req.auth!.userId));
  }),
);

feeRouter.post(
  '/payments/:id/refund',
  requirePermission('fee:refund'),
  validate({
    params: idParamSchema,
    body: z.object({ reason: z.string().trim().min(3).max(200) }),
  }),
  asyncHandler(async (req, res) => {
    res.json(
      await fees.refundPayment(id(req), body<{ reason: string }>(req).reason, req.auth!.userId),
    );
  }),
);

/**
 * The receipt itself, as a document.
 *
 * A receipt is what a parent is actually given, and until now the system could
 * produce the number but not the paper. Guarded inside the service by the same
 * check the ledger uses, so a parent can print their own child's and nobody
 * else's.
 */
feeRouter.get(
  '/payments/:id/receipt',
  requirePermission('fee:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { buffer, filename } = await documents.paymentReceipt(id(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }),
);

/** Every bill and payment for one child, on one page. */
feeRouter.get(
  '/students/:id/fee-card',
  requirePermission('fee:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { buffer, filename } = await documents.feeCard(id(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }),
);

feeRouter.get(
  '/students/:id/ledger',
  requirePermission('fee:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await fees.studentLedger(id(req)));
  }),
);

feeRouter.get(
  '/outstanding',
  // Deliberately not fee:read. Parents hold that so they can see their own
  // dues; a school-wide arrears list naming every family is an office report.
  requireRole('SCHOOL_ADMIN', 'PUBLICATION_ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json(await fees.outstandingReport());
  }),
);

/* -------------------------------------------------------------------------- */
/* Installment plans                                                          */
/* -------------------------------------------------------------------------- */

const yearQuerySchema = z.object({ academicYearId: idSchema.optional() });

/** The plans a school offers in a year, with what each comes to per class. */
feeRouter.get(
  '/plans',
  requirePermission('fee:manage_structure'),
  validate({ query: yearQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await plans.listPlans(query<{ academicYearId?: string }>(req).academicYearId));
  }),
);

feeRouter.post(
  '/plans',
  requirePermission('fee:manage_structure'),
  validate({ body: saveFeePlanSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await plans.savePlan(null, body<SaveFeePlanInput>(req), req.auth!.userId));
  }),
);

feeRouter.put(
  '/plans/:id',
  requirePermission('fee:manage_structure'),
  validate({ params: idParamSchema, body: saveFeePlanSchema }),
  asyncHandler(async (req, res) => {
    res.json(await plans.savePlan(id(req), body<SaveFeePlanInput>(req), req.auth!.userId));
  }),
);

feeRouter.delete(
  '/plans/:id',
  requirePermission('fee:manage_structure'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await plans.deletePlan(id(req));
    res.status(204).end();
  }),
);

/** When the school reminds families: before, on, and after the due date. */
feeRouter.get(
  '/reminders',
  requirePermission('fee:manage_structure'),
  asyncHandler(async (_req, res) => {
    res.json(await plans.reminderPolicy());
  }),
);

feeRouter.put(
  '/reminders',
  requirePermission('fee:manage_structure'),
  validate({ body: feeReminderPolicySchema }),
  asyncHandler(async (req, res) => {
    res.json(await plans.saveReminderPolicy(body<FeeReminderPolicyInput>(req), req.auth!.userId));
  }),
);

/** A child's plan for a year, as the office sees it. */
feeRouter.get(
  '/students/:id/plan',
  requirePermission('fee:read'),
  validate({ params: idParamSchema, query: yearQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await plans.planChoice(id(req), query<{ academicYearId?: string }>(req).academicYearId),
    );
  }),
);

/**
 * The office puts a child on a plan, or moves them to another. Paid and
 * part-paid installments stay; unpaid ones are replaced.
 */
feeRouter.put(
  '/students/:id/plan',
  requirePermission('fee:generate_invoice'),
  validate({ params: idParamSchema, body: chooseFeePlanSchema }),
  asyncHandler(async (req, res) => {
    res.json(await plans.changePlan(id(req), body<ChooseFeePlanInput>(req), req.auth!.userId));
  }),
);

/* -------------------------------------------------------------------------- */
/* Paying by bank or UPI, with a screenshot                                   */
/* -------------------------------------------------------------------------- */

/** The school's bank account and UPI ID, as families are shown them. */
feeRouter.get(
  '/payment-details',
  requirePermission('fee:manage_structure'),
  asyncHandler(async (_req, res) => {
    res.json(await payments.paymentDetails());
  }),
);

feeRouter.put(
  '/payment-details',
  requirePermission('fee:manage_structure'),
  validate({ body: paymentDetailsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await payments.savePaymentDetails(body<PaymentDetailsInput>(req), req.auth!.userId));
  }),
);

/** Screenshots families have sent, for the office to check. */
feeRouter.get(
  '/proofs',
  requirePermission('fee:record_payment'),
  validate({ query: z.object({ status: z.enum(['WAITING', 'APPROVED', 'REJECTED']).optional() }) }),
  asyncHandler(async (req, res) => {
    res.json(await payments.listProofs(query<{ status?: PaymentProofStatus }>(req).status));
  }),
);

feeRouter.get(
  '/proofs/count',
  requirePermission('fee:record_payment'),
  asyncHandler(async (_req, res) => {
    res.json({ waiting: await payments.waitingCount() });
  }),
);

feeRouter.post(
  '/proofs/:id/approve',
  requirePermission('fee:record_payment'),
  validate({ params: idParamSchema, body: approvePaymentProofSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await payments.approveProof(id(req), body<ApprovePaymentProofInput>(req), req.auth!.userId),
    );
  }),
);

feeRouter.post(
  '/proofs/:id/reject',
  requirePermission('fee:record_payment'),
  validate({ params: idParamSchema, body: rejectPaymentProofSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await payments.rejectProof(id(req), body<RejectPaymentProofInput>(req), req.auth!.userId),
    );
  }),
);

/** A child's payments waiting or checked, and the full-year offer, for the office. */
feeRouter.get(
  '/students/:id/payment-info',
  requirePermission('fee:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await payments.paymentInfo(id(req)));
  }),
);

/** Mark as fully paid: the money received, and the year closed. */
feeRouter.post(
  '/students/:id/settle',
  requirePermission('fee:record_payment'),
  validate({ params: idParamSchema, body: settleFeesSchema }),
  asyncHandler(async (req, res) => {
    res.json(await payments.settleYear(id(req), body<SettleFeesInput>(req), req.auth!.userId));
  }),
);

/* -------------------------------------------------------------------------- */
/* One installment                                                            */
/* -------------------------------------------------------------------------- */

/** What it is for, line by line, and the money recorded against it. */
feeRouter.get(
  '/invoices/:id',
  requirePermission('fee:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await fees.invoiceDetail(id(req)));
  }),
);

/** The invoice as a document — for the office, or the child's own family. */
feeRouter.get(
  '/invoices/:id/pdf',
  requirePermission('fee:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { buffer, filename } = await invoicePdf.feeInvoice(id(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }),
);

/* -------------------------------------------------------------------------- */
/* Following up unpaid installments                                           */
/* -------------------------------------------------------------------------- */

/** Families behind on an installment, with who to call. */
feeRouter.get(
  '/overdue',
  requirePermission('fee:record_payment'),
  asyncHandler(async (_req, res) => {
    res.json(await followUps.overdueFamilies());
  }),
);

feeRouter.get(
  '/follow-ups',
  requirePermission('fee:record_payment'),
  asyncHandler(async (_req, res) => {
    res.json(await followUps.listFollowUps());
  }),
);

feeRouter.post(
  '/follow-ups',
  requirePermission('fee:record_payment'),
  validate({ body: logFeeFollowUpSchema }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await followUps.logFollowUp(body<LogFeeFollowUpInput>(req), req.auth!.userId));
  }),
);

feeRouter.patch(
  '/follow-ups/:id',
  requirePermission('fee:record_payment'),
  validate({ params: idParamSchema, body: closeFeeFollowUpSchema }),
  asyncHandler(async (req, res) => {
    res.json(await followUps.closeFollowUp(id(req), body<CloseFeeFollowUpInput>(req)));
  }),
);

/** A payment, for good: what it paid is owed again, and its refund goes with it. */
feeRouter.delete(
  '/payments/:id',
  requireRole('SCHOOL_ADMIN', 'ORG_ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await erase.deletePayment(params<{ id: string }>(req).id, req.auth!.userId);
    res.status(204).end();
  }),
);

/** An invoice with no payment on it, for good. */
feeRouter.delete(
  '/invoices/:id',
  requireRole('SCHOOL_ADMIN', 'ORG_ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await erase.deleteInvoice(params<{ id: string }>(req).id, req.auth!.userId);
    res.status(204).end();
  }),
);
