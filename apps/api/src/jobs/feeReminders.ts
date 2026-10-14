import { Prisma } from '@prisma/client';
import { prismaUnscoped } from '../db/prisma.js';
import {
  DEFAULT_REMINDER_POLICY,
  addDays,
  reminderDueToday,
  schoolHour,
  schoolToday,
  type ReminderPolicy,
} from '../lib/feeSchedule.js';
import { logger } from '../lib/logger.js';
import { guardianUserIdsFor, notify } from '../services/notification.service.js';

/**
 * Fee reminders, from the server rather than the phone — a phone that is off,
 * reinstalled or out of signal still leaves the school's reminder going out.
 *
 * Runs every quarter hour inside the API. Each run looks at today, in the
 * school's time, and sends:
 *
 *  - an installment's reminder for today, if its school's policy has one —
 *    7 and 3 days before, on the day, then while overdue;
 *  - a follow-up's reminder on the date the office agreed with the family.
 *
 * Before anything is sent the installment is read again: one paid in the
 * meantime gets nothing, and a follow-up on it is closed. Each reminder is
 * logged under a unique key before it goes, so however often this runs —
 * or restarts, or runs twice at once — no family hears the same one twice.
 *
 * Quiet hours: nothing goes before 9 in the morning or after 8 at night.
 */

const FIRST_HOUR = 9;
const LAST_HOUR = 20;
const EVERY_MS = 15 * 60 * 1000;

export interface ReminderRun {
  sent: number;
  followUpsSent: number;
  followUpsClosed: number;
}

