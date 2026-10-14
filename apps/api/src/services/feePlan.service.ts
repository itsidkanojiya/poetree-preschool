import { Prisma } from '@prisma/client';
import type {
  ChooseFeePlanInput,
  FeePlanChoice,
  FeePlanOption,
  FeePlanView,
  FeeReminderPolicyInput,
  FeeReminderPolicyView,
  SaveFeePlanInput,
} from '@poetree/shared';
import { prisma, type TenantTransactionClient } from '../db/prisma.js';
import { getRequestContext, requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import {
  DEFAULT_REMINDER_POLICY,
  scheduleYear,
  schoolToday,
  yearOfFees,
  type Frequency,
  type HeadForYear,
  type PlanInstallment,
} from '../lib/feeSchedule.js';
import { writeAuditLog } from './audit.service.js';
import { assertMayReadLedger } from './fee.service.js';
import { nextDocumentNumber } from './sequence.service.js';

/**
 * Fee installment plans: the ways a school lets families spread a year's
 * fees, the plan a family chooses, and the installments that choice raises.
 *
 * An installment is an ordinary invoice. Once a plan is chosen its
 * installments are billed like anything else — payments, partial payments,
 * receipts, the parent's ledger and the reminders all work on them as they
 * are. Choosing a plan bills; it never marks anything paid.
 */

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

/* -------------------------------------------------------------------------- */
/* What a child's year costs                                                  */
/* -------------------------------------------------------------------------- */

interface ChildYear {
  academicYearId: string;
  academicYearName: string;
  classLevelId: string;
  heads: HeadForYear[];
}

/** The academic year asked for, or the school's current one. */
async function yearFor(academicYearId?: string) {
  const year = await prisma.academicYear.findFirst({
    where: academicYearId ? { id: academicYearId } : { isCurrent: true },
    select: { id: true, name: true, startDate: true },
  });
  if (!year) {
    throw academicYearId
      ? ApiError.notFound('Academic year not found')
      : ApiError.badRequest('The school has not set a current academic year yet');
  }
  return year;
}

/**
 * The child's class that year and what its fee structure charges them,
 * concessions taken off. Null when there is nothing to charge from yet.
 */
async function childYear(
  db: Pick<TenantTransactionClient, 'studentEnrolment' | 'feeStructure' | 'feeConcession'>,
  studentId: string,
  year: { id: string; name: string },
): Promise<ChildYear | null> {
  const enrolment = await db.studentEnrolment.findFirst({
    where: {
      studentId,
      academicYearId: year.id,
      status: { in: ['ACTIVE', 'PROMOTED', 'GRADUATED'] },
    },
    orderBy: { enrolledOn: 'desc' },
    select: { classroom: { select: { classLevelId: true } } },
  });
  if (!enrolment) return null;

  const structure = await db.feeStructure.findFirst({
    where: {
      academicYearId: year.id,
      classLevelId: enrolment.classroom.classLevelId,
      isActive: true,
    },
    select: {
      items: {
        select: {
          feeHeadId: true,
          amountInPaise: true,
          frequency: true,
          feeHead: { select: { name: true } },
        },
      },
    },
  });
  if (!structure || structure.items.length === 0) return null;

  const concessions = await db.feeConcession.findMany({
    where: { studentId, academicYearId: year.id },
    select: { kind: true, value: true, feeHeadId: true },
  });

  return {
    academicYearId: year.id,
    academicYearName: year.name,
    classLevelId: enrolment.classroom.classLevelId,
    heads: yearOfFees(
      structure.items.map((item) => ({
        feeHeadId: item.feeHeadId,
        name: item.feeHead.name,
        amountInPaise: item.amountInPaise,
        frequency: item.frequency as Frequency,
      })),
      concessions,
    ),
  };
}

const yearTotal = (heads: HeadForYear[]) =>
  heads.reduce((sum, h) => sum + h.grossInPaise - h.discountInPaise, 0);

type PlanWithInstallments = Prisma.FeePlanGetPayload<{ include: { installments: true } }>;

const asInstallments = (plan: PlanWithInstallments): PlanInstallment[] =>
  [...plan.installments]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({ label: i.label, dueDate: dateOnly(i.dueDate), weight: i.weight }));

