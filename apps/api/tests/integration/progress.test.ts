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

describe.skipIf(!dbUp)('progress tracking', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let teacherA: Session;
  let parentA: Session;
  let teacherB: Session;

  /** Publication-owned content — one skill, two activities under it. */
  let skillId: string;
  let activityId: string;
  let otherActivityId: string;
  /** A second child at school A, with no guardian link to parentA. */
  let otherStudentId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    const skill = await prismaUnscoped.skill.create({
      data: { code: 'TEST_LETTERS', name: 'Letter recognition', sortOrder: 1 },
    });
    skillId = skill.id;

    const activity = await prismaUnscoped.learningActivity.create({
      data: { code: 'TEST_TRACE_A', title: 'Trace A', type: 'TRACING', skillId: skill.id },
    });
    activityId = activity.id;

    const other = await prismaUnscoped.learningActivity.create({
      data: { code: 'TEST_MATCH_A', title: 'Match A', type: 'MATCHING', skillId: skill.id },
    });
    otherActivityId = other.id;

    const stranger = await prismaUnscoped.student.create({
      data: {
        schoolId: schoolA.id,
        admissionNo: 'ALPHA-002',
        firstName: 'Other',
        lastName: 'Child',
        dateOfBirth: new Date('2022-03-01'),
        gender: 'FEMALE',
        status: 'ACTIVE',
      },
    });
    otherStudentId = stranger.id;

    teacherA = await login(schoolA.teacherEmail);
    parentA = await login(schoolA.parentPhone);
    teacherB = await login(schoolB.teacherEmail);
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('records an attempt and reports mastery with the figures behind it', async () => {
    const response = await api
      .post(`${BASE}/progress/attempts`)
      .set(auth(teacherA))
      .send({ studentId: schoolA.studentId, activityId, correctCount: 8, totalCount: 10 });

    expect(response.status).toBe(201);
    expect(response.body.masteryPercent).toBe(80);
    // A bare percentage invites an argument; the basis lets a parent and a
    // teacher discuss the same thing.
    expect(response.body.basis).toBe('8 of 10 questions across 1 attempt');
  });

  it('lists skills a child has never attempted rather than hiding them', async () => {
    const response = await api
      .get(`${BASE}/progress/students/${otherStudentId}`)
      .set(auth(teacherA));

    expect(response.status).toBe(200);
    const row = response.body.skills.find((s: { skillId: string }) => s.skillId === skillId);
    // "Not started" is what tells a teacher where the gap is.
    expect(row).toBeDefined();
    expect(row.attemptsCount).toBe(0);
    expect(row.basis).toBe('Not attempted yet');
  });

  it('lets an early struggle fall out of the mastery window', async () => {
    // Ten wrong, then ten right: a child who has since learned the letter must
    // read as competent, not be dragged down by September forever.
    for (let i = 0; i < 10; i += 1) {
      const response = await api
        .post(`${BASE}/progress/attempts`)
        .set(auth(teacherA))
        .send({ studentId: otherStudentId, activityId, correctCount: 0, totalCount: 5 });
      expect(response.status).toBe(201);
    }

    let last = 0;
    for (let i = 0; i < 10; i += 1) {
      const response = await api
        .post(`${BASE}/progress/attempts`)
        .set(auth(teacherA))
        .send({ studentId: otherStudentId, activityId: otherActivityId, correctCount: 5, totalCount: 5 });
      expect(response.status).toBe(201);
      last = response.body.masteryPercent;
    }

    expect(last).toBe(100);
  });

  it('refuses a score with more correct answers than questions', async () => {
    const response = await api
      .post(`${BASE}/progress/attempts`)
      .set(auth(teacherA))
      .send({ studentId: schoolA.studentId, activityId, correctCount: 11, totalCount: 10 });

    expect(response.status).toBe(400);
  });

  it('stops a parent recording an attempt for a child who is not theirs', async () => {
    // Holding progress:record says a parent may record; it says nothing about
    // for whom. Without this check any parent could inflate another child's
    // figures, or discover that child exists.
    const response = await api
      .post(`${BASE}/progress/attempts`)
      .set(auth(parentA))
      .send({ studentId: otherStudentId, activityId, correctCount: 5, totalCount: 5 });

    // 404, not 403: a parent should not learn that the id is real.
    expect(response.status).toBe(404);
  });

  it('lets a parent record for their own child', async () => {
    const response = await api
      .post(`${BASE}/progress/attempts`)
      .set(auth(parentA))
      .send({ studentId: schoolA.studentId, activityId, correctCount: 5, totalCount: 5 });

    expect(response.status).toBe(201);
  });

  it('stops a parent reading another child’s progress', async () => {
    const response = await api
      .get(`${BASE}/progress/students/${otherStudentId}`)
      .set(auth(parentA));

    expect(response.status).toBe(404);
  });

  it('keeps attempts and rollups inside their own school', async () => {
    // School B's teacher aiming at School A's child.
    const record = await api
      .post(`${BASE}/progress/attempts`)
      .set(auth(teacherB))
      .send({ studentId: schoolA.studentId, activityId, correctCount: 5, totalCount: 5 });
    expect(record.status).toBe(404);

    const read = await api
      .get(`${BASE}/progress/students/${schoolA.studentId}`)
      .set(auth(teacherB));
    expect(read.status).toBe(404);

    const classroom = await api
      .get(`${BASE}/progress/classrooms/${schoolA.classroomId}`)
      .set(auth(teacherB));
    // A classroom that does not resolve in School B has no students in it.
    expect(classroom.status).toBe(200);
    expect(classroom.body.students).toHaveLength(0);

    // And nothing leaked into School B's tables.
    const strayAttempts = await prismaUnscoped.activityAttempt.count({
      where: { schoolId: schoolB.id },
    });
    const strayProgress = await prismaUnscoped.studentSkillProgress.count({
      where: { schoolId: schoolB.id },
    });
    expect(strayAttempts).toBe(0);
    expect(strayProgress).toBe(0);
  });

  it('summarises a classroom for the teacher who owns it', async () => {
    const response = await api
      .get(`${BASE}/progress/classrooms/${schoolA.classroomId}`)
      .set(auth(teacherA));

    expect(response.status).toBe(200);
    expect(response.body.students).toHaveLength(1);
    expect(response.body.students[0].studentId).toBe(schoolA.studentId);
    expect(response.body.students[0].skillsAttempted).toBe(1);
  });
});
