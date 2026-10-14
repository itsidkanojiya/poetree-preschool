import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';
import { addDays, schoolToday } from '../../src/lib/feeSchedule.js';
import { runFeeReminders } from '../../src/jobs/feeReminders.js';

const dbUp = await isDatabaseReachable();

const rupees = (n: number) => n * 100;

/** 10:00 in the morning, India time, on a school date. */
const morningOf = (date: string) => new Date(`${date}T04:30:00Z`);

/**
 * Installment plans, end to end: the office offers them, a family chooses
 * one, its installments are billed once, payments settle them, reminders
 * come before and on the due date and stop when paid, the office chases what
 * is late, and the invoice prints — for that family and nobody else.
 *
 * The child's year is ₹12,000: tuition ₹10,000, activity ₹1,500 and
 * transport ₹500.
 */
describe.skipIf(!dbUp)('fee installment plans', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let neighbour: TestSchool;
  let admin: Session;
  let neighbourAdmin: Session;
  let parent: Session;
  let neighbourParent: Session;
  let teacher: Session;

  const today = schoolToday(new Date());
  const plans: Record<string, string> = {};
  let quarterIds: string[] = [];

  const offered = (session: Session) =>
    api.get(`${BASE}/me/children/${school.studentId}/fee-plan`).set(auth(session));

  const choose = (session: Session, planId: string, studentId = school.studentId) =>
    api
      .post(`${BASE}/me/children/${studentId}/fee-plan`)
      .set(auth(session))
      .send({ academicYearId: school.academicYearId, planId });

  const savePlan = (name: string, dueOffsets: number[], extra: Record<string, unknown> = {}) =>
    api
      .post(`${BASE}/fees/plans`)
      .set(auth(admin))
      .send({
        academicYearId: school.academicYearId,
        name,
        installments: dueOffsets.map((offset, i) => ({
          label: dueOffsets.length === 4 ? `Q${i + 1}` : `${name} ${i + 1}`,
          dueDate: addDays(today, offset),
          weight: 1,
        })),
        ...extra,
      });

  const pay = (amountInPaise: number, invoiceId: string) =>
    api
      .post(`${BASE}/fees/payments`)
      .set(auth(admin))
      .send({
        studentId: school.studentId,
        amountInPaise,
        method: 'UPI',
        paidOn: today,
        allocations: [{ invoiceId, amountInPaise }],
      });

  const parentUserId = async () =>
    (
      await prismaUnscoped.parentProfile.findUniqueOrThrow({
        where: { id: school.parentProfileId },
        select: { userId: true },
      })
    ).userId;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    neighbour = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);
    neighbourAdmin = await login(neighbour.adminEmail);
    parent = await login(school.parentPhone);
    neighbourParent = await login(neighbour.parentPhone);
    teacher = await login(school.teacherEmail);

    const nursery = await prismaUnscoped.classLevel.findFirstOrThrow({
      where: { code: 'NURSERY' },
    });
    const heads: string[] = [];
    for (const [code, name] of [
      ['TUITION', 'Tuition Fee'],
      ['ACTIVITY', 'Activity Fee'],
      ['TRANSPORT', 'Transport Fee'],
    ]) {
      const head = await api.post(`${BASE}/fees/heads`).set(auth(admin)).send({ code, name });
      heads.push(head.body.id as string);
    }
    await api
      .put(`${BASE}/fees/structures`)
      .set(auth(admin))
      .send({
        academicYearId: school.academicYearId,
        classLevelId: nursery.id,
        name: 'Nursery',
        items: [
          {
            feeHeadId: heads[0],
            amountInPaise: rupees(10_000),
            frequency: 'ANNUAL',
            dueDayOfMonth: 10,
          },
          {
            feeHeadId: heads[1],
            amountInPaise: rupees(1_500),
            frequency: 'ANNUAL',
            dueDayOfMonth: 10,
          },
          {
            feeHeadId: heads[2],
            amountInPaise: rupees(500),
            frequency: 'ANNUAL',
            dueDayOfMonth: 10,
          },
        ],
      })
      .expect(200);
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('lets the office offer plans, priced per class from the fee structure', async () => {
    const annual = await savePlan('Annual', [10]);
    const half = await savePlan('Half-yearly', [10, 190]);
    const quarterly = await savePlan('Quarterly', [10, 100, 190, 280]);
    const monthly = await savePlan(
      'Monthly',
      Array.from({ length: 12 }, (_, i) => 10 + i * 30),
      { isEnabled: false },
    );
    const juniorKg = await prismaUnscoped.classLevel.findFirstOrThrow({
      where: { code: 'JUNIOR_KG' },
    });
    const otherClass = await savePlan('Junior KG special', [10, 40], {
      classLevelIds: [juniorKg.id],
    });

    for (const response of [annual, half, quarterly, monthly, otherClass]) {
      expect(response.status).toBe(201);
    }
    Object.assign(plans, {
      annual: annual.body.id,
      half: half.body.id,
      quarterly: quarterly.body.id,
      monthly: monthly.body.id,
      other: otherClass.body.id,
    });

    // ₹12,000 a year: once, twice at ₹6,000, four times at ₹3,000.
    const nurseryPreview = (body: { preview: Array<{ installmentsInPaise: number[] }> }) =>
      body.preview[0]!.installmentsInPaise;
    expect(nurseryPreview(annual.body)).toEqual([rupees(12_000)]);
    expect(nurseryPreview(half.body)).toEqual([rupees(6_000), rupees(6_000)]);
    expect(nurseryPreview(quarterly.body)).toEqual(Array(4).fill(rupees(3_000)));
    expect(nurseryPreview(monthly.body)).toEqual(Array(12).fill(rupees(1_000)));

    // Dates out of order are refused; so is a family, or another school.
    const unordered = await api
      .post(`${BASE}/fees/plans`)
      .set(auth(admin))
      .send({
        academicYearId: school.academicYearId,
        name: 'Backwards',
        installments: [
          { label: 'A', dueDate: addDays(today, 50), weight: 1 },
          { label: 'B', dueDate: addDays(today, 10), weight: 1 },
        ],
      });
    expect(unordered.status).toBe(400);
    expect((await api.get(`${BASE}/fees/plans`).set(auth(parent))).status).toBe(403);
    const elsewhere = await api.get(`${BASE}/fees/plans`).set(auth(neighbourAdmin));
    expect(elsewhere.body).toEqual([]);
  });

  it('shows a family only the switched-on plans offered to their child’s class', async () => {
    const response = await offered(parent);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      yearInPaise: rupees(12_000),
      paidInPaise: 0,
      remainingInPaise: rupees(12_000),
      current: null,
      canChoose: true,
    });
    expect(response.body.options.map((o: { name: string }) => o.name)).toEqual([
      'Annual',
      'Half-yearly',
      'Quarterly',
    ]);
    const quarterly = response.body.options.find((o: { name: string }) => o.name === 'Quarterly');
    expect(quarterly.installments.map((i: { amountInPaise: number }) => i.amountInPaise)).toEqual(
      Array(4).fill(rupees(3_000)),
    );

    // Another family's child, and a teacher, see nothing of it.
    const other = await api
      .get(`${BASE}/me/children/${school.studentId}/fee-plan`)
      .set(auth(neighbourParent));
    expect(other.status).toBe(404);
    expect((await offered(teacher)).status).toBe(403);
  });

  it('bills a chosen plan once, however often Confirm is tapped', async () => {
    // Two phones, one moment.
    const [first, second] = await Promise.all([
      choose(parent, plans.quarterly!),
      choose(parent, plans.quarterly!),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // And once more for luck.
    expect((await choose(parent, plans.quarterly!)).status).toBe(200);

    const invoices = await prismaUnscoped.feeInvoice.findMany({
      where: { studentId: school.studentId, academicYearId: school.academicYearId },
      include: { lines: true },
      orderBy: { dueDate: 'asc' },
    });
    expect(invoices.map((i) => i.periodLabel)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(invoices.map((i) => i.netInPaise)).toEqual(Array(4).fill(rupees(3_000)));
    expect(invoices.map((i) => i.paidInPaise)).toEqual([0, 0, 0, 0]);
    expect(invoices.every((i) => i.status === 'ISSUED')).toBe(true);
    expect(invoices[0]!.lines.map((l) => l.amountInPaise).sort((a, b) => b - a)).toEqual([
      rupees(2_500),
      rupees(375),
      rupees(125),
    ]);
    quarterIds = invoices.map((i) => i.id);

    expect(
      await prismaUnscoped.studentFeePlan.count({ where: { studentId: school.studentId } }),
    ).toBe(1);

    const now = await offered(parent);
    expect(now.body).toMatchObject({
      canChoose: false,
      current: { planName: 'Quarterly', byFamily: true },
    });
  });

  it('keeps the plan set: another choice goes through the office', async () => {
    const other = await choose(parent, plans.annual!);
    expect(other.status).toBe(409);
    expect(
      await prismaUnscoped.feeInvoice.count({
        where: { studentId: school.studentId, status: { not: 'CANCELLED' } },
      }),
    ).toBe(4);
  });

  it('leaves a child on a plan out of period billing', async () => {
    const generated = await api
      .post(`${BASE}/fees/invoices/generate`)
      .set(auth(admin))
      .send({
        academicYearId: school.academicYearId,
        periodLabel: 'Annual',
        dueDate: addDays(today, 30),
      });
    expect(generated.status).toBe(200);
    expect(
      await prismaUnscoped.feeInvoice.count({
        where: { studentId: school.studentId, status: { not: 'CANCELLED' } },
      }),
    ).toBe(4);
  });

  it('works out what is owed from payments, partial and full', async () => {
    expect((await pay(rupees(1_000), quarterIds[0]!)).status).toBe(201);

    let q1 = await api.get(`${BASE}/fees/invoices/${quarterIds[0]}`).set(auth(parent));
    expect(q1.body).toMatchObject({
      state: 'PARTIAL',
      paidInPaise: rupees(1_000),
      outstandingInPaise: rupees(2_000),
      plan: { name: 'Quarterly', position: 1, count: 4 },
    });

    const ledger = await api
      .get(`${BASE}/fees/students/${school.studentId}/ledger`)
      .set(auth(parent));
    expect(ledger.body.totals).toMatchObject({
      billed: rupees(12_000),
      paid: rupees(1_000),
      outstanding: rupees(11_000),
    });
    expect(ledger.body.invoices[0]).toMatchObject({ id: quarterIds[0], state: 'PARTIAL' });

    expect((await pay(rupees(2_000), quarterIds[0]!)).status).toBe(201);
    q1 = await api.get(`${BASE}/fees/invoices/${quarterIds[0]}`).set(auth(parent));
    expect(q1.body).toMatchObject({ state: 'PAID', outstandingInPaise: 0 });
    expect(q1.body.payments.map((p: { amountInPaise: number }) => p.amountInPaise)).toEqual([
      rupees(1_000),
      rupees(2_000),
    ]);
  });

  it('reminds 7 and 3 days before and on the day — once each — and not once paid', async () => {
    const q2 = await prismaUnscoped.feeInvoice.findUniqueOrThrow({ where: { id: quarterIds[1]! } });
    const due = q2.dueDate.toISOString().slice(0, 10);

    const sevenBefore = await runFeeReminders(morningOf(addDays(due, -7)));
    expect(sevenBefore.sent).toBeGreaterThanOrEqual(1);
    // The same morning again: nothing new.
    await runFeeReminders(morningOf(addDays(due, -7)));
    await runFeeReminders(new Date(morningOf(addDays(due, -7)).getTime() + 3 * 3_600_000));

    const logs = await prismaUnscoped.feeReminderLog.findMany({ where: { invoiceId: q2.id } });
    expect(logs.map((l) => l.reminderKey)).toEqual(['before-7']);

    const inbox = await prismaUnscoped.notification.findMany({
      where: { userId: await parentUserId(), type: 'FEE_DUE', entityId: q2.id },
    });
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.body).toContain('₹3,000');

    // Late at night nothing goes at all.
    expect((await runFeeReminders(new Date(`${addDays(due, -3)}T17:30:00Z`))).sent).toBe(0);
    await runFeeReminders(morningOf(addDays(due, -3)));

    // Paid before the day: the due-date reminder never goes.
    expect((await pay(rupees(3_000), q2.id)).status).toBe(201);
    await runFeeReminders(morningOf(due));
    const after = await prismaUnscoped.feeReminderLog.findMany({
      where: { invoiceId: q2.id },
      orderBy: { sentAt: 'asc' },
    });
    expect(after.map((l) => l.reminderKey)).toEqual(['before-7', 'before-3']);
  });

  it('reminds an overdue installment while it stays unpaid', async () => {
    const q3 = await prismaUnscoped.feeInvoice.findUniqueOrThrow({ where: { id: quarterIds[2]! } });
    const due = q3.dueDate.toISOString().slice(0, 10);
    await runFeeReminders(morningOf(addDays(due, 1)));
    await runFeeReminders(morningOf(addDays(due, 2)));
    const logs = await prismaUnscoped.feeReminderLog.findMany({ where: { invoiceId: q3.id } });
    expect(logs.map((l) => l.reminderKey)).toEqual(['overdue-1']);
  });

  it('lets the office chase what is late, and schedule a reminder for next week', async () => {
    // Last year's unpaid fees, well past due.
    const lastYear = await prismaUnscoped.academicYear.create({
      data: {
        schoolId: school.id,
        name: '2025-26',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2026-04-30'),
        isCurrent: false,
      },
    });
    const old = await prismaUnscoped.feeInvoice.create({
      data: {
        schoolId: school.id,
        studentId: school.studentId,
        academicYearId: lastYear.id,
        invoiceNo: 'INV-OLD-1',
        periodLabel: 'Annual',
        dueDate: new Date(`${addDays(today, -10)}T00:00:00Z`),
        grossInPaise: rupees(500),
        netInPaise: rupees(500),
        status: 'ISSUED',
      },
    });

    const overdue = await api.get(`${BASE}/fees/overdue`).set(auth(admin));
    expect(overdue.status).toBe(200);
    expect(overdue.body).toHaveLength(1);
    expect(overdue.body[0]).toMatchObject({
      studentId: school.studentId,
      outstandingInPaise: rupees(500),
    });
    expect(overdue.body[0].guardians[0].phone).toBe(school.parentPhone);

    // A family and another school see none of it.
    expect((await api.get(`${BASE}/fees/overdue`).set(auth(parent))).status).toBe(403);
    expect((await api.get(`${BASE}/fees/overdue`).set(auth(neighbourAdmin))).body).toEqual([]);

    // The call: they asked for a week.
    const nextWeek = addDays(today, 7);
    const logged = await api.post(`${BASE}/fees/follow-ups`).set(auth(admin)).send({
      invoiceId: old.id,
      contactedAt: new Date().toISOString(),
      outcome: 'REQUESTED_TIME',
      note: 'Parent requested one more week.',
      followUpOn: nextWeek,
      remindParent: true,
    });
    expect(logged.status).toBe(201);
    expect(logged.body).toMatchObject({
      state: 'PENDING',
      followUpOn: nextWeek,
      outcome: 'REQUESTED_TIME',
    });

    // Not before the day; on the day, once.
    await runFeeReminders(morningOf(addDays(nextWeek, -1)));
    expect(
      await prismaUnscoped.feeReminderLog.count({ where: { followUpId: logged.body.id } }),
    ).toBe(0);
    await runFeeReminders(morningOf(nextWeek));
    await runFeeReminders(morningOf(nextWeek));
    expect(
      await prismaUnscoped.feeReminderLog.count({ where: { followUpId: logged.body.id } }),
    ).toBe(1);

    const list = await api.get(`${BASE}/fees/follow-ups`).set(auth(admin));
    expect(list.body[0]).toMatchObject({ id: logged.body.id, state: 'PENDING' });
    expect(list.body[0].reminderSentAt).not.toBeNull();

    // Done.
    const closed = await api
      .patch(`${BASE}/fees/follow-ups/${logged.body.id}`)
      .set(auth(admin))
      .send({ status: 'COMPLETED' });
    expect(closed.body.state).toBe('COMPLETED');
  });

  it('cancels a pending follow-up the moment its installment is paid', async () => {
    const q4 = quarterIds[3]!;
    const logged = await api
      .post(`${BASE}/fees/follow-ups`)
      .set(auth(admin))
      .send({ invoiceId: q4, followUpOn: addDays(today, 7), remindParent: true });
    expect(logged.status).toBe(201);

    expect((await pay(rupees(3_000), q4)).status).toBe(201);
    const followUp = await prismaUnscoped.feeFollowUp.findUniqueOrThrow({
      where: { id: logged.body.id },
    });
    expect(followUp).toMatchObject({ status: 'CANCELLED', closedReason: 'Paid' });

    await runFeeReminders(morningOf(addDays(today, 7)));
    expect(await prismaUnscoped.feeReminderLog.count({ where: { followUpId: followUp.id } })).toBe(
      0,
    );

    // Nothing more to chase on a paid installment.
    const again = await api
      .post(`${BASE}/fees/follow-ups`)
      .set(auth(admin))
      .send({ invoiceId: q4, followUpOn: addDays(today, 7) });
    expect(again.status).toBe(409);
  });

  it('moves a child to another plan without losing or repeating a rupee', async () => {
    // Q1, Q2 and Q4 are paid; only Q3 is not.
    const moved = await api
      .put(`${BASE}/fees/students/${school.studentId}/plan`)
      .set(auth(admin))
      .send({ academicYearId: school.academicYearId, planId: plans.half });
    expect(moved.status).toBe(200);
    expect(moved.body.current).toMatchObject({ planName: 'Half-yearly', byFamily: false });

    const live = await prismaUnscoped.feeInvoice.findMany({
      where: {
        studentId: school.studentId,
        academicYearId: school.academicYearId,
        status: { not: 'CANCELLED' },
      },
    });
    // Everything paid stays; the year still adds up to ₹12,000 exactly.
    expect(live.reduce((s, i) => s + i.netInPaise, 0)).toBe(rupees(12_000));
    expect(
      live
        .filter((i) => i.paidInPaise > 0)
        .map((i) => i.periodLabel)
        .sort(),
    ).toEqual(['Q1', 'Q2', 'Q4']);
    const q3 = await prismaUnscoped.feeInvoice.findUniqueOrThrow({ where: { id: quarterIds[2]! } });
    expect(q3.status).toBe('CANCELLED');
    expect(q3.cancelledReason).toContain('Half-yearly');

    // A family cannot do this themselves.
    const byParent = await api
      .put(`${BASE}/fees/students/${school.studentId}/plan`)
      .set(auth(parent))
      .send({ academicYearId: school.academicYearId, planId: plans.annual });
    expect(byParent.status).toBe(403);
  });

  it('prints an installment’s invoice for its family and nobody else', async () => {
    const own = await api
      .get(`${BASE}/fees/invoices/${quarterIds[0]}/pdf`)
      .set(auth(parent))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toContain('application/pdf');
    expect((own.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // Unpaid and part-paid invoices print too.
    const halfOne = await prismaUnscoped.feeInvoice.findFirstOrThrow({
      where: { studentId: school.studentId, status: 'ISSUED' },
    });
    expect((await api.get(`${BASE}/fees/invoices/${halfOne.id}/pdf`).set(auth(admin))).status).toBe(
      200,
    );

    expect(
      (await api.get(`${BASE}/fees/invoices/${quarterIds[0]}/pdf`).set(auth(neighbourParent)))
        .status,
    ).toBe(404);
    expect(
      (await api.get(`${BASE}/fees/invoices/${quarterIds[0]}/pdf`).set(auth(neighbourAdmin)))
        .status,
    ).toBe(404);
    expect(
      (await api.get(`${BASE}/fees/invoices/${quarterIds[0]}`).set(auth(teacher))).status,
    ).toBe(403);
  });

  it('follows the school’s own reminder settings', async () => {
    const saved = await api
      .put(`${BASE}/fees/reminders`)
      .set(auth(admin))
      .send({
        enabled: false,
        daysBefore: [3],
        onDueDate: true,
        graceDays: 0,
        overdueEveryDays: 7,
        overdueMaxCount: 3,
      });
    expect(saved.status).toBe(200);
    expect(saved.body.enabled).toBe(false);

    const open = await prismaUnscoped.feeInvoice.findFirstOrThrow({
      where: {
        studentId: school.studentId,
        academicYearId: school.academicYearId,
        status: 'ISSUED',
      },
    });
    const before = await prismaUnscoped.feeReminderLog.count({ where: { invoiceId: open.id } });
    await runFeeReminders(morningOf(addDays(open.dueDate.toISOString().slice(0, 10), -3)));
    expect(await prismaUnscoped.feeReminderLog.count({ where: { invoiceId: open.id } })).toBe(
      before,
    );
  });
});
