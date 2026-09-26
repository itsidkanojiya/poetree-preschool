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
 * A child's shelf, entered by subject.
 *
 * The app goes Subject → Book → Chapter → film, because a subject holds several
 * books. What is worth pinning here is what the child is NOT shown: a subject
 * with nothing in it for them, and a book lost because nobody filed it.
 */
describe.skipIf(!dbUp)('subjects, books and the second film', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let publisher: Session;
  let parent: Session;

  let englishId: string;
  let mathsId: string;
  let englishBookId: string;
  let unfiledBookId: string;
  let bothFilmsChapterId: string;
  let onlyThreeDChapterId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    publisher = await login(baseline.superAdminEmail);
    parent = await login(school.parentPhone);

    const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'NURSERY' },
      select: { id: true },
    });

    const english = await api
      .post(`${BASE}/publication/book-subjects`)
      .set(auth(publisher))
      .send({ name: 'English', icon: 'abc' });
    englishId = english.body.id;

    // A subject with no book the school bought: it must never reach the child.
    const maths = await api
      .post(`${BASE}/publication/book-subjects`)
      .set(auth(publisher))
      .send({ name: 'Maths', icon: 'numbers' });
    mathsId = maths.body.id;

    const englishBook = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ name: 'English Book A', classLevelId: nursery.id, subjectId: englishId });
    englishBookId = englishBook.body.id;

    const unfiled = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ name: 'Mystery Workbook', classLevelId: nursery.id });
    unfiledBookId = unfiled.body.id;

    await api
      .put(`${BASE}/publication/schools/${school.id}/books`)
      .set(auth(publisher))
      .send({
        books: [
          { bookId: englishBookId, enabled: true },
          { bookId: unfiledBookId, enabled: true },
        ],
      });

    const both = await api
      .post(`${BASE}/publication/books/${englishBookId}/chapters`)
      .set(auth(publisher))
      .send({
        name: 'Alphabets',
        animationUrl: 'https://youtu.be/dQw4w9WgXcQ',
        animation3dUrl: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
      });
    bothFilmsChapterId = both.body.id;

    const onlyThreeD = await api
      .post(`${BASE}/publication/books/${englishBookId}/chapters`)
      .set(auth(publisher))
      .send({ name: 'Numbers', animation3dUrl: 'https://youtu.be/kJQP7kiw5Fk' });
    onlyThreeDChapterId = onlyThreeD.body.id;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('files a book under a subject, and says so to the publisher', async () => {
    const books = await api.get(`${BASE}/publication/books`).set(auth(publisher));
    const english = books.body.find((b: { id: string }) => b.id === englishBookId);

    expect(english.subject).toEqual({ id: englishId, name: 'English' });
  });

  it('shows a child only the subjects with something in them', async () => {
    const subjects = await api
      .get(`${BASE}/catalogue/children/${school.studentId}/subjects`)
      .set(auth(parent));

    expect(subjects.status).toBe(200);
    const ids = subjects.body.map((s: { id: string | null }) => s.id);

    expect(ids).toContain(englishId);
    // Bought nothing under Maths, so no empty Maths tile.
    expect(ids).not.toContain(mathsId);

    const english = subjects.body.find((s: { id: string | null }) => s.id === englishId);
    expect(english.bookCount).toBe(1);
    expect(english.filmCount).toBe(2);
    expect(english.filmsToWatch).toBe(2);
  });

  it('keeps an unfiled book reachable under "More books", last', async () => {
    // A book must not vanish from a child's shelf because a dropdown in the
    // admin panel was left empty.
    const subjects = await api
      .get(`${BASE}/catalogue/children/${school.studentId}/subjects`)
      .set(auth(parent));

    const last = subjects.body[subjects.body.length - 1];
    expect(last.id).toBeNull();
    expect(last.name).toBe('More books');

    const unfiled = await api
      .get(`${BASE}/catalogue/children/${school.studentId}/books`)
      .query({ subjectId: 'none' })
      .set(auth(parent));
    expect(unfiled.body.map((b: { id: string }) => b.id)).toEqual([unfiledBookId]);
  });

  it('narrows the shelf to one subject', async () => {
    const english = await api
      .get(`${BASE}/catalogue/children/${school.studentId}/books`)
      .query({ subjectId: englishId })
      .set(auth(parent));

    expect(english.body.map((b: { id: string }) => b.id)).toEqual([englishBookId]);
    expect(english.body[0].subject.icon).toBe('abc');
  });

  it('offers the 3D film beside the 2D one', async () => {
    const chapters = await api
      .get(`${BASE}/catalogue/children/${school.studentId}/books/${englishBookId}/chapters`)
      .set(auth(parent));

    const both = chapters.body.find((c: { id: string }) => c.id === bothFilmsChapterId);
    expect(both.animation.videoId).toBe('dQw4w9WgXcQ');
    expect(both.animation3d.videoId).toBe('9bZkp7q19f0');
    expect(both.isWatched).toBe(false);
  });

  it('does not show "no film" for a chapter published only in 3D', async () => {
    const chapters = await api
      .get(`${BASE}/catalogue/children/${school.studentId}/books/${englishBookId}/chapters`)
      .set(auth(parent));

    const onlyThreeD = chapters.body.find((c: { id: string }) => c.id === onlyThreeDChapterId);
    // The single film fills the main slot, and there is nothing to switch to.
    expect(onlyThreeD.animation.videoId).toBe('kJQP7kiw5Fk');
    expect(onlyThreeD.animation3d).toBeNull();
    // It has a film, so its pages stay shut until it is watched.
    expect(onlyThreeD.isUnlocked).toBe(false);
  });

  it('marks a chapter watched, which is what completes it', async () => {
    const watched = await api
      .post(`${BASE}/catalogue/chapters/${bothFilmsChapterId}/watched`)
      .set(auth(parent))
      .send({ studentId: school.studentId });
    expect(watched.status).toBe(200);

    const chapters = await api
      .get(`${BASE}/catalogue/children/${school.studentId}/books/${englishBookId}/chapters`)
      .set(auth(parent));
    const both = chapters.body.find((c: { id: string }) => c.id === bothFilmsChapterId);
    expect(both.isWatched).toBe(true);

    const subjects = await api
      .get(`${BASE}/catalogue/children/${school.studentId}/subjects`)
      .set(auth(parent));
    const english = subjects.body.find((s: { id: string | null }) => s.id === englishId);
    expect(english.filmsToWatch).toBe(1);
  });

  it('retires a subject without losing its books', async () => {
    await api
      .patch(`${BASE}/publication/book-subjects/${mathsId}`)
      .set(auth(publisher))
      .send({ isActive: false });

    const list = await api.get(`${BASE}/publication/book-subjects`).set(auth(publisher));
    const maths = list.body.find((s: { id: string }) => s.id === mathsId);
    expect(maths.isActive).toBe(false);
  });

  it('keeps the subject list to the publisher', async () => {
    const refused = await api.get(`${BASE}/publication/book-subjects`).set(auth(parent));
    expect(refused.status).toBe(403);
  });
});
