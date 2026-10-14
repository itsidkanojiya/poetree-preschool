/**
 * The arithmetic of installment plans, reminders and statuses — pure, so it
 * can be tested to the paisa without a database.
 *
 * Money is integer paise throughout. Every split here adds back up exactly:
 * a year's fee divided into installments is the year's fee again when the
 * installments are summed, whatever the rounding.
 */

export type Frequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL';

/** How many times a fee structure item is charged in a year. */
export const CHARGES_PER_YEAR: Record<Frequency, number> = {
  ONE_TIME: 1,
  ANNUAL: 1,
  HALF_YEARLY: 2,
  QUARTERLY: 4,
  MONTHLY: 12,
};

export interface StructureItem {
  feeHeadId: string;
  name: string;
  amountInPaise: number;
  frequency: Frequency;
}

export interface Concession {
  kind: 'PERCENT' | 'FIXED';
  /** Percent (0–100) or paise. */
  value: number;
  /** Null: the whole year's fee. */
  feeHeadId: string | null;
}

/** One fee head's share of the year: charged, discounted. */
export interface HeadForYear {
  feeHeadId: string;
  name: string;
  grossInPaise: number;
  discountInPaise: number;
}

/**
 * What a child is charged for the year, head by head, once concessions are
 * taken off.
 *
 * Percent concessions come off each head they name (or every head). A fixed
 * concession comes off the year once — off its own head, or, with no head,
 * shared across the heads in proportion to what each costs. Never below zero.
 */
export function yearOfFees(items: StructureItem[], concessions: Concession[]): HeadForYear[] {
  const heads = items.map((item) => ({
    feeHeadId: item.feeHeadId,
    name: item.name,
    grossInPaise: item.amountInPaise * CHARGES_PER_YEAR[item.frequency],
    discountInPaise: 0,
  }));

  for (const head of heads) {
    let discount = 0;
    for (const c of concessions) {
      if (c.feeHeadId !== null && c.feeHeadId !== head.feeHeadId) continue;
      if (c.kind === 'PERCENT') discount += Math.round((head.grossInPaise * c.value) / 100);
      else if (c.feeHeadId === head.feeHeadId) discount += c.value;
    }
    head.discountInPaise = Math.min(discount, head.grossInPaise);
  }

  // A fixed concession on the whole year, shared out by cost.
  const yearWide = concessions
    .filter((c) => c.kind === 'FIXED' && c.feeHeadId === null)
    .reduce((sum, c) => sum + c.value, 0);
  if (yearWide > 0) {
    const room = heads.map((h) => h.grossInPaise - h.discountInPaise);
    const shares = splitByWeights(Math.min(yearWide, sum(room)), room);
    heads.forEach((head, index) => {
      head.discountInPaise += shares[index]!;
    });
  }

  return heads;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/**
 * Divides a whole number of paise by weights, exactly: each gets its floor,
 * and the paise left over go one each to the largest remainders. Ties go to
 * the later share, so an uneven paisa lands on the last installment.
 */
export function splitByWeights(total: number, weights: number[]): number[] {
  const weightSum = sum(weights);
  if (weightSum <= 0 || total <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (total * w) / weightSum);
  const parts = exact.map(Math.floor);
  let left = total - sum(parts);

  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || b.index - a.index);

  for (const { index } of order) {
    if (left <= 0) break;
    parts[index]! += 1;
    left -= 1;
  }
  return parts;
}

export interface PlanInstallment {
  label: string;
  /** YYYY-MM-DD. */
  dueDate: string;
  weight: number;
}

export interface ScheduledLine {
  feeHeadId: string;
  description: string;
  amountInPaise: number;
  discountInPaise: number;
}

export interface ScheduledInstallment {
  label: string;
  dueDate: string;
  lines: ScheduledLine[];
  grossInPaise: number;
  discountInPaise: number;
  netInPaise: number;
}

/**
 * A year's fees laid out as a plan's installments, each itemised by head.
 *
 * What a family sees comes first: the year's net fee is divided by the
 * weights, so quarterly ₹12,000 is ₹3,000 four times to the paisa, not
 * ₹2,999.99 and ₹3,000.03. Each installment is then itemised by head, with the
 * largest head taking up the paisa of rounding so every head still sums to
 * its year exactly. Discounts are divided head by head and added on top of
 * the net, so no line can carry more discount than charge.
 */
export function scheduleYear(
  heads: HeadForYear[],
  installments: PlanInstallment[],
): ScheduledInstallment[] {
  const weights = installments.map((i) => i.weight);
  const nets = heads.map((h) => h.grossInPaise - h.discountInPaise);
  const rowNet = splitByWeights(sum(nets), weights);

  // Every head's net divided by the weights; then the largest head is
  // recomputed as whatever each installment still needs.
  const netCells = nets.map((net) => splitByWeights(net, weights));
  const balance = nets.indexOf(Math.max(...nets));
  if (balance >= 0) {
    const balanced = rowNet.map(
      (target, i) => target - sum(netCells.filter((_, h) => h !== balance).map((col) => col[i]!)),
    );
    // Only where that stays sensible — a head too small to take up the
    // rounding keeps its own even split, and the installments differ by paise.
    if (balanced.every((cell) => cell >= 0)) netCells[balance] = balanced;
  }

  const discountCells = heads.map((h) => splitByWeights(h.discountInPaise, weights));

  return installments.map((installment, index) => {
    const lines = heads
      .map((head, h) => ({
        feeHeadId: head.feeHeadId,
        description: head.name,
        amountInPaise: netCells[h]![index]! + discountCells[h]![index]!,
        discountInPaise: discountCells[h]![index]!,
      }))
      .filter((line) => line.amountInPaise > 0);
    const gross = sum(lines.map((l) => l.amountInPaise));
    const discount = sum(lines.map((l) => l.discountInPaise));
    return {
      label: installment.label,
      dueDate: installment.dueDate,
      lines,
      grossInPaise: gross,
      discountInPaise: discount,
      netInPaise: gross - discount,
    };
  });
}

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
