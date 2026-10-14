import type {
  CloseFeeFollowUpInput,
  FeeFollowUpState,
  FeeFollowUpView,
  LogFeeFollowUpInput,
  OverdueFamily,
} from '@poetree/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { installmentState, schoolToday } from '../lib/feeSchedule.js';
import { studentName } from '../lib/names.js';
import { writeAuditLog } from './audit.service.js';

/**
 * The office chasing unpaid installments: who is behind, a record of each
 * contact, and the date to try again.
 *
 * A contact is recorded only when somebody logs it. Pressing Call opens the
 * phone; it is not evidence anyone answered, so nothing here records a call
 * on its own.
 */

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

const classroomOf = (
  enrolments: Array<{ classroom: { section: string; classLevel: { name: string } } }>,
) =>
  enrolments[0]
    ? `${enrolments[0].classroom.classLevel.name} — ${enrolments[0].classroom.section}`
    : null;

const studentSelect = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  admissionNo: true,
  enrolments: {
    where: { status: 'ACTIVE' as const },
    orderBy: { enrolledOn: 'desc' as const },
    take: 1,
    select: { classroom: { select: { section: true, classLevel: { select: { name: true } } } } },
  },
} satisfies Prisma.StudentSelect;

/** Families with an installment past its due date, most owed first. */
export async function overdueFamilies(): Promise<OverdueFamily[]> {
  const today = schoolToday(new Date());
  const invoices = await prisma.feeInvoice.findMany({
    where: {
      status: { in: ['ISSUED', 'PARTIAL'] },
      dueDate: { lt: new Date(`${today}T00:00:00Z`) },
    },
    orderBy: { dueDate: 'asc' },
    include: {
      student: {
        select: {
          ...studentSelect,
          guardians: {
            orderBy: { isPrimary: 'desc' },
            select: {
              relation: true,
              parentProfile: { select: { user: { select: { name: true, phone: true } } } },
            },
          },
        },
      },
    },
  });

  const pending = await prisma.feeFollowUp.findMany({
    where: { status: 'PENDING', studentId: { in: [...new Set(invoices.map((i) => i.studentId))] } },
    orderBy: { followUpOn: 'asc' },
    select: { id: true, studentId: true, followUpOn: true },
  });

  const families = new Map<string, OverdueFamily>();
  for (const invoice of invoices) {
    const outstanding = invoice.netInPaise - invoice.paidInPaise;
    if (outstanding <= 0) continue;
    const dueDate = dateOnly(invoice.dueDate);

    const family =
      families.get(invoice.studentId) ??
      ({
        studentId: invoice.studentId,
        studentName: studentName(invoice.student),
        admissionNo: invoice.student.admissionNo,
        classroomLabel: classroomOf(invoice.student.enrolments),
        guardians: invoice.student.guardians.map((g) => ({
          name: g.parentProfile.user.name,
          phone: g.parentProfile.user.phone,
          relation: g.relation,
        })),
        invoices: [],
        outstandingInPaise: 0,
        nextFollowUp: null,
      } satisfies OverdueFamily);

    family.invoices.push({
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      periodLabel: invoice.periodLabel,
      dueDate,
      outstandingInPaise: outstanding,
      state: installmentState(
        {
          status: invoice.status,
          netInPaise: invoice.netInPaise,
          paidInPaise: invoice.paidInPaise,
          dueDate,
        },
        today,
      ),
    });
    family.outstandingInPaise += outstanding;
    families.set(invoice.studentId, family);
  }

  for (const followUp of pending) {
    const family = families.get(followUp.studentId);
    if (family && !family.nextFollowUp) {
      family.nextFollowUp = { id: followUp.id, followUpOn: dateOnly(followUp.followUpOn) };
    }
  }

  return [...families.values()].sort((a, b) => b.outstandingInPaise - a.outstandingInPaise);
}

const followUpInclude = {
  student: { select: studentSelect },
  invoice: {
    select: {
      id: true,
      invoiceNo: true,
      periodLabel: true,
      dueDate: true,
      status: true,
      netInPaise: true,
      paidInPaise: true,
    },
  },
  loggedBy: { select: { name: true } },
} satisfies Prisma.FeeFollowUpInclude;

type FollowUpRow = Prisma.FeeFollowUpGetPayload<{ include: typeof followUpInclude }>;

