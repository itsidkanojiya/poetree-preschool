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

const dbUp = await isDatabaseReachable();

/**
 * Putting a child in a class, or moving them, from the child's Edit window.
 *
 * A school can make its year without ticking "current" and put its classes in
 * it. A child approved from a registration then had no class and could not be
 * given one: the server wanted a current year to enrol them in, and the Edit
 * window offered only the current year's classes — so it offered none. A class
 * belongs to a year already; the child joins the class's year.
 */
describe.skipIf(!dbUp)('changing a child’s class', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let admin: Session;
  let childId: string;
  let otherClassroomId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    admin = await login(school.adminEmail);

    // The school's year, never marked current.
    await prismaUnscoped.academicYear.update({
      where: { id: school.academicYearId },
      data: { isCurrent: false },
    });

    const seeded = await prismaUnscoped.classroom.findUniqueOrThrow({
      where: { id: school.classroomId },
      select: { classLevelId: true },
    });
    otherClassroomId = (
      await prismaUnscoped.classroom.create({
        data: {
          schoolId: school.id,
          academicYearId: school.academicYearId,
          classLevelId: seeded.classLevelId,
          section: 'Z',
        },
        select: { id: true },
      })
    ).id;

    // A child as approval leaves them: on the roll, in no class.
    childId = (
      await prismaUnscoped.student.create({
        data: {
          schoolId: school.id,
          admissionNo: 'ADM-CLASS-1',
          firstName: 'Freya',
          lastName: 'Patel',
          dateOfBirth: new Date('2021-03-29'),
          gender: 'FEMALE',
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('puts a child with no class into one, in that class’s year', async () => {
    const edited = await api
      .patch(`${BASE}/students/${childId}`)
      .set(auth(admin))
      .send({ classroomId: school.classroomId });

    expect(edited.status).toBe(200);
    expect(edited.body.classroom?.id).toBe(school.classroomId);

    const enrolment = await prismaUnscoped.studentEnrolment.findFirstOrThrow({
      where: { studentId: childId, status: 'ACTIVE' },
    });
    expect(enrolment.academicYearId).toBe(school.academicYearId);
  });

  it('moves the child to another class, and every list shows the new one', async () => {
    const moved = await api
      .patch(`${BASE}/students/${childId}`)
      .set(auth(admin))
      .send({ classroomId: otherClassroomId });
    expect(moved.status).toBe(200);
    expect(moved.body.classroom?.id).toBe(otherClassroomId);

    const read = await api.get(`${BASE}/students/${childId}`).set(auth(admin));
    expect(read.body.classroom?.id).toBe(otherClassroomId);

    const inNew = await api
      .get(`${BASE}/students`)
      .query({ classroomId: otherClassroomId })
      .set(auth(admin));
    expect(inNew.body.items.map((s: { id: string }) => s.id)).toContain(childId);

    const inOld = await api
      .get(`${BASE}/students`)
      .query({ classroomId: school.classroomId })
      .set(auth(admin));
    expect(inOld.body.items.map((s: { id: string }) => s.id)).not.toContain(childId);

    // Still one enrolment: a move within the year, not a second admission.
    expect(await prismaUnscoped.studentEnrolment.count({ where: { studentId: childId } })).toBe(1);
  });
});
