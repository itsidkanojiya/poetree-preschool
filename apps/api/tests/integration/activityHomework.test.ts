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

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!dbUp)('homework that is an activity', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let teacher: Session;
  let parent: Session;
  let activityId: string;
  let otherActivityId: string;
  let homeworkId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    teacher = await login(school.teacherEmail);
    parent = await login(school.parentPhone);

    const skill = await prismaUnscoped.skill.create({
      data: { code: 'LETTERS', name: 'Letter recognition' },
    });
    const activity = await prismaUnscoped.learningActivity.create({
      data: { code: 'TRACE_A', title: 'Trace the letter A', type: 'TRACING', skillId: skill.id },
    });
    activityId = activity.id;

    const other = await prismaUnscoped.learningActivity.create({
      data: { code: 'TRACE_B', title: 'Trace the letter B', type: 'TRACING', skillId: skill.id },
    });
    otherActivityId = other.id;

    const created = await api
      .post(`${BASE}/homework`)
      .set(auth(teacher))
      .send({
        classroomId: school.classroomId,
        title: 'Practise letter A',
        dueDate: inDays(3),
        allowsSubmission: false,
        learningActivityId: activityId,
      });
    homeworkId = created.body.id as string;

    await api.post(`${BASE}/homework/${homeworkId}/publish`).set(auth(teacher));
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('tells the family what there is to play', async () => {
    const listed = await api
      .get(`${BASE}/homework`)
      .query({ studentId: school.studentId })
      .set(auth(parent));

    const work = listed.body.items.find((h: { id: string }) => h.id === homeworkId);

    expect(work.activity.id).toBe(activityId);
    expect(work.activity.title).toBe('Trace the letter A');
    expect(work.mySubmission.status).toBe('PENDING');
  });

  it('marks itself the moment the child finishes it', async () => {
    // The whole point of the bridge. Before this, a parent whose child had
    // just played the very activity that was set still had to tap "done"
    // themselves — a self-report standing in for a record we already had.
    const played = await api
      .post(`${BASE}/progress/attempts`)
      .set(auth(parent))
      .send({
        studentId: school.studentId,
        activityId,
        correctCount: 8,
        totalCount: 10,
      });
    expect(played.status).toBe(201);

    const listed = await api
      .get(`${BASE}/homework`)
      .query({ studentId: school.studentId })
      .set(auth(parent));
    const work = listed.body.items.find((h: { id: string }) => h.id === homeworkId);

    expect(work.mySubmission.status).toBe('SUBMITTED');
    expect(work.mySubmission.submittedOn).not.toBeNull();
  });

  it('shows the teacher the score rather than deciding for them', async () => {
    const submissions = await api
      .get(`${BASE}/homework/${homeworkId}/submissions`)
      .set(auth(teacher));

    const mine = submissions.body.find(
      (s: { studentId: string }) => s.studentId === school.studentId,
    );

    // SUBMITTED and not COMPLETED, deliberately: everywhere else in this system
    // COMPLETED means a teacher looked and agreed. What the bridge removes is
    // the parent's guess, not the teacher's judgement.
    expect(mine.status).toBe('SUBMITTED');
    expect(mine.note).toBe('Played in the app — 8 of 10 right.');
  });

  it('closes nothing when a different activity is played', async () => {
    const second = await api
      .post(`${BASE}/homework`)
      .set(auth(teacher))
      .send({
        classroomId: school.classroomId,
        title: 'Practise letter B',
        dueDate: inDays(3),
        allowsSubmission: false,
        learningActivityId: otherActivityId,
      });
    await api.post(`${BASE}/homework/${second.body.id}/publish`).set(auth(teacher));

    await api
      .post(`${BASE}/progress/attempts`)
      .set(auth(parent))
      .send({ studentId: school.studentId, activityId, correctCount: 5, totalCount: 5 });

    const listed = await api
      .get(`${BASE}/homework`)
      .query({ studentId: school.studentId })
      .set(auth(parent));
    const letterB = listed.body.items.find((h: { id: string }) => h.id === second.body.id);

    // Playing A again must not close B. Obvious, and exactly the sort of thing
    // a one-line where clause gets wrong.
    expect(letterB.mySubmission.status).toBe('PENDING');
  });

  it('does not reopen or overwrite work the teacher has already judged', async () => {
    const submissions = await api
      .get(`${BASE}/homework/${homeworkId}/submissions`)
      .set(auth(teacher));
    const mine = submissions.body.find(
      (s: { studentId: string }) => s.studentId === school.studentId,
    );

    await api
      .patch(`${BASE}/homework/submissions/${mine.id}`)
      .set(auth(teacher))
      .send({ status: 'COMPLETED', teacherRemark: 'Lovely letters' });

    // The child plays it again, as children do.
    await api
      .post(`${BASE}/progress/attempts`)
      .set(auth(parent))
      .send({ studentId: school.studentId, activityId, correctCount: 2, totalCount: 10 });

    const after = await api
      .get(`${BASE}/homework`)
      .query({ studentId: school.studentId })
      .set(auth(parent));
    const work = after.body.items.find((h: { id: string }) => h.id === homeworkId);

    // A second, worse attempt must not undo the teacher's mark or replace
    // their remark with a score.
    expect(work.mySubmission.status).toBe('COMPLETED');
    expect(work.mySubmission.teacherRemark).toBe('Lovely letters');
  });
});
