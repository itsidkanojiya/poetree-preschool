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

const dbUp = await isDatabaseReachable();

const rupees = (n: number) => n * 100;

/**
 * An admission fee: charged once, to a child in their first year at the
 * school, and collected whole with the first installment — which is why a
 * school's first installment is the bigger one.
 *
 * Nursery here is ₹48,000 a year of tuition and ₹5,000 admission.
 */
describe.skipIf(!dbUp)('the admission fee', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let admin: Session;
  let planId: string;
  let lastYearId: string;
  const today = schoolToday(new Date());

  /** A child in this year's Nursery; with `returning`, also in last year's. */
  const child = async (admissionNo: string, returning: boolean) => {
    const student = await prismaUnscoped.student.create({
      data: {
        schoolId: school.id,
        admissionNo,
        firstName: admissionNo,
        dateOfBirth: new Date('2021-01-01'),
        gender: 'FEMALE',
      },
    });
    if (returning) {
      const lastClass = await prismaUnscoped.classroom.findFirstOrThrow({
        where: { academicYearId: lastYearId },
      });
      await prismaUnscoped.studentEnrolment.create({
        data: {
          schoolId: school.id,
          studentId: student.id,
          academicYearId: lastYearId,
          classroomId: lastClass.id,
          status: 'PROMOTED',
        },
      });
    }
    await prismaUnscoped.studentEnrolment.create({
      data: {
        schoolId: school.id,
        studentId: student.id,
        academicYearId: school.academicYearId,
        classroomId: school.classroomId,
        status: 'ACTIVE',
      },
    });
    return student.id;
  };

  const invoicesOf = (studentId: string) =>
    prismaUnscoped.feeInvoice.findMany({
      where: { studentId },
      orderBy: { dueDate: 'asc' },
      include: { lines: { include: { feeHead: { select: { code: true } } } } },
    });

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    admin = await login(school.adminEmail);

    // Last year, with a class of its own, for children who are returning.
    const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'NURSERY' },
    });
    lastYearId = (
      await prismaUnscoped.academicYear.create({
        data: {
          schoolId: school.id,
          name: '2025-26',
          startDate: new Date('2025-06-01'),
          endDate: new Date('2026-04-30'),
          isCurrent: false,
        },
      })
    ).id;
    await prismaUnscoped.classroom.create({
      data: {
        schoolId: school.id,
        academicYearId: lastYearId,
        classLevelId: nursery.id,
        section: 'A',
      },
    });

    const tuition = await api
      .post(`${BASE}/fees/heads`)
      .set(auth(admin))
      .send({ code: 'TUITION', name: 'Tuition' });
    const admission = await api
      .post(`${BASE}/fees/heads`)
      .set(auth(admin))
      .send({ code: 'ADMISSION', name: 'Admission' });
    await api
      .put(`${BASE}/fees/structures`)
      .set(auth(admin))
      .send({
        academicYearId: school.academicYearId,
        classLevelId: nursery.id,
        name: 'Nursery',
        items: [
          { feeHeadId: tuition.body.id, amountInPaise: rupees(48_000), frequency: 'ANNUAL' },
          { feeHeadId: admission.body.id, amountInPaise: rupees(5_000), frequency: 'ONE_TIME' },
        ],
      })
      .expect(200);

    const plan = await api
      .post(`${BASE}/fees/plans`)
      .set(auth(admin))
      .send({
        academicYearId: school.academicYearId,
        name: 'Quarterly',
        installments: [10, 100, 190, 280].map((offset, i) => ({
          label: `Q${i + 1}`,
          dueDate: addDays(today, offset),
          weight: 1,
        })),
      });
    planId = plan.body.id as string;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('puts a new child’s admission fee in their first installment', async () => {
    const studentId = await child('NEW-1', false);
    await api
      .put(`${BASE}/fees/students/${studentId}/plan`)
      .set(auth(admin))
      .send({ academicYearId: school.academicYearId, planId })
      .expect(200);

    const invoices = await invoicesOf(studentId);
    expect(invoices.map((i) => i.netInPaise)).toEqual([17_000, 12_000, 12_000, 12_000].map(rupees));
    expect(invoices[0]!.lines.map((l) => l.feeHead.code).sort()).toEqual(['ADMISSION', 'TUITION']);
    for (const later of invoices.slice(1)) {
      expect(later.lines.map((l) => l.feeHead.code)).toEqual(['TUITION']);
    }
  });

  it('does not charge a returning child admission again', async () => {
    const studentId = await child('BACK-1', true);
    await api
      .put(`${BASE}/fees/students/${studentId}/plan`)
      .set(auth(admin))
      .send({ academicYearId: school.academicYearId, planId })
      .expect(200);

    const invoices = await invoicesOf(studentId);
    expect(invoices.map((i) => i.netInPaise)).toEqual([12_000, 12_000, 12_000, 12_000].map(rupees));
  });

  it('bills admission by period to new children only', async () => {
    const fresh = await child('NEW-2', false);
    const returning = await child('BACK-2', true);
    await api
      .post(`${BASE}/fees/invoices/generate`)
      .set(auth(admin))
      .send({
        academicYearId: school.academicYearId,
        periodLabel: 'Annual',
        dueDate: addDays(today, 10),
      })
      .expect(200);

    const [freshInvoice] = await invoicesOf(fresh);
    const [returningInvoice] = await invoicesOf(returning);
    expect(freshInvoice!.netInPaise).toBe(rupees(53_000));
    expect(returningInvoice!.netInPaise).toBe(rupees(48_000));
    expect(returningInvoice!.lines.map((l) => l.feeHead.code)).toEqual(['TUITION']);
  });
});
