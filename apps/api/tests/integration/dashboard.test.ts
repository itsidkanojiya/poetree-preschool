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
 * The school's front page: the counts, the year's fees collected against what
 * was billed, the month-by-month collection, today's register, class sizes,
 * what is waiting on the office, birthdays, and the latest announcements.
 */
describe.skipIf(!dbUp)('the school overview', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let other: TestSchool;
  let admin: Session;
  let teacher: Session;
  const today = schoolToday(new Date());
  const [, month, day] = today.split('-');
  const inThreeDays = addDays(today, 3);

  /** Born on this day of the year, some years ago. */
  const bornOn = (date: string) => new Date(`2021-${date.slice(5)}T00:00:00Z`);

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    other = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);
    teacher = await login(school.teacherEmail);

    // The seeded child turns a year older today; a second child in three days.
    await prismaUnscoped.student.update({
      where: { id: school.studentId },
      data: { dateOfBirth: bornOn(today) },
    });
    const second = await prismaUnscoped.student.create({
      data: {
        schoolId: school.id,
        admissionNo: 'DB-2',
        firstName: 'Diya',
        dateOfBirth: bornOn(inThreeDays),
        gender: 'FEMALE',
      },
    });
    await prismaUnscoped.studentEnrolment.create({
      data: {
        schoolId: school.id,
        studentId: second.id,
        academicYearId: school.academicYearId,
        classroomId: school.classroomId,
        status: 'ACTIVE',
      },
    });

    // Fees: ₹10,000 billed to each child this year; ₹4,000 paid today.
    for (const [index, studentId] of [school.studentId, second.id].entries()) {
      await prismaUnscoped.feeInvoice.create({
        data: {
          schoolId: school.id,
          studentId,
          academicYearId: school.academicYearId,
          invoiceNo: `INV-DB-${index}`,
          periodLabel: 'Term 1',
          dueDate: new Date(`${addDays(today, index === 0 ? -5 : 20)}T00:00:00Z`),
          grossInPaise: rupees(10_000),
          netInPaise: rupees(10_000),
          paidInPaise: 0,
        },
      });
    }
    await api
      .post(`${BASE}/fees/payments`)
      .set(auth(admin))
      .send({ studentId: second.id, amountInPaise: rupees(4_000), method: 'CASH', paidOn: today })
      .expect(201);

    // Today's register, on the school's date: one present, one absent.
    const session = await prismaUnscoped.attendanceSession.create({
      data: {
        schoolId: school.id,
        academicYearId: school.academicYearId,
        classroomId: school.classroomId,
        date: new Date(`${today}T00:00:00Z`),
      },
    });
    await prismaUnscoped.attendanceRecord.createMany({
      data: [
        {
          schoolId: school.id,
          sessionId: session.id,
          studentId: school.studentId,
          status: 'PRESENT',
        },
        { schoolId: school.id, sessionId: session.id, studentId: second.id, status: 'ABSENT' },
      ],
    });

    // Two announcements, one still a draft.
    const author = school.adminId;
    await prismaUnscoped.notice.createMany({
      data: [
        {
          schoolId: school.id,
          title: 'Sports Day',
          body: 'On Friday.',
          status: 'PUBLISHED',
          createdById: author,
        },
        {
          schoolId: school.id,
          title: 'Not ready yet',
          body: 'Draft.',
          status: 'DRAFT',
          createdById: author,
        },
      ],
    });

    // Something from the neighbouring school, which must not be counted.
    await prismaUnscoped.student.update({
      where: { id: other.studentId },
      data: { dateOfBirth: bornOn(today) },
    });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('gives the counts, and the year’s fees collected against billed', async () => {
    const res = await api.get(`${BASE}/dashboard/overview`).set(auth(admin)).expect(200);
    expect(res.body.students).toBe(2);
    expect(res.body.teachers).toBe(1);
    expect(res.body.classrooms).toBe(1);
    expect(res.body.fees).toEqual({
      billedInPaise: rupees(20_000),
      collectedInPaise: rupees(4_000),
      outstandingInPaise: rupees(16_000),
    });
  });

  it('gives the collection month by month, ending with this month', async () => {
    const res = await api.get(`${BASE}/dashboard/overview`).set(auth(admin)).expect(200);
    const months = res.body.feesByMonth as Array<{ month: string; collectedInPaise: number }>;
    expect(months).toHaveLength(12);
    expect(months.at(-1)).toEqual({ month: today.slice(0, 7), collectedInPaise: rupees(4_000) });
  });

  it('gives today’s register and the size of each class', async () => {
    const res = await api.get(`${BASE}/dashboard/overview`).set(auth(admin)).expect(200);
    expect(res.body.attendanceToday).toEqual({ present: 1, absent: 1, marked: 2, enrolled: 2 });
    expect(res.body.classSizes).toEqual([
      expect.objectContaining({ classroomId: school.classroomId, count: 2 }),
    ]);
  });

  it('says what is waiting on the office', async () => {
    const res = await api.get(`${BASE}/dashboard/overview`).set(auth(admin)).expect(200);
    expect(res.body.attention).toEqual({ registrations: 0, payments: 0, overdue: 1 });

    const badges = await api.get(`${BASE}/dashboard/attention`).set(auth(admin)).expect(200);
    expect(badges.body).toEqual({ registrations: 0, payments: 0, overdue: 1 });
  });

  it('lists birthdays today and in the week ahead, from this school only', async () => {
    const res = await api.get(`${BASE}/dashboard/overview`).set(auth(admin)).expect(200);
    expect(res.body.birthdays.today.map((b: { id: string }) => b.id)).toEqual([school.studentId]);
    expect(res.body.birthdays.today[0].turning).toBe(Number(today.slice(0, 4)) - 2021);
    expect(res.body.birthdays.soon.map((b: { name: string }) => b.name)).toEqual(['Diya']);
    expect(res.body.birthdays.soon[0].date).toBe(inThreeDays.slice(5));
    expect(`${month}-${day}`).toBe(today.slice(5));
  });

  it('shows the latest published announcements, not drafts', async () => {
    const res = await api.get(`${BASE}/dashboard/overview`).set(auth(admin)).expect(200);
    expect(res.body.announcements.map((a: { title: string }) => a.title)).toEqual(['Sports Day']);
  });

  it('is the office’s, not a teacher’s', async () => {
    await api.get(`${BASE}/dashboard/overview`).set(auth(teacher)).expect(403);
  });
});
