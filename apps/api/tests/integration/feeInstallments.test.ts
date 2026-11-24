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

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Fees typed per standard — installments as dates and amounts, a discount for
 * paying the year at once — and families paying by bank or UPI with a
 * screenshot the office approves.
 *
 * Nursery here: Tuition ₹45,000 a year in three installments of ₹15,000,
 * Admission ₹5,000 for a new child, and ₹2,000 off for paying in full.
 */
describe.skipIf(!dbUp)('fees by installment, and payment proofs', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let admin: Session;
  let parent: Session;
  let teacher: Session;
  let nurseryId: string;
  let tuitionId: string;
  let admissionId: string;
  const today = schoolToday(new Date());
  const dues = [addDays(today, 10), addDays(today, 100), addDays(today, 190)];

  /** A child in this year's Nursery, whose guardian is the seeded parent. */
  let serial = 0;
  const child = async () => {
    serial += 1;
    const student = await prismaUnscoped.student.create({
      data: {
        schoolId: school.id,
        admissionNo: `FI-${serial}`,
        firstName: `Child${serial}`,
        dateOfBirth: new Date('2021-01-01'),
        gender: 'FEMALE',
      },
    });
    await prismaUnscoped.studentEnrolment.create({
      data: {
        schoolId: school.id,
        studentId: student.id,
        academicYearId: school.academicYearId,
        classroomId: school.classroomId,
        status: 'ACTIVE',
      },
    });
    await prismaUnscoped.studentGuardian.create({
      data: {
        schoolId: school.id,
        studentId: student.id,
        parentProfileId: school.parentProfileId,
        isPrimary: true,
      },
    });
    return student.id;
  };

  const openInvoices = (studentId: string) =>
    prismaUnscoped.feeInvoice.findMany({
      where: { studentId, status: { not: 'CANCELLED' } },
      orderBy: { dueDate: 'asc' },
    });

  const screenshot = async (session: Session) => {
    const res = await api
      .post(`${BASE}/files`)
      .set(auth(session))
      .attach('file', TINY_PNG, { filename: 'paid.png', contentType: 'image/png' })
      .expect(201);
    return res.body.id as string;
  };

  const saveNursery = (extra: Record<string, unknown> = {}) =>
    api
      .put(`${BASE}/fees/structures`)
      .set(auth(admin))
      .send({
        academicYearId: school.academicYearId,
        classLevelId: nurseryId,
        name: 'Nursery',
        items: [
          { feeHeadId: tuitionId, amountInPaise: rupees(45_000), frequency: 'ANNUAL' },
          { feeHeadId: admissionId, amountInPaise: rupees(5_000), frequency: 'ONE_TIME' },
        ],
        installments: dues.map((dueDate) => ({ dueDate, amountInPaise: rupees(15_000) })),
        payInFull: { enabled: true, discountKind: 'FIXED', discountValue: rupees(2_000) },
        ...extra,
      });

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    admin = await login(school.adminEmail);
    parent = await login(school.parentPhone);
    teacher = await login(school.teacherEmail);
    nurseryId = (await prismaUnscoped.classLevel.findUniqueOrThrow({ where: { code: 'NURSERY' } }))
      .id;

    tuitionId = (
      await api
        .post(`${BASE}/fees/heads`)
        .set(auth(admin))
        .send({ code: 'TUITION', name: 'Tuition' })
    ).body.id;
    admissionId = (
      await api
        .post(`${BASE}/fees/heads`)
        .set(auth(admin))
        .send({ code: 'ADMISSION', name: 'Admission' })
    ).body.id;

    await api
      .put(`${BASE}/fees/payment-details`)
      .set(auth(admin))
      .send({
        bankEnabled: false,
        upiEnabled: true,
        upiId: 'alpha@okhdfc',
        upiName: 'Alpha Preschool',
      })
      .expect(200);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  /* ------------------------------------------------------------------------ */
  /* The office sets a standard's fees                                         */
  /* ------------------------------------------------------------------------ */

  describe('a standard’s installments and pay-in-full discount', () => {
    it('saves the installments as typed, and the discount', async () => {
      await saveNursery().expect(200);

      const structures = await api.get(`${BASE}/fees/structures`).set(auth(admin)).expect(200);
      const nursery = structures.body.find(
        (s: { classLevelId: string }) => s.classLevelId === nurseryId,
      );
      expect(
        nursery.installments.map((i: { dueDate: string; amountInPaise: number }) => [
          i.dueDate.slice(0, 10),
          i.amountInPaise,
        ]),
      ).toEqual(dues.map((d) => [d, rupees(15_000)]));
      expect(nursery.payInFullEnabled).toBe(true);
      expect(nursery.payInFullDiscountKind).toBe('FIXED');
      expect(nursery.payInFullDiscountValue).toBe(rupees(2_000));
    });

    it('refuses installments that do not add up to the year, and says by how much', async () => {
      const res = await saveNursery({
        installments: dues.map((dueDate) => ({ dueDate, amountInPaise: rupees(14_000) })),
      }).expect(400);
      expect(res.body.error.message).toMatch(/3,000/);
    });

    it('refuses installments out of date order', async () => {
      await saveNursery({
        installments: [...dues]
          .reverse()
          .map((dueDate) => ({ dueDate, amountInPaise: rupees(15_000) })),
      }).expect(400);
    });

    it('refuses a percentage discount over 100', async () => {
      await saveNursery({
        payInFull: { enabled: true, discountKind: 'PERCENT', discountValue: 120 },
      }).expect(400);
    });

    it('leaves the installments alone when a save does not mention them', async () => {
      await api
        .put(`${BASE}/fees/structures`)
        .set(auth(admin))
        .send({
          academicYearId: school.academicYearId,
          classLevelId: nurseryId,
          name: 'Nursery',
          items: [
            { feeHeadId: tuitionId, amountInPaise: rupees(45_000), frequency: 'ANNUAL' },
            { feeHeadId: admissionId, amountInPaise: rupees(5_000), frequency: 'ONE_TIME' },
          ],
        })
        .expect(200);
      expect(await prismaUnscoped.feeStructureInstallment.count()).toBe(3);
    });
  });

  describe('fee heads', () => {
    it('removes a head nothing has been billed for, taking it off the standards', async () => {
      const deposit = await api
        .post(`${BASE}/fees/heads`)
        .set(auth(admin))
        .send({ code: 'DEPOSIT', name: 'Deposit' })
        .expect(201);
      await api.delete(`${BASE}/fees/heads/${deposit.body.id}`).set(auth(admin)).expect(204);
      expect(await prismaUnscoped.feeHead.count({ where: { id: deposit.body.id } })).toBe(0);
    });

    it('keeps a head that is on an invoice', async () => {
      const studentId = await child();
      await api
        .put(`${BASE}/fees/students/${studentId}/plan`)
        .set(auth(admin))
        .send({ academicYearId: school.academicYearId, planId: 'INSTALLMENTS' })
        .expect(200);
      const res = await api.delete(`${BASE}/fees/heads/${tuitionId}`).set(auth(admin)).expect(409);
      expect(res.body.error.message).toMatch(/billed/i);
    });

    it('is the office’s to remove, not a teacher’s', async () => {
      await api.delete(`${BASE}/fees/heads/${admissionId}`).set(auth(teacher)).expect(403);
    });
  });

  /* ------------------------------------------------------------------------ */
  /* A family chooses how to pay                                               */
  /* ------------------------------------------------------------------------ */

  describe('a family’s choices', () => {
    it('offers the standard’s installments, admission with the first, and pay in full', async () => {
      const studentId = await child();
      const res = await api
        .get(`${BASE}/me/children/${studentId}/fee-plan`)
        .set(auth(parent))
        .expect(200);

      expect(res.body.yearInPaise).toBe(rupees(50_000));
      const installments = res.body.options.find((o: { id: string }) => o.id === 'INSTALLMENTS');
      expect(
        installments.installments.map((i: { amountInPaise: number }) => i.amountInPaise),
      ).toEqual([rupees(20_000), rupees(15_000), rupees(15_000)]);
      const full = res.body.options.find((o: { id: string }) => o.id === 'PAY_IN_FULL');
      expect(full.installments).toHaveLength(1);
      expect(full.installments[0].amountInPaise).toBe(rupees(48_000));
      expect(full.discountInPaise).toBe(rupees(2_000));
    });

    it('bills the installments exactly as typed when the family chooses them', async () => {
      const studentId = await child();
      await api
        .post(`${BASE}/me/children/${studentId}/fee-plan`)
        .set(auth(parent))
        .send({ academicYearId: school.academicYearId, planId: 'INSTALLMENTS' })
        .expect(200);

      const invoices = await openInvoices(studentId);
      expect(invoices.map((i) => [i.dueDate.toISOString().slice(0, 10), i.netInPaise])).toEqual([
        [dues[0], rupees(20_000)],
        [dues[1], rupees(15_000)],
        [dues[2], rupees(15_000)],
      ]);
    });

    it('bills one discounted invoice when the family chooses to pay in full', async () => {
      const studentId = await child();
      await api
        .post(`${BASE}/me/children/${studentId}/fee-plan`)
        .set(auth(parent))
        .send({ academicYearId: school.academicYearId, planId: 'PAY_IN_FULL' })
        .expect(200);

      const invoices = await openInvoices(studentId);
      expect(invoices).toHaveLength(1);
      expect(invoices[0]!.grossInPaise).toBe(rupees(50_000));
      expect(invoices[0]!.discountInPaise).toBe(rupees(2_000));
      expect(invoices[0]!.netInPaise).toBe(rupees(48_000));

      const plan = await api
        .get(`${BASE}/me/children/${studentId}/fee-plan`)
        .set(auth(parent))
        .expect(200);
      expect(plan.body.yearInPaise).toBe(rupees(48_000));
      expect(plan.body.current.planName).toBe('Pay in full');
    });

    it('works out a percentage discount off the whole year', async () => {
      await saveNursery({
        payInFull: { enabled: true, discountKind: 'PERCENT', discountValue: 10 },
      }).expect(200);
      const studentId = await child();
      const res = await api
        .get(`${BASE}/me/children/${studentId}/fee-plan`)
        .set(auth(parent))
        .expect(200);
      const full = res.body.options.find((o: { id: string }) => o.id === 'PAY_IN_FULL');
      expect(full.installments[0].amountInPaise).toBe(rupees(45_000));
      await saveNursery().expect(200);
    });

    it('does not offer pay in full when the school has switched it off', async () => {
      await saveNursery({
        payInFull: { enabled: false, discountKind: 'FIXED', discountValue: 0 },
      }).expect(200);
      const studentId = await child();
      const res = await api
        .get(`${BASE}/me/children/${studentId}/fee-plan`)
        .set(auth(parent))
        .expect(200);
      expect(res.body.options.map((o: { id: string }) => o.id)).toEqual(['INSTALLMENTS']);
      await saveNursery().expect(200);
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Where families pay                                                        */
  /* ------------------------------------------------------------------------ */

  describe('the school’s payment details', () => {
    it('shows a family only the ways that are switched on', async () => {
      const studentId = await child();
      const res = await api
        .get(`${BASE}/me/children/${studentId}/fee-payment`)
        .set(auth(parent))
        .expect(200);
      expect(res.body.details.upi).toEqual({ id: 'alpha@okhdfc', name: 'Alpha Preschool' });
      expect(res.body.details.bank).toBeNull();
    });

    it('needs an account number and IFSC to switch bank transfer on', async () => {
      await api
        .put(`${BASE}/fees/payment-details`)
        .set(auth(admin))
        .send({ bankEnabled: true, upiEnabled: true, upiId: 'alpha@okhdfc' })
        .expect(400);
    });

    it('is the office’s to change', async () => {
      await api
        .put(`${BASE}/fees/payment-details`)
        .set(auth(parent))
        .send({ bankEnabled: false, upiEnabled: true, upiId: 'mine@upi' })
        .expect(403);
    });
  });

  /* ------------------------------------------------------------------------ */
  /* A family sends proof; the office approves or rejects it                   */
  /* ------------------------------------------------------------------------ */

  describe('paying an installment with a screenshot', () => {
    let studentId: string;
    let firstInvoiceId: string;
    let proofId: string;

    beforeAll(async () => {
      studentId = await child();
      await api
        .post(`${BASE}/me/children/${studentId}/fee-plan`)
        .set(auth(parent))
        .send({ academicYearId: school.academicYearId, planId: 'INSTALLMENTS' })
        .expect(200);
      firstInvoiceId = (await openInvoices(studentId))[0]!.id;
    });

    it('takes the proof for what the installment owes, and waits for the school', async () => {
      const res = await api
        .post(`${BASE}/me/children/${studentId}/fee-payment-proofs`)
        .set(auth(parent))
        .send({
          kind: 'INSTALLMENT',
          invoiceId: firstInvoiceId,
          method: 'UPI',
          reference: '4312 8890 1122',
          screenshotFileId: await screenshot(parent),
        })
        .expect(201);
      proofId = res.body.id;
      expect(res.body.status).toBe('WAITING');
      expect(res.body.amountInPaise).toBe(rupees(20_000));

      // Nothing is paid until the school says so.
      const invoice = await prismaUnscoped.feeInvoice.findUniqueOrThrow({
        where: { id: firstInvoiceId },
      });
      expect(invoice.paidInPaise).toBe(0);
    });

    it('refuses a second proof for an installment already waiting', async () => {
      await api
        .post(`${BASE}/me/children/${studentId}/fee-payment-proofs`)
        .set(auth(parent))
        .send({
          kind: 'INSTALLMENT',
          invoiceId: firstInvoiceId,
          method: 'UPI',
          screenshotFileId: await screenshot(parent),
        })
        .expect(409);
    });

    it('refuses a way of paying the school has not switched on', async () => {
      const second = (await openInvoices(studentId))[1]!.id;
      await api
        .post(`${BASE}/me/children/${studentId}/fee-payment-proofs`)
        .set(auth(parent))
        .send({
          kind: 'INSTALLMENT',
          invoiceId: second,
          method: 'BANK_TRANSFER',
          screenshotFileId: await screenshot(parent),
        })
        .expect(400);
    });

    it('lets the family see their own screenshot', async () => {
      const proof = await prismaUnscoped.paymentProof.findUniqueOrThrow({ where: { id: proofId } });
      await api.get(`${BASE}/files/${proof.screenshotFileId}`).set(auth(parent)).expect(200);
    });

    it('shows the family it is waiting', async () => {
      const res = await api
        .get(`${BASE}/me/children/${studentId}/fee-payment`)
        .set(auth(parent))
        .expect(200);
      expect(res.body.proofs).toEqual([
        expect.objectContaining({ id: proofId, status: 'WAITING', invoiceId: firstInvoiceId }),
      ]);
    });

    it('pauses reminders for an installment waiting on the school', async () => {
      await prismaUnscoped.feeReminderPolicy.create({
        data: {
          schoolId: school.id,
          enabled: true,
          daysBefore: [10],
          onDueDate: true,
          graceDays: 0,
          overdueEveryDays: 7,
          overdueMaxCount: 3,
        },
      });
      await runFeeReminders(new Date(), { quietHours: false });
      expect(
        await prismaUnscoped.feeReminderLog.count({ where: { invoiceId: firstInvoiceId } }),
      ).toBe(0);
    });

    it('puts it in the office’s queue, with the count', async () => {
      const list = await api.get(`${BASE}/fees/proofs?status=WAITING`).set(auth(admin)).expect(200);
      expect(list.body.map((p: { id: string }) => p.id)).toContain(proofId);
      const row = list.body.find((p: { id: string }) => p.id === proofId);
      expect(row.student.name).toMatch(/Child/);
      expect(row.label).toBeTruthy();

      const count = await api.get(`${BASE}/fees/proofs/count`).set(auth(admin)).expect(200);
      expect(count.body.waiting).toBeGreaterThanOrEqual(1);
    });

    it('keeps the queue from parents', async () => {
      await api.get(`${BASE}/fees/proofs`).set(auth(parent)).expect(403);
    });

    it('records the payment with a receipt when the office approves', async () => {
      const res = await api
        .post(`${BASE}/fees/proofs/${proofId}/approve`)
        .set(auth(admin))
        .send({})
        .expect(200);
      expect(res.body.status).toBe('APPROVED');
      expect(res.body.receiptNo).toBeTruthy();

      const invoice = await prismaUnscoped.feeInvoice.findUniqueOrThrow({
        where: { id: firstInvoiceId },
      });
      expect(invoice.status).toBe('PAID');
      const proof = await prismaUnscoped.paymentProof.findUniqueOrThrow({ where: { id: proofId } });
      expect(proof.paymentId).toBeTruthy();
      expect(proof.reviewedById).toBe(school.adminId);
      const payment = await prismaUnscoped.payment.findUniqueOrThrow({
        where: { id: proof.paymentId! },
      });
      expect(payment.method).toBe('UPI');
      expect(payment.amountInPaise).toBe(rupees(20_000));

      const audit = await prismaUnscoped.auditLog.count({
        where: { action: 'FEE_PROOF_APPROVED', entityId: proofId },
      });
      expect(audit).toBe(1);
    });

    it('does not approve the same proof twice', async () => {
      await api
        .post(`${BASE}/fees/proofs/${proofId}/approve`)
        .set(auth(admin))
        .send({})
        .expect(409);
    });

    it('needs a reason to reject, and the family sees it', async () => {
      const second = (await openInvoices(studentId)).find((i) => i.status === 'ISSUED')!.id;
      const sent = await api
        .post(`${BASE}/me/children/${studentId}/fee-payment-proofs`)
        .set(auth(parent))
        .send({
          kind: 'INSTALLMENT',
          invoiceId: second,
          method: 'UPI',
          screenshotFileId: await screenshot(parent),
        })
        .expect(201);

      await api
        .post(`${BASE}/fees/proofs/${sent.body.id}/reject`)
        .set(auth(admin))
        .send({ reason: '' })
        .expect(400);
      await api
        .post(`${BASE}/fees/proofs/${sent.body.id}/reject`)
        .set(auth(admin))
        .send({ reason: 'The screenshot is blurry' })
        .expect(200);

      const info = await api
        .get(`${BASE}/me/children/${studentId}/fee-payment`)
        .set(auth(parent))
        .expect(200);
      expect(info.body.proofs.find((p: { id: string }) => p.id === sent.body.id)).toMatchObject({
        status: 'REJECTED',
        rejectReason: 'The screenshot is blurry',
      });

      // And may send it again.
      await api
        .post(`${BASE}/me/children/${studentId}/fee-payment-proofs`)
        .set(auth(parent))
        .send({
          kind: 'INSTALLMENT',
          invoiceId: second,
          method: 'UPI',
          screenshotFileId: await screenshot(parent),
        })
        .expect(201);
    });

    it('refuses pay in full once something has been paid', async () => {
      const res = await api
        .get(`${BASE}/me/children/${studentId}/fee-payment`)
        .set(auth(parent))
        .expect(200);
      expect(res.body.payInFull.available).toBe(false);
      await api
        .post(`${BASE}/me/children/${studentId}/fee-payment-proofs`)
        .set(auth(parent))
        .send({ kind: 'PAY_IN_FULL', method: 'UPI', screenshotFileId: await screenshot(parent) })
        .expect(409);
    });
  });

  describe('paying the year in full after the installments were billed', () => {
    it('closes the installments and bills the discounted year when approved', async () => {
      const studentId = await child();
      await api
        .post(`${BASE}/me/children/${studentId}/fee-plan`)
        .set(auth(parent))
        .send({ academicYearId: school.academicYearId, planId: 'INSTALLMENTS' })
        .expect(200);

      const info = await api
        .get(`${BASE}/me/children/${studentId}/fee-payment`)
        .set(auth(parent))
        .expect(200);
      expect(info.body.payInFull).toMatchObject({
        available: true,
        amountInPaise: rupees(48_000),
        discountInPaise: rupees(2_000),
      });

      const sent = await api
        .post(`${BASE}/me/children/${studentId}/fee-payment-proofs`)
        .set(auth(parent))
        .send({ kind: 'PAY_IN_FULL', method: 'UPI', screenshotFileId: await screenshot(parent) })
        .expect(201);
      expect(sent.body.amountInPaise).toBe(rupees(48_000));

      await api
        .post(`${BASE}/fees/proofs/${sent.body.id}/approve`)
        .set(auth(admin))
        .send({})
        .expect(200);

      const invoices = await openInvoices(studentId);
      expect(invoices).toHaveLength(1);
      expect(invoices[0]).toMatchObject({
        status: 'PAID',
        netInPaise: rupees(48_000),
        discountInPaise: rupees(2_000),
      });
      const cancelled = await prismaUnscoped.feeInvoice.count({
        where: { studentId, status: 'CANCELLED' },
      });
      expect(cancelled).toBe(3);
    });
  });

  /* ------------------------------------------------------------------------ */
  /* The office: mark as fully paid                                            */
  /* ------------------------------------------------------------------------ */

  describe('marking a year fully paid', () => {
    it('takes the discounted amount for a year with nothing paid, and closes it', async () => {
      const studentId = await child();
      await api
        .put(`${BASE}/fees/students/${studentId}/plan`)
        .set(auth(admin))
        .send({ academicYearId: school.academicYearId, planId: 'INSTALLMENTS' })
        .expect(200);

      const res = await api
        .post(`${BASE}/fees/students/${studentId}/settle`)
        .set(auth(admin))
        .send({ amountInPaise: rupees(48_000), method: 'CASH', paidOn: today })
        .expect(200);
      expect(res.body.receiptNo).toBeTruthy();

      const open = await prismaUnscoped.feeInvoice.count({
        where: { studentId, status: { in: ['ISSUED', 'PARTIAL'] } },
      });
      expect(open).toBe(0);
      const paid = await prismaUnscoped.feeInvoice.findMany({
        where: { studentId, status: 'PAID' },
      });
      expect(paid.reduce((s, i) => s + i.netInPaise, 0)).toBe(rupees(48_000));
    });

    it('closes every remaining installment after part of the year was paid', async () => {
      const studentId = await child();
      await api
        .put(`${BASE}/fees/students/${studentId}/plan`)
        .set(auth(admin))
        .send({ academicYearId: school.academicYearId, planId: 'INSTALLMENTS' })
        .expect(200);
      await api
        .post(`${BASE}/fees/payments`)
        .set(auth(admin))
        .send({ studentId, amountInPaise: rupees(20_000), method: 'CASH', paidOn: today })
        .expect(201);

      await api
        .post(`${BASE}/fees/students/${studentId}/settle`)
        .set(auth(admin))
        .send({ amountInPaise: rupees(25_000), method: 'UPI', paidOn: today, reference: 'UTR 77' })
        .expect(200);

      const open = await prismaUnscoped.feeInvoice.count({
        where: { studentId, status: { in: ['ISSUED', 'PARTIAL'] } },
      });
      expect(open).toBe(0);
      const audit = await prismaUnscoped.auditLog.count({
        where: { action: 'FEES_MARKED_FULLY_PAID', entityId: studentId },
      });
      expect(audit).toBe(1);

      // And the office sees nothing left to pay.
      const plan = await api
        .get(`${BASE}/fees/students/${studentId}/plan`)
        .set(auth(admin))
        .expect(200);
      expect(plan.body.remainingInPaise).toBe(0);
    });

    it('refuses more than the year still owes', async () => {
      const studentId = await child();
      await api
        .put(`${BASE}/fees/students/${studentId}/plan`)
        .set(auth(admin))
        .send({ academicYearId: school.academicYearId, planId: 'INSTALLMENTS' })
        .expect(200);
      await api
        .post(`${BASE}/fees/students/${studentId}/settle`)
        .set(auth(admin))
        .send({ amountInPaise: rupees(60_000), method: 'CASH', paidOn: today })
        .expect(400);
    });

    it('is not a teacher’s to do', async () => {
      const studentId = await child();
      await api
        .post(`${BASE}/fees/students/${studentId}/settle`)
        .set(auth(teacher))
        .send({ amountInPaise: rupees(1_000), method: 'CASH', paidOn: today })
        .expect(403);
    });
  });
});
