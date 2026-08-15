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

const COUNTING = {
  kind: 'COUNTING',
  items: [
    {
      prompt: { say: 'How many apples?', glyph: '🍎' },
      // Objects rather than bare strings since an option can be a picture.
      options: [{ text: '1' }, { text: '2' }, { text: '3' }],
      answer: 1,
    },
  ],
};

describe.skipIf(!dbUp)('the publisher’s activity catalogue', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let publisher: Session;
  let schoolAdmin: Session;
  let skillId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');

    publisher = await login(baseline.superAdminEmail);
    schoolAdmin = await login(school.adminEmail);

    // Skills ship with the product, not with a school — resetDatabase clears
    // them along with everything else, so the suite provides its own.
    const skill = await prismaUnscoped.skill.create({
      data: { code: 'NUMBER_SENSE', name: 'Number sense' },
      select: { id: true },
    });
    skillId = skill.id;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('lets the publisher write an activity every school will play', async () => {
    const created = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({
        code: 'COUNT_APPLES_1',
        title: 'Counting apples',
        type: 'COUNTING',
        skillId,
        content: COUNTING,
      });

    expect(created.status).toBe(201);
    expect(created.body.isPlayable).toBe(true);
    expect(created.body.itemCount).toBe(1);
    expect(created.body.attemptCount).toBe(0);
  });

  it('refuses content the app could not render', async () => {
    // The whole point of validating here: the alternative is a four-year-old
    // tapping an activity and getting a blank screen.
    const broken = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({
        code: 'COUNT_BROKEN',
        title: 'Broken counting',
        type: 'COUNTING',
        skillId,
        content: {
          kind: 'COUNTING',
          items: [{ prompt: { say: 'How many?' }, options: [{ text: '1' }] }],
        },
      });

    expect(broken.status).toBe(400);
    expect(broken.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses content of the wrong kind for the type', async () => {
    const mismatched = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({
        code: 'TRACE_WRONG',
        title: 'Tracing with counting inside',
        type: 'TRACING',
        skillId,
        content: COUNTING,
      });

    expect(mismatched.status).toBe(400);
  });

  it('will not let two activities share a code', async () => {
    // The code is printed against a workbook page, so it has to mean one thing.
    const clash = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({
        code: 'COUNT_APPLES_1',
        title: 'Counting apples again',
        type: 'COUNTING',
        skillId,
        content: COUNTING,
      });

    expect(clash.status).toBe(409);
  });

  it('keeps a school out of the catalogue entirely', async () => {
    const listed = await api.get(`${BASE}/publication/activities`).set(auth(schoolAdmin));
    expect(listed.status).toBe(403);

    const written = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(schoolAdmin))
      .send({
        code: 'SCHOOL_OWN',
        title: 'Our own alphabet',
        type: 'COUNTING',
        skillId,
        content: COUNTING,
      });

    // A school editing the catalogue would fork it: "80% on letter
    // recognition" has to mean the same thing at every school.
    expect(written.status).toBe(403);
  });

  it('retires an activity without destroying the evidence behind it', async () => {
    const activity = await prismaUnscoped.learningActivity.findUnique({
      where: { code: 'COUNT_APPLES_1' },
      select: { id: true },
    });

    // A child plays it, which is what makes retiring it delicate.
    await prismaUnscoped.activityAttempt.create({
      data: {
        schoolId: school.id,
        studentId: school.studentId,
        activityId: activity!.id,
        correctCount: 1,
        totalCount: 1,
      },
    });

    const retired = await api
      .patch(`${BASE}/publication/activities/${activity!.id}`)
      .set(auth(publisher))
      .send({ isActive: false });

    expect(retired.status).toBe(200);
    expect(retired.body.isActive).toBe(false);
    expect(retired.body.attemptCount).toBe(1);

    // Gone from what the app offers…
    const offered = await api.get(`${BASE}/progress/activities`).set(auth(schoolAdmin));
    expect(offered.body.map((a: { id: string }) => a.id)).not.toContain(activity!.id);

    // …but the attempt behind that child's mastery figure is still there.
    const attempts = await prismaUnscoped.activityAttempt.count({
      where: { activityId: activity!.id },
    });
    expect(attempts).toBe(1);
  });

  it('will not let the code or type be changed after children have played', async () => {
    const activity = await prismaUnscoped.learningActivity.findUnique({
      where: { code: 'COUNT_APPLES_1' },
      select: { id: true, type: true },
    });

    await api
      .patch(`${BASE}/publication/activities/${activity!.id}`)
      .set(auth(publisher))
      .send({ code: 'RENAMED', type: 'TRACING', title: 'Still counting apples' });

    const after = await prismaUnscoped.learningActivity.findUnique({
      where: { id: activity!.id },
      select: { code: true, type: true, title: true },
    });

    // The title is editable; the two that would rewrite history are not.
    expect(after!.code).toBe('COUNT_APPLES_1');
    expect(after!.type).toBe(activity!.type);
    expect(after!.title).toBe('Still counting apples');
  });
});