function policyOf(
  row: {
    enabled: boolean;
    daysBefore: Prisma.JsonValue;
    onDueDate: boolean;
    graceDays: number;
    overdueEveryDays: number;
    overdueMaxCount: number;
  } | null,
): ReminderPolicy {
  if (!row) return DEFAULT_REMINDER_POLICY;
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

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** What the family reads: the child, the installment, the amount and the date. */
function message(
  key: string,
  child: string,
  label: string,
  outstanding: number,
  dueDate: string,
): string {
  const what = `${child}’s ${label} fee of ${rupees(outstanding)}`;
  if (key === 'due') return `${what} is due today. Please review the pending installment.`;
  if (key.startsWith('before-')) {
    return `${what} is due on ${shortDate(dueDate)}. Please review the pending installment.`;
  }
  if (key.startsWith('overdue-')) {
    return `${what} was due on ${shortDate(dueDate)} and is still pending.`;
  }
  return `A reminder from the school: ${what} is still pending.`;
}

/** Writes the log row first: if it already exists, this reminder went before. */
async function claim(input: {
  schoolId: string;
  invoiceId: string;
  reminderKey: string;
  followUpId?: string;
}): Promise<string | null> {
  try {
    const row = await prismaUnscoped.feeReminderLog.create({
      data: {
        schoolId: input.schoolId,
        invoiceId: input.invoiceId,
        reminderKey: input.reminderKey,
        followUpId: input.followUpId ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return null;
    throw error;
  }
}

async function send(input: {
  schoolId: string;
  logId: string;
  studentId: string;
  invoiceId: string;
  body: string;
}): Promise<boolean> {
  const guardians = await guardianUserIdsFor([input.studentId]);
  if (guardians.length > 0) {
    await notify({
      schoolId: input.schoolId,
      userIds: guardians,
      type: 'FEE_DUE',
      title: 'Fee reminder',
      body: input.body,
      // Opens this installment's details in the app.
      entityType: 'FeeInvoice',
      entityId: input.invoiceId,
    });
  }
  await prismaUnscoped.feeReminderLog.update({
    where: { id: input.logId },
    data: { recipients: guardians.length },
  });
  return guardians.length > 0;
}

/**
 * One pass over every school. `now` is passed in so a test can stand at any
 * hour of any day; `quietHours: false` lets it run outside 9 to 8.
 */
export async function runFeeReminders(
  now: Date = new Date(),
  options: { quietHours?: boolean } = {},
): Promise<ReminderRun> {
  const run: ReminderRun = { sent: 0, followUpsSent: 0, followUpsClosed: 0 };
  const hour = schoolHour(now);
  if ((options.quietHours ?? true) && (hour < FIRST_HOUR || hour >= LAST_HOUR)) return run;

  const today = schoolToday(now);
  const schools = await prismaUnscoped.school.findMany({
    where: { status: { in: ['ACTIVE', 'TRIAL'] } },
    select: { id: true, feeReminderPolicy: true },
  });

  for (const school of schools) {
    const policy = policyOf(school.feeReminderPolicy);

    // Installments: any open one whose reminders could fall today.
    const furthest = Math.max(0, ...policy.daysBefore);
    const invoices = await prismaUnscoped.feeInvoice.findMany({
      where: {
        schoolId: school.id,
        status: { in: ['ISSUED', 'PARTIAL'] },
        dueDate: { lte: new Date(`${addDays(today, furthest)}T00:00:00Z`) },
      },
      select: {
        id: true,
        studentId: true,
        periodLabel: true,
        dueDate: true,
        netInPaise: true,
        paidInPaise: true,
        student: { select: { firstName: true } },
      },
    });

    for (const invoice of invoices) {
      const outstanding = invoice.netInPaise - invoice.paidInPaise;
      if (outstanding <= 0) continue;
      const dueDate = invoice.dueDate.toISOString().slice(0, 10);
      const key = reminderDueToday(dueDate, today, policy);
      if (!key) continue;

      const logId = await claim({ schoolId: school.id, invoiceId: invoice.id, reminderKey: key });
      if (!logId) continue;

      if (
        await send({
          schoolId: school.id,
          logId,
          studentId: invoice.studentId,
          invoiceId: invoice.id,
          body: message(key, invoice.student.firstName, invoice.periodLabel, outstanding, dueDate),
        })
      ) {
        run.sent += 1;
      }
    }

    // Follow-ups whose date has come.
    const followUps = await prismaUnscoped.feeFollowUp.findMany({
      where: {
        schoolId: school.id,
        status: 'PENDING',
        reminderSentAt: null,
        followUpOn: { lte: new Date(`${today}T00:00:00Z`) },
      },
      select: {
        id: true,
        studentId: true,
        remindParent: true,
        invoice: {
          select: {
            id: true,
            status: true,
            periodLabel: true,
            dueDate: true,
            netInPaise: true,
            paidInPaise: true,
            student: { select: { firstName: true } },
          },
        },
      },
    });

    for (const followUp of followUps) {
      const invoice = followUp.invoice;
      const outstanding = invoice.netInPaise - invoice.paidInPaise;

      // Paid, or cancelled, since the office agreed the date: nothing to chase.
      if (invoice.status === 'CANCELLED' || outstanding <= 0) {
        await prismaUnscoped.feeFollowUp.update({
          where: { id: followUp.id },
          data: {
            status: 'CANCELLED',
            closedAt: new Date(),
            closedReason: invoice.status === 'CANCELLED' ? 'Installment cancelled' : 'Paid',
          },
        });
        run.followUpsClosed += 1;
        continue;
      }

      // The office's own reminder; it shows on their follow-up list.
      if (!followUp.remindParent) continue;

      const logId = await claim({
        schoolId: school.id,
        invoiceId: invoice.id,
        reminderKey: `followup-${followUp.id}`,
        followUpId: followUp.id,
      });
      if (!logId) continue;

      await send({
        schoolId: school.id,
        logId,
        studentId: followUp.studentId,
        invoiceId: invoice.id,
        body: message(
          'followup',
          invoice.student.firstName,
          invoice.periodLabel,
          outstanding,
          invoice.dueDate.toISOString().slice(0, 10),
        ),
      });
      await prismaUnscoped.feeFollowUp.update({
        where: { id: followUp.id },
        data: { reminderSentAt: new Date() },
      });
      run.followUpsSent += 1;
    }
  }

  return run;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Starts the quarter-hourly run. One process runs it; there is one API process. */
export function startFeeReminders(): void {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const run = await runFeeReminders();
      if (run.sent + run.followUpsSent + run.followUpsClosed > 0) {
        logger.info('Fee reminders sent', { ...run });
      }
    } catch (error) {
      logger.error('Fee reminders failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };
  // Shortly after start-up, then every quarter hour.
  setTimeout(() => void tick(), 60_000).unref();
  timer = setInterval(() => void tick(), EVERY_MS);
  timer.unref();
}

export function stopFeeReminders(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