function toView(row: FollowUpRow, today: string): FeeFollowUpView {
  const followUpOn = dateOnly(row.followUpOn);
  const dueDate = dateOnly(row.invoice.dueDate);
  const state: FeeFollowUpState =
    row.status === 'PENDING' ? (followUpOn < today ? 'OVERDUE' : 'PENDING') : row.status;
  return {
    id: row.id,
    student: {
      id: row.student.id,
      name: studentName(row.student),
      admissionNo: row.student.admissionNo,
      classroomLabel: classroomOf(row.student.enrolments),
    },
    invoice: {
      id: row.invoice.id,
      invoiceNo: row.invoice.invoiceNo,
      periodLabel: row.invoice.periodLabel,
      dueDate,
      outstandingInPaise: row.invoice.netInPaise - row.invoice.paidInPaise,
      state: installmentState(
        {
          status: row.invoice.status,
          netInPaise: row.invoice.netInPaise,
          paidInPaise: row.invoice.paidInPaise,
          dueDate,
        },
        today,
      ),
    },
    contactedAt: row.contactedAt?.toISOString() ?? null,
    outcome: row.outcome,
    note: row.note,
    followUpOn,
    remindParent: row.remindParent,
    state,
    reminderSentAt: row.reminderSentAt?.toISOString() ?? null,
    closedReason: row.closedReason,
    loggedBy: row.loggedBy.name,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The follow-ups: every open one, soonest first — overdue ones being those
 * whose date has passed — and those closed in the last month.
 */
export async function listFollowUps(): Promise<FeeFollowUpView[]> {
  const today = schoolToday(new Date());
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.feeFollowUp.findMany({
    where: {
      OR: [{ status: 'PENDING' }, { closedAt: { gte: monthAgo } }],
    },
    include: followUpInclude,
    orderBy: [{ followUpOn: 'asc' }, { createdAt: 'asc' }],
  });
  const views = rows.map((row) => toView(row, today));
  const open = views.filter((v) => v.state === 'PENDING' || v.state === 'OVERDUE');
  const closed = views.filter((v) => v.state === 'COMPLETED' || v.state === 'CANCELLED').reverse();
  return [...open, ...closed];
}

/**
 * Logs a contact about an unpaid installment, and when to follow up. A new
 * follow-up replaces any still open for the same installment, so a family
 * gets one reminder on the date agreed, not one per conversation.
 */
export async function logFollowUp(
  input: LogFeeFollowUpInput,
  actorUserId: string,
): Promise<FeeFollowUpView> {
  const schoolId = requireSchoolId();
  const today = schoolToday(new Date());

  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: input.invoiceId },
    select: {
      id: true,
      studentId: true,
      status: true,
      netInPaise: true,
      paidInPaise: true,
      invoiceNo: true,
    },
  });
  if (!invoice) throw ApiError.notFound('Installment not found');
  if (invoice.status === 'CANCELLED' || invoice.netInPaise - invoice.paidInPaise <= 0) {
    throw ApiError.conflict('That installment is already paid or cancelled');
  }

  const followUpOn = dateOnly(input.followUpOn);
  if (followUpOn < today) throw ApiError.badRequest('Choose a follow-up date from today onwards');
  if (input.contactedAt && input.contactedAt.getTime() > Date.now() + 5 * 60_000) {
    throw ApiError.badRequest('A contact cannot be logged in the future');
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.feeFollowUp.updateMany({
      where: { invoiceId: invoice.id, status: 'PENDING' },
      data: { status: 'COMPLETED', closedAt: new Date(), closedReason: 'Followed up again' },
    });
    return tx.feeFollowUp.create({
      data: {
        schoolId,
        studentId: invoice.studentId,
        invoiceId: invoice.id,
        contactedAt: input.contactedAt ?? null,
        outcome: input.outcome ?? null,
        note: input.note ?? null,
        followUpOn: new Date(`${followUpOn}T00:00:00Z`),
        remindParent: input.remindParent,
        loggedById: actorUserId,
      },
      include: followUpInclude,
    });
  });

  await writeAuditLog({
    action: 'FEE_FOLLOW_UP_LOGGED',
    entity: 'FeeFollowUp',
    entityId: created.id,
    schoolId,
    actorUserId,
    after: {
      invoiceNo: invoice.invoiceNo,
      outcome: input.outcome ?? null,
      followUpOn,
      remindParent: input.remindParent,
    },
  });

  return toView(created, today);
}

export async function closeFollowUp(
  followUpId: string,
  input: CloseFeeFollowUpInput,
): Promise<FeeFollowUpView> {
  const existing = await prisma.feeFollowUp.findFirst({
    where: { id: followUpId },
    select: { id: true, status: true },
  });
  if (!existing) throw ApiError.notFound('Follow-up not found');
  if (existing.status !== 'PENDING') throw ApiError.conflict('That follow-up is already closed');

  const row = await prisma.feeFollowUp.update({
    where: { id: followUpId },
    data: {
      status: input.status,
      closedAt: new Date(),
      closedReason: input.reason ?? (input.status === 'COMPLETED' ? 'Done' : 'Cancelled'),
    },
    include: followUpInclude,
  });
  return toView(row, schoolToday(new Date()));
}
