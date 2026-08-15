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
    { prompt: { say: 'How many?' }, options: [{ text: '1' }, { text: '2' }], answer: 0 },
  ],
};

describe.skipIf(!dbUp)('watch the animation, then the book opens', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let publisher: Session;
  let parent: Session;
  let lockedBookId: string;
  let openBookId: string;
  let lockedActivityId: string;
  let openActivityId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    publisher = await login(baseline.superAdminEmail);
    parent = await login(school.parentPhone);

    const skill = await prismaUnscoped.skill.create({
      data: { code: 'LETTERS', name: 'Letters' },
    });
    const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'NURSERY' },
      select: { id: true },
    });

    const withFilm = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({
        code: 'NUR_EVS',
        name: 'EVS Book',
        classLevelId: nursery.id,
        animationUrl: 'https://youtu.be/dQw4w9WgXcQ?t=5',
      });
    lockedBookId = withFilm.body.id as string;
    // Stored as pasted, served with the id a player needs.
    expect(withFilm.body.animation.videoId).toBe('dQw4w9WgXcQ');

    const without = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'NUR_ENG', name: 'English Book', classLevelId: nursery.id });
    openBookId = without.body.id as string;

    await api
      .put(`${BASE}/publication/schools/${school.id}/books`)
      .set(auth(publisher))
      .send({
        books: [
          { bookId: lockedBookId, enabled: true },
          { bookId: openBookId, enabled: true },
        ],
      });

    for (const [code, bookId] of [
      ['COUNT_LEAVES', lockedBookId],
      ['COUNT_LETTERS', openBookId],
    ] as const) {
      const activity = await api
        .post(`${BASE}/publication/activities`)
        .set(auth(publisher))
        .send({
          code,
          title: `Count with ${code}`,
          type: 'COUNTING',
          skillId: skill.id,
          bookId,
          classLevelId: nursery.id,
          content: COUNTING,
        });
      if (bookId === lockedBookId) lockedActivityId = activity.body.id as string;
      else openActivityId = activity.body.id as string;
    }
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('refuses a link that is not a YouTube video', async () => {
    const bad = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({
        code: 'NUR_BAD',
        name: 'Broken',
        classLevelId: (await prismaUnscoped.classLevel.findFirstOrThrow()).id,
        animationUrl: 'https://vimeo.com/12345678',
      });

    // A book whose animation will not play is a book whose activities never
    // open, and nobody would find out until a child sat in front of it.
    expect(bad.status).toBe(400);
  });

  it('locks a book with a film and leaves one without it open', async () => {
    const shelf = await api
      .get(`${BASE}/catalogue/children/${school.studentId}/books`)
      .set(auth(parent));

    expect(shelf.status).toBe(200);
    const locked = shelf.body.find((b: { id: string }) => b.id === lockedBookId);
    const open = shelf.body.find((b: { id: string }) => b.id === openBookId);

    expect(locked.isUnlocked).toBe(false);
    expect(locked.animation.videoId).toBe('dQw4w9WgXcQ');
    // A book with no film does not lock itself — most of the catalogue has none.
    expect(open.isUnlocked).toBe(true);
    expect(open.animation).toBeNull();
  });

  it('still lists the locked activity rather than hiding it', async () => {
    const offered = await api
      .get(`${BASE}/progress/activities`)
      .query({ studentId: school.studentId })
      .set(auth(parent));

    const locked = offered.body.find((a: { id: string }) => a.id === lockedActivityId);
    const open = offered.body.find((a: { id: string }) => a.id === openActivityId);

    // A book that vanished until its film had been watched would look like a
    // book with nothing in it, and the child would never find the film.
    expect(locked).toBeDefined();
    expect(locked.isLocked).toBe(true);
    expect(open.isLocked).toBe(false);
  });

  it('opens the book once the child has watched it', async () => {
    const watched = await api
      .post(`${BASE}/catalogue/books/${lockedBookId}/watched`)
      .set(auth(parent))
      .send({ studentId: school.studentId });

    expect(watched.status).toBe(200);

    const offered = await api
      .get(`${BASE}/progress/activities`)
      .query({ studentId: school.studentId })
      .set(auth(parent));
    expect(offered.body.find((a: { id: string }) => a.id === lockedActivityId).isLocked).toBe(
      false,
    );
  });

  it('stays open, and records the watch only once', async () => {
    await api
      .post(`${BASE}/catalogue/books/${lockedBookId}/watched`)
      .set(auth(parent))
      .send({ studentId: school.studentId });

    // Watched is watched. A child replaying it has not watched it twice, and a
    // flaky connection retrying must not write a second row.
    const rows = await prismaUnscoped.bookAnimationView.count({
      where: { studentId: school.studentId, bookId: lockedBookId },
    });
    expect(rows).toBe(1);
  });

  it('will not let a parent unlock somebody else’s child', async () => {
    const other = await prismaUnscoped.student.create({
      data: {
        schoolId: school.id,
        admissionNo: 'A-0777',
        firstName: 'Someone',
        dateOfBirth: new Date('2021-06-01'),
        gender: 'MALE',
      },
    });

    const response = await api
      .post(`${BASE}/catalogue/books/${lockedBookId}/watched`)
      .set(auth(parent))
      .send({ studentId: other.id });

    // Same school, same book — every filter passes except the guardian link.
    expect(response.status).toBe(404);
  });
});
