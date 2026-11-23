/**
 * Fee arithmetic that depends on the school's calendar: dates in IST,
 * installment states and reminders.
 *
 * The money side — a year's fees, concessions and splitting them into
 * installments — lives in @poetree/shared so the portal's live preview and the
 * bill are worked out by the same code. Re-exported here for the API.
 */
export {
  CHARGES_PER_YEAR,
  scheduleYear,
  splitByWeights,
  yearOfFees,
  type Concession,
  type Frequency,
  type HeadForYear,
  type PlanInstallment,
  type ScheduledInstallment,
  type ScheduledLine,
  type StructureItem,
} from '@poetree/shared';

/* -------------------------------------------------------------------------- */
/* Dates, in the school's time                                                */
/* -------------------------------------------------------------------------- */

/**
 * Schools on this platform are in India, and a due date is a date on the
 * school's calendar: "today" is today in IST, not on the server's clock.
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Today's date in the school's time zone, YYYY-MM-DD. */
export function schoolToday(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The hour of day in the school's time zone, 0–23. */
export function schoolHour(now: Date): number {
  return new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** A date plus some days, YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export type InstallmentState =
  'PAID' | 'PARTIAL' | 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'UPCOMING' | 'CANCELLED';

/** How near "due soon" begins. */
export const DUE_SOON_DAYS = 7;

/**
 * Where an installment stands today, from what is recorded against it —
 * never from what anybody chose or opened. Overdue outranks part-paid: a
 * family that paid half of a late installment still has a late installment.
 */
export function installmentState(
  invoice: { status: string; netInPaise: number; paidInPaise: number; dueDate: string },
  today: string,
): InstallmentState {
  if (invoice.status === 'CANCELLED') return 'CANCELLED';
  const outstanding = invoice.netInPaise - invoice.paidInPaise;
  if (outstanding <= 0) return 'PAID';

  const days = daysBetween(today, invoice.dueDate);
  if (days < 0) return 'OVERDUE';
  if (days === 0) return 'DUE_TODAY';
  if (invoice.paidInPaise > 0) return 'PARTIAL';
  if (days <= DUE_SOON_DAYS) return 'DUE_SOON';
  return 'UPCOMING';
}

/* -------------------------------------------------------------------------- */
/* Reminders                                                                  */
/* -------------------------------------------------------------------------- */

export interface ReminderPolicy {
  enabled: boolean;
  daysBefore: number[];
  onDueDate: boolean;
  graceDays: number;
  overdueEveryDays: number;
  overdueMaxCount: number;
}

/** What a school gets until its office says otherwise. */
export const DEFAULT_REMINDER_POLICY: ReminderPolicy = {
  enabled: true,
  daysBefore: [7, 3],
  onDueDate: true,
  graceDays: 0,
  overdueEveryDays: 7,
  overdueMaxCount: 3,
};

/**
 * The reminder an installment is owed today, if any, as the key it is logged
 * under: "before-7", "due", "overdue-2". Only today's — a reminder missed
 * while the server was down is not sent late, where "7 days to go" would
 * already be wrong.
 */
export function reminderDueToday(
  dueDate: string,
  today: string,
  policy: ReminderPolicy,
): string | null {
  if (!policy.enabled) return null;
  const days = daysBetween(today, dueDate);

  if (days > 0) return policy.daysBefore.includes(days) ? `before-${days}` : null;
  if (days === 0) return policy.onDueDate ? 'due' : null;

  // Overdue: the first reminder the day after the grace period, then every
  // overdueEveryDays, at most overdueMaxCount of them.
  if (policy.overdueEveryDays <= 0 || policy.overdueMaxCount <= 0) return null;
  const late = -days - policy.graceDays;
  if (late < 1 || (late - 1) % policy.overdueEveryDays !== 0) return null;
  const nth = (late - 1) / policy.overdueEveryDays + 1;
  return nth <= policy.overdueMaxCount ? `overdue-${nth}` : null;
}
