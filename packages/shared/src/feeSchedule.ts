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

/**
 * What a standard's typed installments must add up to: its recurring fees for
 * a year. A one-time fee is left out — it is added to the first installment,
 * and only for a child in their first year.
 */
export function recurringYearInPaise(
  items: Array<{ amountInPaise: number; frequency: Frequency }>,
): number {
  return items
    .filter((item) => item.frequency !== 'ONE_TIME')
    .reduce((total, item) => total + item.amountInPaise * CHARGES_PER_YEAR[item.frequency], 0);
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
  /** A one-time fee (admission): paid in full with the first installment. */
  upfront?: boolean;
}

export interface YearOptions {
  /**
   * Whether this is the child's first year at the school. One-time fees —
   * admission — are charged only then. Defaults to true, which is also what a
   * preview "for a new child" shows.
   */
  newChild?: boolean;
}

/**
 * What a child is charged for the year, head by head, once concessions are
 * taken off.
 *
 * Percent concessions come off each head they name (or every head). A fixed
 * concession comes off the year once — off its own head, or, with no head,
 * shared across the heads in proportion to what each costs. Never below zero.
 */
export function yearOfFees(
  items: StructureItem[],
  concessions: Concession[],
  options: YearOptions = {},
): HeadForYear[] {
  const newChild = options.newChild ?? true;
  const heads: HeadForYear[] = items
    // Admission is paid once, in the child's first year — not again on
    // every renewal.
    .filter((item) => item.frequency !== 'ONE_TIME' || newChild)
    .map((item) => ({
      feeHeadId: item.feeHeadId,
      name: item.name,
      grossInPaise: item.amountInPaise * CHARGES_PER_YEAR[item.frequency],
      discountInPaise: 0,
      ...(item.frequency === 'ONE_TIME' ? { upfront: true } : {}),
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
  // One-time fees are not divided: the whole of each goes in the first
  // installment, which is why a school's first installment is the larger one.
  const upfront = heads.filter((h) => h.upfront);
  const spread = scheduleSpread(
    heads.filter((h) => !h.upfront),
    installments,
  );
  if (upfront.length === 0 || spread.length === 0) return spread;

  const first = spread[0]!;
  const lines = [
    ...upfront
      .map((head) => ({
        feeHeadId: head.feeHeadId,
        description: head.name,
        amountInPaise: head.grossInPaise,
        discountInPaise: head.discountInPaise,
      }))
      .filter((line) => line.amountInPaise > 0),
    ...first.lines,
  ];
  const gross = sum(lines.map((l) => l.amountInPaise));
  const discount = sum(lines.map((l) => l.discountInPaise));
  spread[0] = {
    ...first,
    lines,
    grossInPaise: gross,
    discountInPaise: discount,
    netInPaise: gross - discount,
  };
  return spread;
}

/** The recurring fees divided across the installments by their weights. */
function scheduleSpread(
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
