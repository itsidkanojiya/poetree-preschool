import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_POLICY,
  installmentState,
  reminderDueToday,
  scheduleYear,
  schoolToday,
  splitByWeights,
  yearOfFees,
  type PlanInstallment,
  type StructureItem,
} from '../../src/lib/feeSchedule.js';

const rupees = (n: number) => n * 100;

/** ₹12,000 a year: tuition ₹10,000, activity ₹1,500, transport ₹500. */
const items: StructureItem[] = [
  { feeHeadId: 'tuition', name: 'Tuition Fee', amountInPaise: rupees(10_000), frequency: 'ANNUAL' },
  {
    feeHeadId: 'activity',
    name: 'Activity Fee',
    amountInPaise: rupees(1_500),
    frequency: 'ANNUAL',
  },
  {
    feeHeadId: 'transport',
    name: 'Transport Fee',
    amountInPaise: rupees(500),
    frequency: 'ANNUAL',
  },
];

const plan = (n: number): PlanInstallment[] =>
  Array.from({ length: n }, (_, i) => ({
    label: `Installment ${i + 1}`,
    dueDate: `2026-${String(4 + i).padStart(2, '0')}-10`,
    weight: 1,
  }));

const nets = (installments: ReturnType<typeof scheduleYear>) =>
  installments.map((i) => i.netInPaise);

describe('a year of fees as installments', () => {
  const year = yearOfFees(items, []);

  it('is ₹12,000 once, annually', () => {
    expect(nets(scheduleYear(year, plan(1)))).toEqual([rupees(12_000)]);
  });

  it('is ₹6,000 twice, half-yearly', () => {
    expect(nets(scheduleYear(year, plan(2)))).toEqual([rupees(6_000), rupees(6_000)]);
  });

  it('is ₹3,000 four times, quarterly, each itemised by head', () => {
    const quarters = scheduleYear(year, plan(4));
    expect(nets(quarters)).toEqual(Array(4).fill(rupees(3_000)));
    expect(quarters[0]!.lines.map((l) => [l.description, l.amountInPaise])).toEqual([
      ['Tuition Fee', rupees(2_500)],
      ['Activity Fee', rupees(375)],
      ['Transport Fee', rupees(125)],
    ]);
  });

  it('is ₹1,000 twelve times, monthly — and each head still sums to its year', () => {
    const months = scheduleYear(year, plan(12));
    expect(nets(months)).toEqual(Array(12).fill(rupees(1_000)));
    for (const head of year) {
      const total = months.reduce(
        (sum, m) => sum + (m.lines.find((l) => l.feeHeadId === head.feeHeadId)?.amountInPaise ?? 0),
        0,
      );
      expect(total).toBe(head.grossInPaise);
    }
  });

  it('adds back to the year exactly when it does not divide evenly', () => {
    const thirds = scheduleYear(
      yearOfFees([{ ...items[0]!, amountInPaise: rupees(10_000) }], []),
      plan(3),
    );
    expect(nets(thirds)).toEqual([333_333, 333_333, 333_334]);
    expect(nets(thirds).reduce((a, b) => a + b)).toBe(rupees(10_000));
  });

  it('follows unequal weights — half up front', () => {
    const weighted = scheduleYear(year, [
      { label: 'First', dueDate: '2026-04-10', weight: 2 },
      { label: 'Second', dueDate: '2026-08-10', weight: 1 },
      { label: 'Third', dueDate: '2026-12-10', weight: 1 },
    ]);
    expect(nets(weighted)).toEqual([rupees(6_000), rupees(3_000), rupees(3_000)]);
  });

  it('counts a monthly item twelve times over the year', () => {
    const monthly = yearOfFees(
      [{ feeHeadId: 'meals', name: 'Meals', amountInPaise: rupees(800), frequency: 'MONTHLY' }],
      [],
    );
    expect(monthly[0]!.grossInPaise).toBe(rupees(9_600));
  });
});

