import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@poetree/shared';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  TEST_PASSWORD,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { prismaUnscoped, disconnectPrisma } from '../../src/db/prisma.js';
import { signAccessToken } from '../../src/lib/tokens.js';

const dbUp = await isDatabaseReachable();

/**
 * The gate described in the plan. If any of these fail, one school can see or
 * change another school's data and nothing else in the platform matters.
 */
describe.skipIf(!dbUp)('cross-tenant isolation', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let adminA: Session;
  let adminB: Session;
  let superAdmin: Session;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    adminA = await login(schoolA.adminEmail);
    adminB = await login(schoolB.adminEmail);
    superAdmin = await login(baseline.superAdminEmail);
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('lists only its own students', async () => {
    const response = await api.get(`${BASE}/students`).set(auth(adminA));

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].id).toBe(schoolA.studentId);
    expect(response.body.total).toBe(1);
  });

  it('reports another school’s student as missing, not forbidden', async () => {
    const response = await api.get(`${BASE}/students/${schoolB.studentId}`).set(auth(adminA));

    // 404 rather than 403: a 403 would confirm the id exists somewhere.
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('refuses to update another school’s student and leaves it untouched', async () => {
    const before = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: schoolB.studentId },
    });

    const response = await api
      .patch(`${BASE}/students/${schoolB.studentId}`)
      .set(auth(adminA))
      .send({ firstName: 'Hijacked' });

    expect(response.status).toBe(404);

    const after = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: schoolB.studentId },
    });
    expect(after.firstName).toBe(before.firstName);
    expect(after.schoolId).toBe(schoolB.id);
  });

  it('ignores a schoolId supplied in the request body', async () => {
    const response = await api
      .post(`${BASE}/students`)
      .set(auth(adminA))
      .send({
        // Spoofed — must be discarded by validation and overridden by the
        // isolation extension.
        schoolId: schoolB.id,
        firstName: 'Spoof',
        lastName: 'Attempt',
        dateOfBirth: '2022-03-01',
        gender: 'FEMALE',
        admissionNo: 'ALPHA-SPOOF',
        guardians: [{ parentProfileId: schoolA.parentProfileId, isPrimary: false }],
      });

    expect(response.status).toBe(201);

    const created = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(created.schoolId).toBe(schoolA.id);
    expect(created.schoolId).not.toBe(schoolB.id);
  });

  it('refuses to link a guardian belonging to another school', async () => {
    const response = await api
      .post(`${BASE}/students`)
      .set(auth(adminA))
      .send({
        firstName: 'Cross',
        lastName: 'Link',
        dateOfBirth: '2022-04-01',
        gender: 'MALE',
        admissionNo: 'ALPHA-CROSS',
        guardians: [{ parentProfileId: schoolB.parentProfileId, isPrimary: true }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('refuses to attach a classroom belonging to another school', async () => {
    const response = await api
      .post(`${BASE}/students`)
      .set(auth(adminA))
      .send({
        firstName: 'Cross',
        lastName: 'Class',
        dateOfBirth: '2022-05-01',
        gender: 'MALE',
        admissionNo: 'ALPHA-CLASS',
        classroomId: schoolB.classroomId,
        guardians: [{ parentProfileId: schoolA.parentProfileId, isPrimary: true }],
      });

    expect(response.status).toBe(400);
  });

  it('keeps teacher and parent rosters separate', async () => {
    const [teachersA, teachersB, parentsA] = await Promise.all([
      api.get(`${BASE}/teachers`).set(auth(adminA)),
      api.get(`${BASE}/teachers`).set(auth(adminB)),
      api.get(`${BASE}/parents`).set(auth(adminA)),
    ]);

    expect(teachersA.body.items.map((t: { email: string }) => t.email)).toEqual([
      schoolA.teacherEmail,
    ]);
    expect(teachersB.body.items.map((t: { email: string }) => t.email)).toEqual([
      schoolB.teacherEmail,
    ]);
    expect(parentsA.body.items).toHaveLength(1);
    expect(parentsA.body.items[0].phone).toBe(schoolA.parentPhone);
  });

  it('blocks a school admin from the Super Admin surface', async () => {
    const response = await api.get(`${BASE}/publication/schools`).set(auth(adminA));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('blocks a teacher token from school-admin routes', async () => {
    // Minted directly: teachers have no portal login in Phase 1, but the Phase 2
    // app will present exactly this token shape.
    const teacher = await prismaUnscoped.user.findFirstOrThrow({
      where: { schoolId: schoolA.id, role: 'TEACHER' },
    });
    const token = signAccessToken({
      userId: teacher.id,
      role: 'TEACHER',
      schoolId: schoolA.id,
    });

    const response = await api.get(`${BASE}/students`).set({ Authorization: `Bearer ${token}` });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('issues tokens to teachers and parents alike', async () => {
    // Login is role-agnostic on purpose. It is shared by the web portal and the
    // mobile app, so gating it to "portal roles" did not make parents app-only —
    // it locked them out of the app as well, which is the audience it exists for.
    // Each client decides who it admits; the portal's sign-in refuses to store a
    // session for a non-portal role.
    const teacherLogin = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: schoolA.teacherEmail, password: TEST_PASSWORD });

    expect(teacherLogin.status).toBe(200);
    expect(teacherLogin.body.user.role).toBe('TEACHER');
    expect(teacherLogin.body.user.school.code).toBe(schoolA.code);

    const parentLogin = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: schoolA.parentPhone, password: TEST_PASSWORD });

    expect(parentLogin.status).toBe(200);
    expect(parentLogin.body.user.role).toBe('PARENT');
  });

  it('gives a parent a token that opens nothing administrative', async () => {
    // This is what makes a role-agnostic login safe: the token exists, and every
    // route still refuses it on its own merits.
    const parent = await login(schoolA.parentPhone);

    const responses = await Promise.all([
      api.get(`${BASE}/students`).set(auth(parent)),
      // The school-wide arrears list names every family and what they owe.
      // `fee:read` lets a parent see their own dues; it must not open this.
      api.get(`${BASE}/fees/outstanding`).set(auth(parent)),
      api.get(`${BASE}/publication/schools`).set(auth(parent)),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
    }
  });

  it('stops a parent reading another family’s fee ledger', async () => {
    // A permission says what a caller may do, never whose data they may do it
    // to. Without the guardian check, any parent could read any child's arrears
    // by guessing an id.
    const parent = await login(schoolA.parentPhone);

    const response = await api
      .get(`${BASE}/fees/students/${schoolB.studentId}/ledger`)
      .set(auth(parent));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  /**
   * Regression: StudentEnrolment reached production without being listed in
   * TENANT_MODELS, so GET /enrolments returned every school's children to any
   * school admin. The unit test now catches the cause; this catches the symptom.
   */
  it('lists only its own enrolments', async () => {
    const response = await api.get(`${BASE}/enrolments`).set(auth(adminA));

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);

    const admissionNumbers = response.body.items.map((e: { admissionNo: string }) => e.admissionNo);
    expect(admissionNumbers).toEqual(['ALPHA-001']);
    expect(admissionNumbers).not.toContain('BETA-001');
  });

  it('refuses to promote another school’s classroom', async () => {
    const response = await api
      .post(`${BASE}/enrolments/promote`)
      .set(auth(adminA))
      .send({ fromClassroomId: schoolB.classroomId, toClassroomId: schoolA.classroomId });

    expect(response.status).toBe(400);
  });

  it('reports another school’s student history as missing', async () => {
    const response = await api
      .get(`${BASE}/enrolments/students/${schoolB.studentId}/history`)
      .set(auth(adminA));

    expect(response.status).toBe(404);
  });

  it('lets the Super Admin see every school', async () => {
    const response = await api.get(`${BASE}/publication/schools`).set(auth(superAdmin));

    expect(response.status).toBe(200);
    expect(response.body.items.map((s: { code: string }) => s.code).sort()).toEqual([
      'alpha',
      'beta',
    ]);
  });
  it('keeps one school’s subjects out of another’s timetable pickers', async () => {
    // Subjects are the school's own words for its day. Alpha calling a period
    // "Circle time" is not a fact about Beta, and a leak here would put one
    // school's vocabulary into another's timetable.
    const made = await api
      .post(`${BASE}/subjects`)
      .set(auth(adminA))
      .send({ name: 'Circle time' });

    expect(made.status).toBe(201);
    // Nothing is on a timetable yet, and the counts say so rather than being
    // absent — the Remove dialog reads them to say how much a removal costs.
    expect(made.body.timetableCount).toBe(0);
    expect(made.body.classroomCount).toBe(0);
    // Derived, not typed: nobody running an office should invent CIRCLE_TIME.
    expect(made.body.code).toBe('CIRCLE_TIME');

    const mine = await api.get(`${BASE}/subjects`).set(auth(adminA));
    expect(mine.body.map((row: { name: string }) => row.name)).toContain('Circle time');

    const theirs = await api.get(`${BASE}/subjects`).set(auth(adminB));
    expect(theirs.body.map((row: { name: string }) => row.name)).not.toContain('Circle time');

    // And the neighbour cannot rename it. 404 rather than 403: a refusal that
    // confirms the row exists is itself a leak.
    const meddled = await api
      .patch(`${BASE}/subjects/${made.body.id}`)
      .set(auth(adminB))
      .send({ name: 'Renamed by the wrong school' });
    expect(meddled.status).toBe(404);
  });

  it('lets two schools use the same word for their own subject', async () => {
    // Codes are unique per school, not globally: both may have CIRCLE_TIME,
    // which is the point of these belonging to the school.
    const alpha = await api.get(`${BASE}/subjects`).set(auth(adminA));
    const beta = await api
      .post(`${BASE}/subjects`)
      .set(auth(adminB))
      .send({ name: 'Circle time' });

    expect(beta.status).toBe(201);
    expect(beta.body.code).toBe('CIRCLE_TIME');
    expect(beta.body.id).not.toBe(
      alpha.body.find((row: { name: string }) => row.name === 'Circle time')?.id,
    );
  });

  it('retires a subject instead of emptying the periods it is on', async () => {
    // TimetableEntry.subjectId is SetNull, so a delete would blank every period
    // it was used in — a week losing its subjects, found by a parent.
    const subject = await api
      .post(`${BASE}/subjects`)
      .set(auth(adminA))
      .send({ name: 'Story time' });

    const gone = await api
      .post(`${BASE}/subjects/${subject.body.id}/retire`)
      .set(auth(adminA));
    expect(gone.status).toBe(204);

    const listed = await api.get(`${BASE}/subjects`).set(auth(adminA));
    expect(listed.body.map((row: { id: string }) => row.id)).not.toContain(subject.body.id);

    // Still there, just not offered.
    const row = await prismaUnscoped.subject.findUnique({
      where: { id: subject.body.id as string },
      select: { isActive: true },
    });
    expect(row?.isActive).toBe(false);
  });
  it('counts a subject across every class that uses it', async () => {
    // A subject belongs to the school, not to a class: the same Letters runs in
    // Nursery and in Junior KG. The counts are what the Remove dialog reads to
    // say what a removal costs, so "12 periods in 3 classes" has to be true.
    const subject = await api
      .post(`${BASE}/subjects`)
      .set(auth(adminA))
      .send({ name: 'Letters' });
    const subjectId = subject.body.id as string;

    const period = await prismaUnscoped.timetablePeriod.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: schoolA.academicYearId,
        name: 'First',
        startTime: '09:00',
        endTime: '09:40',
        sortOrder: 1,
      },
    });

    // A second class in the same school, so the subject reaches two grids.
    const secondClass = await prismaUnscoped.classroom.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: schoolA.academicYearId,
        classLevelId: (
          await prismaUnscoped.classroom.findUniqueOrThrow({
            where: { id: schoolA.classroomId },
            select: { classLevelId: true },
          })
        ).classLevelId,
        section: 'B',
      },
    });

    // Two periods in one class, one in the other: three periods, two classes.
    await prismaUnscoped.timetableEntry.createMany({
      data: [
        { schoolId: schoolA.id, academicYearId: schoolA.academicYearId, classroomId: schoolA.classroomId, periodId: period.id, dayOfWeek: 1, subjectId },
        { schoolId: schoolA.id, academicYearId: schoolA.academicYearId, classroomId: schoolA.classroomId, periodId: period.id, dayOfWeek: 2, subjectId },
        { schoolId: schoolA.id, academicYearId: schoolA.academicYearId, classroomId: secondClass.id, periodId: period.id, dayOfWeek: 1, subjectId },
      ],
    });

    const listed = await api.get(`${BASE}/subjects`).set(auth(adminA));
    const letters = listed.body.find((row: { id: string }) => row.id === subjectId);

    expect(letters.timetableCount).toBe(3);
    expect(letters.classroomCount).toBe(2);
  });

  it('offers a school nothing but its own subjects', async () => {
    // There is no shared catalogue list to fall back on, and deliberately not:
    // one preschool's "Circle time" is another's "Assembly". A school that has
    // written nothing gets an empty list, which is what the timetable now says
    // out loud rather than showing a picker of somebody else's words.
    const fresh = await seedSchool(baseline, 'gamma', 'Gamma Preschool');
    const admin = await login(fresh.adminEmail);

    const listed = await api.get(`${BASE}/subjects`).set(auth(admin));

    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([]);
  });
});
