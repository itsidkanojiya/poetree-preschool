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
import { prismaUnscoped, disconnectPrisma } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

/**
 * The class stream, and the line between reading a classroom and acting on one.
 *
 * The stream is written to a class's families, so a parent of a child in that
 * class is a legitimate reader — unlike the register, where any
 * classroom-shaped answer is a list of other people's children.
 */
describe.skipIf(!dbUp)('class stream', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let teacherA: Session;
  let parentA: Session;
  let parentB: Session;
  let otherClassroomId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    teacherA = await login(schoolA.teacherEmail);
    parentA = await login(schoolA.parentPhone);
    parentB = await login(schoolB.parentPhone);

    // A second class at School A that parentA's child is not in.
    const level = await prismaUnscoped.classLevel.findFirstOrThrow({
      where: { code: 'JUNIOR_KG' },
    });
    const other = await prismaUnscoped.classroom.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: schoolA.academicYearId,
        classLevelId: level.id,
        section: 'B',
      },
    });
    otherClassroomId = other.id;
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('lets a teacher post to their own class', async () => {
    const response = await api
      .post(`${BASE}/classroom-posts`)
      .set(auth(teacherA))
      .send({
        classroomId: schoolA.classroomId,
        type: 'ANNOUNCEMENT',
        title: 'Bring a raincoat tomorrow',
        body: 'We are going outside if it stays dry.',
      });

    expect(response.status).toBe(201);
    expect(response.body.title).toBe('Bring a raincoat tomorrow');
  });

  it('lets a parent read the stream of their own child’s class', async () => {
    const response = await api
      .get(`${BASE}/classroom-posts`)
      .query({ classroomId: schoolA.classroomId })
      .set(auth(parentA));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].title).toBe('Bring a raincoat tomorrow');
  });

  it('stops a parent reading a class their child is not in', async () => {
    // Reading a classroom is allowed; reading *any* classroom is not.
    const response = await api
      .get(`${BASE}/classroom-posts`)
      .query({ classroomId: otherClassroomId })
      .set(auth(parentA));

    expect(response.status).toBe(404);
  });

  it('stops another school’s parent entirely', async () => {
    const response = await api
      .get(`${BASE}/classroom-posts`)
      .query({ classroomId: schoolA.classroomId })
      .set(auth(parentB));

    expect(response.status).toBe(404);
  });

  it('does not let a parent post to the stream', async () => {
    // Reading is not writing. Per the brief the stream is not social media —
    // no parent-authored content, and so no moderation burden.
    const response = await api
      .post(`${BASE}/classroom-posts`)
      .set(auth(parentA))
      .send({
        classroomId: schoolA.classroomId,
        type: 'ANNOUNCEMENT',
        title: 'A parent post',
      });

    expect(response.status).toBe(403);
  });

  it('stops a teacher posting to a class they do not take', async () => {
    const response = await api
      .post(`${BASE}/classroom-posts`)
      .set(auth(teacherA))
      .send({
        classroomId: otherClassroomId,
        type: 'ANNOUNCEMENT',
        title: 'Not my class',
      });

    expect(response.status).toBe(404);
  });
});
