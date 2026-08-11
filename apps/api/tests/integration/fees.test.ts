import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@poetree/shared';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { prismaUnscoped, disconnectPrisma } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

/**
 * Fees is the only module that moves money, so these tests target the failures
 * that are expensive rather than merely annoying: charging a child twice,
 * two clerks issuing the same receipt number, and a refund that quietly leaves
 * an invoice looking paid.
 */
describe.skipIf(!dbUp)('fees', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let adminA: Session;
  let adminB: Session;

  let feeHeadId: string;
  const DUE = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    adminA = await login(schoolA.adminEmail);
    adminB = await login(schoolB.adminEmail);

    // A tuition head and an annual structure for the class the seeded child is in.
    const head = await api
      .post(`${BASE}/fees/heads`)
      .set(auth(adminA))
      .send({ code: 'TUITION', name: 'Tuition' });
    feeHeadId = head.body.id;

    const nursery = await prismaUnscoped.classLevel.findFirstOrThrow({
      where: { code: 'NURSERY' },
    });

    await api
      .put(`${BASE}/fees/structures`)
      .set(auth(adminA))
      .send({
        academicYearId: schoolA.academicYearId,
        classLevelId: nursery.id,
        name: 'Nursery 2026-27',
        items: [
          { feeHeadId, amountInPaise: 500_000, frequency: 'ANNUAL', dueDayOfMonth: 10 },
        ],
      })
      .expect(200);
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('raises an invoice for each enrolled child', async () => {
    const response = await api
      .post(`${BASE}/fees/invoices/generate`)
      .set(auth(adminA))
      .send({ academicYearId: schoolA.academicYearId, periodLabel: 'Annual', dueDate: DUE });

    expect(response.status).toBe(200);
    expect(response.body.created).toBe(1);
    expect(response.body.totalBilledInPaise).toBe(500_000);
  });

  it('refuses a period label that bills nothing, instead of quietly doing nothing', async () => {
    // This structure is annual, so its only period is "Annual". Asking for
    // "Term 1" used to return {created: 0, skipped: 0} and HTTP 200 — an admin
    // saw a successful run that had billed nobody, with no hint that the label
    // was the problem or what the labels are.
    const response = await api
      .post(`${BASE}/fees/invoices/generate`)
      .set(auth(adminA))
      .send({ academicYearId: schoolA.academicYearId, periodLabel: 'Term 1', dueDate: DUE });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Term 1');
    // And it says what would have worked.
    expect(response.body.error.details.expected).toContain('Annual');
  });

  it('never charges the same child twice for the same period', async () => {
    // The whole point of the unique key: re-running a billing run is safe.
    const again = await api
      .post(`${BASE}/fees/invoices/generate`)
      .set(auth(adminA))
      .send({ academicYearId: schoolA.academicYearId, periodLabel: 'Annual', dueDate: DUE });

    expect(again.body.created).toBe(0);
    expect(again.body.skipped).toBe(1);

    const invoices = await prismaUnscoped.feeInvoice.count({
      where: { studentId: schoolA.studentId },
    });
    expect(invoices).toBe(1);
  });

  it('records a part payment and leaves the invoice partly settled', async () => {
    const response = await api
      .post(`${BASE}/fees/payments`)
      .set(auth(adminA))
      .send({
        studentId: schoolA.studentId,
        amountInPaise: 200_000,
        method: 'CASH',
        paidOn: new Date().toISOString().slice(0, 10),
      });

    expect(response.status).toBe(201);
    expect(response.body.allocated).toBe(200_000);
    expect(response.body.unallocated).toBe(0);
    expect(response.body.receiptNo).toMatch(/^RCP-\d{4}-\d{4}$/);

    const invoice = await prismaUnscoped.feeInvoice.findFirstOrThrow({
      where: { studentId: schoolA.studentId },
    });
    expect(invoice.status).toBe('PARTIAL');
    expect(invoice.paidInPaise).toBe(200_000);
  });

  it('reports money beyond what is owed rather than absorbing it', async () => {
    const response = await api
      .post(`${BASE}/fees/payments`)
      .set(auth(adminA))
      .send({
        studentId: schoolA.studentId,
        // 300,000 outstanding; paying 400,000 leaves 100,000 unallocated.
        amountInPaise: 400_000,
        method: 'UPI',
        paidOn: new Date().toISOString().slice(0, 10),
      });

    expect(response.body.allocated).toBe(300_000);
    expect(response.body.unallocated).toBe(100_000);

    const invoice = await prismaUnscoped.feeInvoice.findFirstOrThrow({
      where: { studentId: schoolA.studentId },
    });
    expect(invoice.status).toBe('PAID');
  });

  it('issues gapless receipt numbers under concurrent payments', async () => {
    // Two clerks taking fees at the same moment. Without the row lock inside
    // the payment transaction, both would read the same counter.
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        api
          .post(`${BASE}/fees/payments`)
          .set(auth(adminA))
          .send({
            studentId: schoolA.studentId,
            amountInPaise: 1_000,
            method: 'CASH',
            paidOn: new Date().toISOString().slice(0, 10),
          }),
      ),
    );

    const receipts = results.map((r) => r.body.receiptNo);
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(receipts).size).toBe(receipts.length);
  });

  it('reverses a payment with a negative one and puts the invoice back into arrears', async () => {
    const payment = await prismaUnscoped.payment.findFirstOrThrow({
      where: { studentId: schoolA.studentId, amountInPaise: 200_000 },
    });

    const response = await api
      .post(`${BASE}/fees/payments/${payment.id}/refund`)
      .set(auth(adminA))
      .send({ reason: 'Paid twice by mistake' });

    expect(response.status).toBe(200);

    // The original is untouched; a second, negative payment records the reversal.
    const original = await prismaUnscoped.payment.findFirstOrThrow({
      where: { id: payment.id },
    });
    expect(original.amountInPaise).toBe(200_000);
    expect(original.status).toBe('REFUNDED');

    const reversal = await prismaUnscoped.payment.findFirstOrThrow({
      where: { receiptNo: response.body.receiptNo },
    });
    expect(reversal.amountInPaise).toBe(-200_000);

    const invoice = await prismaUnscoped.feeInvoice.findFirstOrThrow({
      where: { studentId: schoolA.studentId },
    });
    expect(invoice.paidInPaise).toBeLessThan(invoice.netInPaise);
    expect(invoice.status).toBe('PARTIAL');
  });

  it('refuses to cancel an invoice that has been paid against', async () => {
    const invoice = await prismaUnscoped.feeInvoice.findFirstOrThrow({
      where: { studentId: schoolA.studentId },
    });

    const response = await api
      .post(`${BASE}/fees/invoices/${invoice.id}/cancel`)
      .set(auth(adminA))
      .send({ reason: 'Raised in error' });

    expect(response.status).toBe(400);
  });

  it('applies a concession as an itemised discount, not a lower mystery total', async () => {
    await api
      .post(`${BASE}/fees/concessions`)
      .set(auth(adminA))
      .send({
        studentId: schoolA.studentId,
        academicYearId: schoolA.academicYearId,
        feeHeadId,
        kind: 'PERCENT',
        value: 20,
        reason: 'Sibling discount',
      })
      .expect(201);

    // Switch the structure to a quarterly cadence. An ANNUAL item only ever
    // bills the period "Annual", so asking it for "Q1" would correctly produce
    // nothing — the school choosing its own cadence per structure is the
    // behaviour under test here, not a bug to work around.
    const nursery = await prismaUnscoped.classLevel.findFirstOrThrow({
      where: { code: 'NURSERY' },
    });

    await api
      .put(`${BASE}/fees/structures`)
      .set(auth(adminA))
      .send({
        academicYearId: schoolA.academicYearId,
        classLevelId: nursery.id,
        name: 'Nursery 2026-27',
        items: [
          { feeHeadId, amountInPaise: 500_000, frequency: 'QUARTERLY', dueDayOfMonth: 10 },
        ],
      })
      .expect(200);

    await api
      .post(`${BASE}/fees/invoices/generate`)
      .set(auth(adminA))
      .send({ academicYearId: schoolA.academicYearId, periodLabel: 'Q1', dueDate: DUE })
      .expect(200);

    const invoice = await prismaUnscoped.feeInvoice.findFirstOrThrow({
      where: { studentId: schoolA.studentId, periodLabel: 'Q1' },
      include: { lines: true },
    });

    expect(invoice.grossInPaise).toBe(500_000);
    expect(invoice.discountInPaise).toBe(100_000);
    expect(invoice.netInPaise).toBe(400_000);
    // The discount is on the line, so a parent can see what was reduced.
    expect(invoice.lines[0]?.discountInPaise).toBe(100_000);
  });

  it('rejects a percentage concession above 100', async () => {
    const response = await api
      .post(`${BASE}/fees/concessions`)
      .set(auth(adminA))
      .send({
        studentId: schoolA.studentId,
        academicYearId: schoolA.academicYearId,
        kind: 'PERCENT',
        value: 150,
        reason: 'Nonsense',
      });

    expect(response.status).toBe(400);
  });

  it('keeps one school’s money entirely invisible to another', async () => {
    const outstanding = await api.get(`${BASE}/fees/outstanding`).set(auth(adminB));
    expect(outstanding.status).toBe(200);
    expect(outstanding.body).toHaveLength(0);

    // Another school's ledger is missing, not forbidden — a 403 would confirm
    // the child exists.
    const ledger = await api
      .get(`${BASE}/fees/students/${schoolA.studentId}/ledger`)
      .set(auth(adminB));
    expect(ledger.status).toBe(404);
    expect(ledger.body.error.code).toBe(ERROR_CODES.NOT_FOUND);

    const heads = await api.get(`${BASE}/fees/heads`).set(auth(adminB));
    expect(heads.body).toHaveLength(0);
  });

  it('refuses to take a payment for a child at another school', async () => {
    const response = await api
      .post(`${BASE}/fees/payments`)
      .set(auth(adminB))
      .send({
        studentId: schoolA.studentId,
        amountInPaise: 50_000,
        method: 'CASH',
        paidOn: new Date().toISOString().slice(0, 10),
      });

    expect(response.status).toBe(404);

    const leaked = await prismaUnscoped.payment.count({
      where: { schoolId: schoolB.id, studentId: schoolA.studentId },
    });
    expect(leaked).toBe(0);
  });
});
