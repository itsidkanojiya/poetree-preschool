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

describe.skipIf(!dbUp)('watch the film, then the chapter opens', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let publisher: Session;
  let parent: Session;
  let skillId: string;
  let lockedBookId: string;
  let lockedChapterId: string;
  let openChapterId: string;
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
    skillId = skill.id;
    const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'NURSERY' },
      select: { id: true },
    });

    const withFilm = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'NUR_EVS', name: 'EVS Book', classLevelId: nursery.id });
    lockedBookId = withFilm.body.id as string;

    const filmed = await api
      .post(`${BASE}/publication/books/${lockedBookId}/chapters`)
      .set(auth(publisher))
      .send({ name: 'Leaves', animationUrl: 'https://youtu.be/dQw4w9WgXcQ?t=5' });
    lockedChapterId = filmed.body.id as string;
    // Stored as pasted, served with the id a player needs.
    expect(filmed.body.animation.videoId).toBe('dQw4w9WgXcQ');

    const without = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'NUR_ENG', name: 'English Book', classLevelId: nursery.id });
    openBookId = without.body.id as string;

    const unfilmed = await api
      .post(`${BASE}/publication/books/${openBookId}/chapters`)
      .set(auth(publisher))
      .send({ name: 'Letters' });
    openChapterId = unfilmed.body.id as string;

    await api
      .put(`${BASE}/publication/schools/${school.id}/books`)
      .set(auth(publisher))
      .send({
        books: [
          { bookId: lockedBookId, enabled: true },
          { bookId: openBookId, enabled: true },
        ],
      });

    for (const [code, bookId, chapterId] of [
      ['COUNT_LEAVES', lockedBookId, lockedChapterId],
      ['COUNT_LETTERS', openBookId, openChapterId],
    ] as const) {
      const activity = await api
        .post(`${BASE}/publication/activities`)
        .set(auth(publisher))
        .send({
          code,
          title: `Count with ${code}`,
          type: 'COUNTING',
          skillId: skill.id,
          bookIds: [bookId],
          chapterId,
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
      .post(`${BASE}/publication/books/${lockedBookId}/chapters`)
      .set(auth(publisher))
      .send({ name: 'Broken', animationUrl: 'https://vimeo.com/12345678' });

    // A chapter whose film will not play is a chapter whose pages never open,
    // and nobody would find out until a child sat in front of it.
    expect(bad.status).toBe(400);
  });

  it('says which books have a film waiting inside them', async () => {
    const shelf = await api
      .get(`${BASE}/catalogue/children/${school.studentId}/books`)
      .set(auth(parent));

    expect(shelf.status).toBe(200);
    const locked = shelf.body.find((b: { id: string }) => b.id === lockedBookId);
    const open = shelf.body.find((b: { id: string }) => b.id === openBookId);

    expect(locked.isUnlocked).toBe(false);
    expect(locked.filmsToWatch).toBe(1);
    // A book whose chapters have no film does not lock itself — most of the
    // catalogue has none.
    expect(open.isUnlocked).toBe(true);
    expect(open.filmsToWatch).toBe(0);
  });

  it('gives the app each chapter with its film', async () => {
    const chapters = await api
      .get(`${BASE}/catalogue/children/${school.studentId}/books/${lockedBookId}/chapters`)
      .set(auth(parent));

    expect(chapters.status).toBe(200);
    const chapter = chapters.body.find((c: { id: string }) => c.id === lockedChapterId);
    expect(chapter.animation.videoId).toBe('dQw4w9WgXcQ');
    expect(chapter.isUnlocked).toBe(false);
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
      .post(`${BASE}/catalogue/chapters/${lockedChapterId}/watched`)
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
      .post(`${BASE}/catalogue/chapters/${lockedChapterId}/watched`)
      .set(auth(parent))
      .send({ studentId: school.studentId });

    // Watched is watched. A child replaying it has not watched it twice, and a
    // flaky connection retrying must not write a second row.
    const rows = await prismaUnscoped.chapterAnimationView.count({
      where: { studentId: school.studentId, chapterId: lockedChapterId },
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
      .post(`${BASE}/catalogue/chapters/${lockedChapterId}/watched`)
      .set(auth(parent))
      .send({ studentId: other.id });

    // Same school, same book — every filter passes except the guardian link.
    expect(response.status).toBe(404);
  });
  it('leaves an every-book page open, because it is in no chapter', async () => {
    /**
     * Films gate chapters now, not books.
     *
     * A page that belongs in every book belongs to no chapter of any of them,
     * so nothing stands in front of it — which is the right answer for a
     * warm-up page that belongs everywhere, and a change from when the film
     * belonged to the book and gated everything inside it.
     */
    const everywhere = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({ title: 'Warm up', type: 'FLASHCARD', skillId, allBooks: true, bookIds: [] });
    expect(everywhere.status).toBe(201);

    await prismaUnscoped.chapterAnimationView.deleteMany({
      where: { studentId: school.studentId, chapterId: lockedChapterId },
    });

    const offered = await api
      .get(`${BASE}/progress/activities`)
      .query({ studentId: school.studentId, bookId: lockedBookId })
      .set(auth(parent));

    const row = offered.body.find((item: { id: string }) => item.id === everywhere.body.id);
    expect(row).toBeDefined();
    expect(row.book.id).toBe(lockedBookId);
    expect(row.isLocked).toBe(false);

    // While the page that IS in the filmed chapter stays shut.
    const gated = offered.body.find((item: { id: string }) => item.id === lockedActivityId);
    expect(gated.isLocked).toBe(true);
  });
});