const classLevelIdsOf = (plan: { classLevelIds: Prisma.JsonValue }): string[] =>
  Array.isArray(plan.classLevelIds)
    ? plan.classLevelIds.filter((id) => typeof id === 'string')
    : [];

const offeredTo = (plan: { classLevelIds: Prisma.JsonValue }, classLevelId: string) => {
  const ids = classLevelIdsOf(plan);
  return ids.length === 0 || ids.includes(classLevelId);
};

/* -------------------------------------------------------------------------- */
/* The office: plans                                                          */
/* -------------------------------------------------------------------------- */

const planInclude = {
  installments: { orderBy: { position: 'asc' as const } },
  academicYear: { select: { name: true } },
  _count: { select: { selections: true } },
} satisfies Prisma.FeePlanInclude;

type PlanRow = Prisma.FeePlanGetPayload<{ include: typeof planInclude }>;

async function toView(plan: PlanRow): Promise<FeePlanView> {
  const ids = classLevelIdsOf(plan);
  const [levels, structures] = await Promise.all([
    prisma.classLevel.findMany({
      where: ids.length > 0 ? { id: { in: ids } } : {},
      select: { id: true, name: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.feeStructure.findMany({
      where: {
        academicYearId: plan.academicYearId,
        isActive: true,
        ...(ids.length > 0 ? { classLevelId: { in: ids } } : {}),
      },
      select: {
        classLevel: { select: { id: true, name: true, sortOrder: true } },
        items: {
          select: {
            feeHeadId: true,
            amountInPaise: true,
            frequency: true,
            feeHead: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const installments = asInstallments(plan);
  return {
    id: plan.id,
    academicYearId: plan.academicYearId,
    academicYearName: plan.academicYear.name,
    name: plan.name,
    isEnabled: plan.isEnabled,
    classLevelIds: ids,
    classLevels: ids.length > 0 ? levels.map((l) => ({ id: l.id, name: l.name })) : [],
    installments,
    selections: plan._count.selections,
    // What one installment comes to per class, before any child's
    // concessions — so the office sees the plan in rupees, not weights.
    preview: structures
      .sort((a, b) => a.classLevel.sortOrder - b.classLevel.sortOrder)
      .map((structure) => {
        const heads = yearOfFees(
          structure.items.map((item) => ({
            feeHeadId: item.feeHeadId,
            name: item.feeHead.name,
            amountInPaise: item.amountInPaise,
            frequency: item.frequency as Frequency,
          })),
          [],
        );
        return {
          classLevelId: structure.classLevel.id,
          classLevelName: structure.classLevel.name,
          yearInPaise: yearTotal(heads),
          installmentsInPaise: scheduleYear(heads, installments).map((i) => i.netInPaise),
        };
      }),
  };
}

export async function listPlans(academicYearId?: string): Promise<FeePlanView[]> {
  const year = await yearFor(academicYearId);
  const plans = await prisma.feePlan.findMany({
    where: { academicYearId: year.id },
    include: planInclude,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return Promise.all(plans.map(toView));
}

async function assertPlanInput(input: SaveFeePlanInput): Promise<void> {
  await yearFor(input.academicYearId);
  if (input.classLevelIds.length > 0) {
    const found = await prisma.classLevel.count({ where: { id: { in: input.classLevelIds } } });
    if (found !== new Set(input.classLevelIds).size) {
      throw ApiError.badRequest('One of the classes was not found');
    }
  }
}

/**
 * Creates a plan, or changes one. A plan families already pay by keeps its
 * installments: changing the dates or shares under them would quietly move
 * what they owe, so the office makes a new plan instead and moves families
 * across one by one.
 */
export async function savePlan(
  planId: string | null,
  input: SaveFeePlanInput,
  actorUserId: string,
): Promise<FeePlanView> {
  const schoolId = requireSchoolId();
  await assertPlanInput(input);

  const installments = input.installments.map((installment, position) => ({
    schoolId,
    position,
    label: installment.label,
    dueDate: installment.dueDate,
    weight: installment.weight,
  }));

  const duplicate = await prisma.feePlan.findFirst({
    where: {
      academicYearId: input.academicYearId,
      name: input.name,
      ...(planId ? { NOT: { id: planId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) throw ApiError.conflict('There is already a plan by that name this year');

  let id = planId;
  if (planId) {
    const existing = await prisma.feePlan.findFirst({
      where: { id: planId },
      include: {
        installments: { orderBy: { position: 'asc' } },
        _count: { select: { selections: true } },
      },
    });
    if (!existing) throw ApiError.notFound('Plan not found');

    const scheduleChanged =
      existing.academicYearId !== input.academicYearId ||
      JSON.stringify(existing.installments.map((i) => [i.label, dateOnly(i.dueDate), i.weight])) !==
        JSON.stringify(installments.map((i) => [i.label, dateOnly(i.dueDate), i.weight]));

    if (scheduleChanged && existing._count.selections > 0) {
      throw ApiError.conflict(
        'Families already pay by this plan, so its installments cannot change. Switch it off and add a new plan instead.',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.feePlan.update({
        where: { id: planId },
        data: {
          academicYearId: input.academicYearId,
          name: input.name,
          isEnabled: input.isEnabled,
          classLevelIds: input.classLevelIds,
        },
      });
      if (scheduleChanged) {
        await tx.feePlanInstallment.deleteMany({ where: { planId } });
        await tx.feePlanInstallment.createMany({
          data: installments.map((i) => ({ ...i, planId })),
        });
      }
    });
  } else {
    const created = await prisma.feePlan.create({
      data: {
        schoolId,
        academicYearId: input.academicYearId,
        name: input.name,
        isEnabled: input.isEnabled,
        classLevelIds: input.classLevelIds,
        sortOrder: await prisma.feePlan.count({ where: { academicYearId: input.academicYearId } }),
        installments: { create: installments },
      },
      select: { id: true },
    });
    id = created.id;
  }

  await writeAuditLog({
    action: 'FEE_PLAN_SAVED',
    entity: 'FeePlan',
    entityId: id!,
    schoolId,
    actorUserId,
    after: {
      name: input.name,
      isEnabled: input.isEnabled,
      installments: input.installments.length,
    },
  });

  const row = await prisma.feePlan.findFirstOrThrow({ where: { id: id! }, include: planInclude });
  return toView(row);
}

/** Only a plan nobody has chosen; one in use is switched off instead. */
export async function deletePlan(planId: string): Promise<void> {
  const plan = await prisma.feePlan.findFirst({
    where: { id: planId },
    select: { id: true, _count: { select: { selections: true } } },
  });
  if (!plan) throw ApiError.notFound('Plan not found');
  if (plan._count.selections > 0) {
    throw ApiError.conflict('Families pay by this plan. Switch it off instead of deleting it.');
  }
  await prisma.feePlan.delete({ where: { id: planId } });
}

/* -------------------------------------------------------------------------- */
/* The office: reminders                                                      */
/* -------------------------------------------------------------------------- */

export async function reminderPolicy(): Promise<FeeReminderPolicyView> {
  const row = await prisma.feeReminderPolicy.findFirst({});
  if (!row) return { ...DEFAULT_REMINDER_POLICY };
  return {
    enabled: row.enabled,
    daysBefore: Array.isArray(row.daysBefore)
      ? row.daysBefore.filter((d): d is number => typeof d === 'number')
      : [],
    onDueDate: row.onDueDate,
    graceDays: row.graceDays,
    overdueEveryDays: row.overdueEveryDays,
    overdueMaxCount: row.overdueMaxCount,
  };
}

export async function saveReminderPolicy(
  input: FeeReminderPolicyInput,
  actorUserId: string,
): Promise<FeeReminderPolicyView> {
  const schoolId = requireSchoolId();
  const before = await reminderPolicy();
  const existing = await prisma.feeReminderPolicy.findFirst({ select: { id: true } });
  if (existing) {
    await prisma.feeReminderPolicy.update({ where: { id: existing.id }, data: input });
  } else {
    await prisma.feeReminderPolicy.create({ data: { schoolId, ...input } });
  }
  await writeAuditLog({
    action: 'FEE_REMINDERS_UPDATED',
    entity: 'FeeReminderPolicy',
    entityId: schoolId,
    schoolId,
    actorUserId,
    before,
    after: input,
  });
  return reminderPolicy();
}

/* -------------------------------------------------------------------------- */
/* A family: what they may choose                                             */
/* -------------------------------------------------------------------------- */

/**
 * The plans this child's family may choose from this year, what each comes to
 * for them, and — once one is chosen — which.
 */
export async function planChoice(
  studentId: string,
  academicYearId?: string,
): Promise<FeePlanChoice> {
  await assertMayReadLedger(studentId);
  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const year = await yearFor(academicYearId);
  const [fees, current, invoices] = await Promise.all([
    childYear(prisma, studentId, year),
    prisma.studentFeePlan.findFirst({
      where: { studentId, academicYearId: year.id },
      select: {
        planId: true,
        createdAt: true,
        chosenByRole: true,
        plan: { select: { name: true } },
      },
    }),
    prisma.feeInvoice.findMany({
      where: { studentId, academicYearId: year.id, status: { not: 'CANCELLED' } },
      select: { netInPaise: true, paidInPaise: true },
    }),
  ]);

  const yearInPaise = fees ? yearTotal(fees.heads) : invoices.reduce((s, i) => s + i.netInPaise, 0);
  const paidInPaise = invoices.reduce((s, i) => s + i.paidInPaise, 0);

  let options: FeePlanOption[] = [];
  if (fees) {
    const plans = await prisma.feePlan.findMany({
      where: { academicYearId: year.id, isEnabled: true },
      include: { installments: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    options = plans
      .filter((plan) => offeredTo(plan, fees.classLevelId))
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        installments: scheduleYear(fees.heads, asInstallments(plan)).map((i) => ({
          label: i.label,
          dueDate: i.dueDate,
          amountInPaise: i.netInPaise,
        })),
      }));
  }

  let reason: string | null = null;
  if (current) {
    reason =
      'Your installment plan is set for this year. To change it, please contact the school office.';
  } else if (!fees) {
    reason = 'The school has not set this year’s fees for this class yet.';
  } else if (invoices.length > 0) {
    reason =
      'This year’s fees have already been billed by the school. To pay them in installments, please contact the school office.';
  } else if (options.length === 0) {
    reason = 'The school has not offered installment plans for this class yet.';
  }

  return {
    academicYearId: year.id,
    academicYearName: year.name,
    yearInPaise,
    paidInPaise,
    remainingInPaise: Math.max(yearInPaise - paidInPaise, 0),
    current: current
      ? {
          planId: current.planId,
          planName: current.plan.name,
          chosenAt: current.createdAt.toISOString(),
          byFamily: current.chosenByRole === 'PARENT',
        }
      : null,
    canChoose: reason === null,
    reason,
    options,
  };
}

/** An installment label not yet used for this child this year. */
async function freeLabel(
  tx: TenantTransactionClient,
  studentId: string,
  academicYearId: string,
  label: string,
): Promise<string> {
  const taken = new Set(
    (
      await tx.feeInvoice.findMany({
        where: { studentId, academicYearId },
        select: { periodLabel: true },
      })
    ).map((i) => i.periodLabel),
  );
  if (!taken.has(label)) return label;
  for (let n = 2; ; n += 1) {
    const next = `${label} (${n})`.slice(0, 40);
    if (!taken.has(next)) return next;
  }
}

/** Raises a plan's installments as invoices, inside the caller's transaction. */
async function billInstallments(
  tx: TenantTransactionClient,
  input: {
    schoolId: string;
    studentId: string;
    academicYearId: string;
    studentFeePlanId: string;
    installments: ReturnType<typeof scheduleYear>;
  },
): Promise<number> {
  let billed = 0;
  for (const installment of input.installments) {
    const invoiceNo = await nextDocumentNumber(tx, {
      schoolId: input.schoolId,
      kind: 'INVOICE',
      academicYearId: input.academicYearId,
      defaultPrefix: 'INV-',
      padTo: 5,
    });
    const invoice = await tx.feeInvoice.create({
      data: {
        schoolId: input.schoolId,
        studentId: input.studentId,
        academicYearId: input.academicYearId,
        studentFeePlanId: input.studentFeePlanId,
        invoiceNo,
        periodLabel: await freeLabel(tx, input.studentId, input.academicYearId, installment.label),
        dueDate: new Date(`${installment.dueDate}T00:00:00Z`),
        grossInPaise: installment.grossInPaise,
        discountInPaise: installment.discountInPaise,
        netInPaise: installment.netInPaise,
        // Nothing to pay — a fully concessioned installment — is settled
        // already; it is not a debt to remind anyone of.
        status: installment.netInPaise === 0 ? 'PAID' : 'ISSUED',
      },
    });
    if (installment.lines.length > 0) {
      await tx.feeInvoiceLine.createMany({
        data: installment.lines.map((line) => ({
          schoolId: input.schoolId,
          invoiceId: invoice.id,
          feeHeadId: line.feeHeadId,
          description: line.description,
          amountInPaise: line.amountInPaise,
          discountInPaise: line.discountInPaise,
        })),
      });
    }
    billed += installment.netInPaise;
  }
  return billed;
}

/**
 * A family chooses how to pay this year. Their installments are billed at
 * once, in one transaction with the choice itself.
 *
 * Choosing twice is safe: the database holds one plan per child per year, so
 * a second tap — or a second phone — finds the first choice and returns it,
 * with no second schedule. A family can choose only before anything is billed
 * for the year; after that it is the office's to change.
 */
export async function choosePlan(
  studentId: string,
  input: ChooseFeePlanInput,
  actorUserId: string,
): Promise<FeePlanChoice> {
  const schoolId = requireSchoolId();
  const context = getRequestContext();
  await assertMayReadLedger(studentId);

  const year = await yearFor(input.academicYearId);
  const plan = await prisma.feePlan.findFirst({
    where: { id: input.planId, academicYearId: year.id, isEnabled: true },
    include: { installments: true },
  });
  if (!plan) throw ApiError.notFound('That plan is not offered');

  try {
    await prisma.$transaction(async (tx) => {
      const already = await tx.studentFeePlan.findFirst({
        where: { studentId, academicYearId: year.id },
        select: { planId: true },
      });
      // The same plan again is a second tap: the first choice stands. Another
      // plan is a change, and changes go through the office.
      if (already?.planId === plan.id) return;
      if (already) {
        throw ApiError.conflict(
          'Your installment plan is already set for this year. To change it, please contact the school office.',
        );
      }

      const billed = await tx.feeInvoice.count({
        where: { studentId, academicYearId: year.id, status: { not: 'CANCELLED' } },
      });
      if (billed > 0) {
        throw ApiError.conflict(
          'This year’s fees have already been billed. Please contact the school office to pay them in installments.',
        );
      }

      const fees = await childYear(tx, studentId, year);
      if (!fees)
        throw ApiError.conflict('The school has not set this year’s fees for this class yet.');
      if (!offeredTo(plan, fees.classLevelId)) throw ApiError.notFound('That plan is not offered');

      const selection = await tx.studentFeePlan.create({
        data: {
          schoolId,
          studentId,
          academicYearId: year.id,
          planId: plan.id,
          chosenById: actorUserId,
          chosenByRole: context?.role ?? 'PARENT',
        },
      });

      await billInstallments(tx, {
        schoolId,
        studentId,
        academicYearId: year.id,
        studentFeePlanId: selection.id,
        installments: scheduleYear(fees.heads, asInstallments(plan)),
      });
    });
  } catch (error) {
    // Two confirms at the same instant: the other one won, and its schedule
    // is the schedule.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      throw error;
    }
  }

  await writeAuditLog({
    action: 'FEE_PLAN_CHOSEN',
    entity: 'StudentFeePlan',
    entityId: studentId,
    schoolId,
    actorUserId,
    after: { planId: plan.id, planName: plan.name, academicYearId: year.id },
  });

  return planChoice(studentId, year.id);
}

/**
 * The office moves a child to another plan — or onto one, from period
 * billing. Nothing paid is lost or charged again:
 *
 *  - installments with money against them stay exactly as they are, still
 *    owing whatever is left on them;
 *  - installments with nothing paid are cancelled, with the reason given;
 *  - what the year still owes beyond the kept installments is billed again,
 *    head by head, over the new plan's installments that are not yet past.
 */
export async function changePlan(
  studentId: string,
  input: ChooseFeePlanInput,
  actorUserId: string,
): Promise<FeePlanChoice> {
  const schoolId = requireSchoolId();
  const context = getRequestContext();
  const year = await yearFor(input.academicYearId);

  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const plan = await prisma.feePlan.findFirst({
    where: { id: input.planId, academicYearId: year.id },
    include: { installments: true },
  });
  if (!plan) throw ApiError.notFound('Plan not found');

  const today = schoolToday(new Date());

  const summary = await prisma.$transaction(async (tx) => {
    const fees = await childYear(tx, studentId, year);
    if (!fees) throw ApiError.conflict('This child has no fee structure for that year');

    const previous = await tx.studentFeePlan.findFirst({
      where: { studentId, academicYearId: year.id },
      select: { id: true, planId: true },
    });

    const open = await tx.feeInvoice.findMany({
      where: { studentId, academicYearId: year.id, status: { not: 'CANCELLED' } },
      include: {
        lines: { select: { feeHeadId: true, amountInPaise: true, discountInPaise: true } },
      },
    });
    const kept = open.filter((invoice) => invoice.paidInPaise > 0);
    const replaced = open.filter((invoice) => invoice.paidInPaise === 0);

    if (replaced.length > 0) {
      await tx.feeInvoice.updateMany({
        where: { id: { in: replaced.map((i) => i.id) } },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledReason: `Replaced by the ${plan.name} plan`.slice(0, 200),
        },
      });
      await tx.feeFollowUp.updateMany({
        where: { invoiceId: { in: replaced.map((i) => i.id) }, status: 'PENDING' },
        data: { status: 'CANCELLED', closedAt: new Date(), closedReason: 'Installment replaced' },
      });
    }

    // What the kept installments already bill, head by head, comes off the
    // year; the rest is what the new plan bills.
    const keptByHead = new Map<string, { gross: number; discount: number }>();
    for (const invoice of kept) {
      for (const line of invoice.lines) {
        const sofar = keptByHead.get(line.feeHeadId) ?? { gross: 0, discount: 0 };
        sofar.gross += line.amountInPaise;
        sofar.discount += line.discountInPaise;
        keptByHead.set(line.feeHeadId, sofar);
      }
    }
    const remainingHeads = fees.heads.map((head) => {
      const sofar = keptByHead.get(head.feeHeadId) ?? { gross: 0, discount: 0 };
      const gross = Math.max(head.grossInPaise - sofar.gross, 0);
      return {
        ...head,
        grossInPaise: gross,
        discountInPaise: Math.min(Math.max(head.discountInPaise - sofar.discount, 0), gross),
      };
    });

    // The new plan's installments still to come; if all are past, one now.
    const upcoming = asInstallments(plan).filter((i) => i.dueDate >= today);
    const schedule =
      upcoming.length > 0
        ? upcoming
        : [{ label: plan.name.slice(0, 40), dueDate: today, weight: 1 }];

    const selection = previous
      ? await tx.studentFeePlan.update({
          where: { id: previous.id },
          data: {
            planId: plan.id,
            chosenById: actorUserId,
            chosenByRole: context?.role ?? 'SCHOOL_ADMIN',
          },
        })
      : await tx.studentFeePlan.create({
          data: {
            schoolId,
            studentId,
            academicYearId: year.id,
            planId: plan.id,
            chosenById: actorUserId,
            chosenByRole: context?.role ?? 'SCHOOL_ADMIN',
          },
        });

    const toBill = yearTotal(remainingHeads) > 0 ? scheduleYear(remainingHeads, schedule) : [];
    const billed = await billInstallments(tx, {
      schoolId,
      studentId,
      academicYearId: year.id,
      studentFeePlanId: selection.id,
      installments: toBill.filter((i) => i.netInPaise > 0 || i.grossInPaise > 0),
    });

    return {
      previousPlanId: previous?.planId ?? null,
      kept: kept.length,
      cancelled: replaced.length,
      billedInPaise: billed,
    };
  });

  await writeAuditLog({
    action: 'FEE_PLAN_CHANGED',
    entity: 'StudentFeePlan',
    entityId: studentId,
    schoolId,
    actorUserId,
    before: { planId: summary.previousPlanId },
    after: { planId: plan.id, ...summary },
  });

  return planChoice(studentId, year.id);
}
