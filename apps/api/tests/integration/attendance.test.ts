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

const today = () => new Date().toISOString().slice(0, 10);

describe.skipIf(!dbUp)('attendance', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let adminA: Session;
  let teacherA: Session;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    adminA = await login(schoolA.adminEmail);
    teacherA = await login(schoolA.teacherEmail);
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('defaults every child to present before anything is marked', async () => {
    const response = await api
      .get(`${BASE}/attendance/sheet`)
      .query({ classroomId: schoolA.classroomId, date: today() })
      .set(auth(teacherA));

    expect(response.status).toBe(200);
    expect(response.body.alreadyMarked).toBe(false);
    expect(response.body.editable).toBe(true);
    expect(response.body.rows).toHaveLength(1);
    // The teacher taps only the absentees, so the default has to be present.
    expect(response.body.rows[0].status).toBe('PRESENT');
  });

  it('marks the register and is idempotent on resubmit', async () => {
    const payload = {
      classroomId: schoolA.classroomId,
      date: today(),
      records: [{ studentId: schoolA.studentId, status: 'ABSENT', remark: 'Unwell' }],
    };

    const first = await api.put(`${BASE}/attendance`).set(auth(teacherA)).send(payload);
    expect(first.status).toBe(200);
    expect(first.body.rows[0].status).toBe('ABSENT');

    // A flaky mobile connection retrying must not create a second register.
    const second = await api.put(`${BASE}/attendance`).set(auth(teacherA)).send(payload);
    expect(second.status).toBe(200);

    const sessions = await prismaUnscoped.attendanceSession.count({
      where: { classroomId: schoolA.classroomId },
    });
    expect(sessions).toBe(1);

    const records = await prismaUnscoped.attendanceRecord.count({
      where: { session: { classroomId: schoolA.classroomId } },
    });
    expect(records).toBe(1);
  });

  it('records the correction in the audit log with before and after', async () => {
    const entry = await prismaUnscoped.auditLog.findFirst({
      where: { action: 'ATTENDANCE_CORRECTED', schoolId: schoolA.id },
      orderBy: { createdAt: 'desc' },
    });

    expect(entry).not.toBeNull();
    expect(entry?.after).toMatchObject({ [schoolA.studentId]: 'ABSENT' });
  });

  it('refuses a future date', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    const response = await api
      .put(`${BASE}/attendance`)
      .set(auth(teacherA))
      .send({
        classroomId: schoolA.classroomId,
        date: tomorrow,
        records: [{ studentId: schoolA.studentId, status: 'PRESENT' }],
      });

    expect(response.status).toBe(400);
  });

  it('refuses a child who is not enrolled in that classroom', async () => {
    const response = await api
      .put(`${BASE}/attendance`)
      .set(auth(teacherA))
      .send({
        classroomId: schoolA.classroomId,
        date: today(),
        // Another school's child — must not appear on this register.
        records: [{ studentId: schoolB.studentId, status: 'PRESENT' }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('blocks marking on a holiday, and would otherwise skew every percentage', async () => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

    await prismaUnscoped.schoolHoliday.create({
      data: {
        schoolId: schoolB.id,
        academicYearId: schoolB.academicYearId,
        startDate: date,
        endDate: date,
        title: 'Founders Day',
        type: 'HOLIDAY',
      },
    });

    const adminB = await login(schoolB.adminEmail);
    const response = await api
      .put(`${BASE}/attendance`)
      .set(auth(adminB))
      .send({
        classroomId: schoolB.classroomId,
        date: today(),
        records: [{ studentId: schoolB.studentId, status: 'PRESENT' }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Founders Day');
  });

  it('keeps one school out of another school’s register', async () => {
    const response = await api
      .get(`${BASE}/attendance/sheet`)
      .query({ classroomId: schoolB.classroomId, date: today() })
      .set(auth(adminA));

    // Another school's classroom simply does not resolve.
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('stops a teacher reaching a classroom they are not assigned to', async () => {
    // A second classroom in the teacher's own school, with no assignment to them.
    const nursery = await prismaUnscoped.classLevel.findFirstOrThrow({ where: { code: 'JUNIOR_KG' } });
    const otherClassroom = await prismaUnscoped.classroom.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: schoolA.academicYearId,
        classLevelId: nursery.id,
        section: 'B',
      },
    });

    const response = await api
      .get(`${BASE}/attendance/sheet`)
      .query({ classroomId: otherClassroom.id, date: today() })
      .set(auth(teacherA));

    expect(response.status).toBe(404);

    // The School Admin, by contrast, owns the whole school.
    const adminView = await api
      .get(`${BASE}/attendance/sheet`)
      .query({ classroomId: otherClassroom.id, date: today() })
      .set(auth(adminA));
    expect(adminView.status).toBe(200);
  });

  it('summarises the register by day and by child', async () => {
    const from = today();
    const to = today();

    const daily = await api
      .get(`${BASE}/attendance/daily`)
      .query({ classroomId: schoolA.classroomId, from, to })
      .set(auth(adminA));

    expect(daily.status).toBe(200);
    expect(daily.body[0]).toMatchObject({ absent: 1, total: 1, percentage: 0 });

    const students = await api
      .get(`${BASE}/attendance/students`)
      .query({ classroomId: schoolA.classroomId, from, to })
      .set(auth(adminA));

    expect(students.status).toBe(200);
    expect(students.body[0]).toMatchObject({ absent: 1, markedDays: 1, percentage: 0 });
  });

  it('refuses a parent every classroom-shaped view of attendance', async () => {
    // Parents hold attendance:read so they can see their own child. The scope
    // guard used to return early for every role that was not TEACHER, so a
    // parent could pass their own child's classroom id — one they legitimately
    // know — and receive the whole class's register, names and admission
    // numbers included.
    const parentA = await login(schoolA.parentPhone);
    const from = today();
    const to = today();

    for (const path of ['/attendance/sheet', '/attendance/daily', '/attendance/students']) {
      const response = await api
        .get(`${BASE}${path}`)
        .query({ classroomId: schoolA.classroomId, date: today(), from, to })
        .set(auth(parentA));

      expect(response.status).toBe(404);
    }
  });

  it('gives a parent their own child’s attendance, and nobody else’s', async () => {
    const parentA = await login(schoolA.parentPhone);

    const mine = await api
      .get(`${BASE}/attendance/children/${schoolA.studentId}`)
      .query({ from: today(), to: today() })
      .set(auth(parentA));

    expect(mine.status).toBe(200);
    expect(mine.body.absent).toBe(1);
    expect(mine.body.days[0]).toMatchObject({ status: 'ABSENT' });

    // A child at another school does not resolve at all.
    const theirs = await api
      .get(`${BASE}/attendance/children/${schoolB.studentId}`)
      .query({ from: today(), to: today() })
      .set(auth(parentA));

    expect(theirs.status).toBe(404);
  });
});