describe('concessions in a plan', () => {
  it('takes a percentage off the heads it names, and the split still adds up', () => {
    const year = yearOfFees(items, [{ kind: 'PERCENT', value: 10, feeHeadId: 'tuition' }]);
    const quarters = scheduleYear(year, plan(4));
    expect(nets(quarters).reduce((a, b) => a + b)).toBe(rupees(11_000));
    expect(quarters[0]!.lines[0]).toMatchObject({
      amountInPaise: rupees(2_500),
      discountInPaise: rupees(250),
    });
  });

  it('shares a fixed amount off the whole year across the heads', () => {
    const year = yearOfFees(items, [{ kind: 'FIXED', value: rupees(1_200), feeHeadId: null }]);
    expect(year.reduce((s, h) => s + h.grossInPaise - h.discountInPaise, 0)).toBe(rupees(10_800));
  });

  it('never discounts below nothing, nor any line below nothing', () => {
    const year = yearOfFees(items, [{ kind: 'FIXED', value: rupees(50_000), feeHeadId: null }]);
    expect(year.every((h) => h.discountInPaise <= h.grossInPaise)).toBe(true);
    for (const installment of scheduleYear(year, plan(3))) {
      expect(installment.lines.every((l) => l.discountInPaise <= l.amountInPaise)).toBe(true);
      expect(installment.netInPaise).toBe(0);
    }
  });
});

describe('splitting by weights', () => {
  it('always adds back to the whole', () => {
    for (const total of [1, 7, 99, 100_001, 1_234_567]) {
      for (const weights of [[1], [1, 1, 1], [3, 1, 1, 2], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]]) {
        expect(splitByWeights(total, weights).reduce((a, b) => a + b)).toBe(total);
      }
    }
  });
});

describe('where an installment stands', () => {
  const today = '2026-10-14';
  const invoice = (
    over: Partial<{ status: string; netInPaise: number; paidInPaise: number; dueDate: string }>,
  ) => ({
    status: 'ISSUED',
    netInPaise: rupees(3_000),
    paidInPaise: 0,
    dueDate: '2026-12-31',
    ...over,
  });

  it('reads each state from what is recorded', () => {
    expect(installmentState(invoice({}), today)).toBe('UPCOMING');
    expect(installmentState(invoice({ dueDate: '2026-10-20' }), today)).toBe('DUE_SOON');
    expect(installmentState(invoice({ dueDate: today }), today)).toBe('DUE_TODAY');
    expect(installmentState(invoice({ dueDate: '2026-10-01' }), today)).toBe('OVERDUE');
    expect(installmentState(invoice({ paidInPaise: rupees(1_000) }), today)).toBe('PARTIAL');
    expect(installmentState(invoice({ paidInPaise: rupees(3_000), status: 'PAID' }), today)).toBe(
      'PAID',
    );
    expect(installmentState(invoice({ status: 'CANCELLED' }), today)).toBe('CANCELLED');
  });

  it('calls a part-paid late installment overdue', () => {
    expect(
      installmentState(invoice({ dueDate: '2026-10-01', paidInPaise: rupees(1_000) }), today),
    ).toBe('OVERDUE');
  });
});

describe('reminders', () => {
  const due = '2026-10-31';
  const on = (today: string) => reminderDueToday(due, today, DEFAULT_REMINDER_POLICY);

  it('comes 7 days and 3 days before, and on the day', () => {
    expect(on('2026-10-24')).toBe('before-7');
    expect(on('2026-10-28')).toBe('before-3');
    expect(on('2026-10-31')).toBe('due');
    expect(on('2026-10-25')).toBeNull();
  });

  it('comes weekly while overdue, three times at most', () => {
    expect(on('2026-11-01')).toBe('overdue-1');
    expect(on('2026-11-02')).toBeNull();
    expect(on('2026-11-08')).toBe('overdue-2');
    expect(on('2026-11-15')).toBe('overdue-3');
    expect(on('2026-11-22')).toBeNull();
  });

  it('waits out a grace period, and stays silent when switched off', () => {
    const grace = { ...DEFAULT_REMINDER_POLICY, graceDays: 2 };
    expect(reminderDueToday(due, '2026-11-01', grace)).toBeNull();
    expect(reminderDueToday(due, '2026-11-03', grace)).toBe('overdue-1');
    expect(
      reminderDueToday(due, '2026-10-31', { ...DEFAULT_REMINDER_POLICY, enabled: false }),
    ).toBeNull();
  });
});

describe('the school’s day', () => {
  it('is India’s date, not the server’s', () => {
    // 19:00 UTC on the 14th is 00:30 on the 15th in India.
    expect(schoolToday(new Date('2026-10-14T19:00:00Z'))).toBe('2026-10-15');
    expect(schoolToday(new Date('2026-10-14T18:00:00Z'))).toBe('2026-10-14');
  });
});
