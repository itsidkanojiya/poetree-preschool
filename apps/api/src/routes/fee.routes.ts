import { Router, type Request } from 'express';
import { z } from 'zod';
import { idParamSchema, idSchema } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { requireRole } from '../middleware/requireRole.js';
import { body, params, validate } from '../middleware/validate.js';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import * as fees from '../services/fee.service.js';
import * as documents from '../services/document.service.js';

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
    res.status(201).json(
      await prisma.feeHead.create({ data: { schoolId: requireSchoolId(), ...input } }),
    );
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
});

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

    const structureId = await prisma.$transaction(async (tx) => {
      const existing = await tx.feeStructure.findFirst({
        where: { academicYearId: input.academicYearId, classLevelId: input.classLevelId },
        select: { id: true },
      });

      const structure = existing
        ? await tx.feeStructure.update({
            where: { id: existing.id },
            data: { name: input.name, isActive: true },
          })
        : await tx.feeStructure.create({
            data: {
              schoolId,
              academicYearId: input.academicYearId,
              classLevelId: input.classLevelId,
              name: input.name,
            },
          });

      await tx.feeStructureItem.deleteMany({ where: { feeStructureId: structure.id, schoolId } });
      await tx.feeStructureItem.createMany({
        data: input.items.map((item) => ({ schoolId, feeStructureId: structure.id, ...item })),
      });

      return structure.id;
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
  validate({ params: idParamSchema, body: z.object({ reason: z.string().trim().min(3).max(200) }) }),
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
  validate({ params: idParamSchema, body: z.object({ reason: z.string().trim().min(3).max(200) }) }),
  asyncHandler(async (req, res) => {
    res.json(await fees.refundPayment(id(req), body<{ reason: string }>(req).reason, req.auth!.userId));
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
