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
      prompt: { say: 'How many apples?' },
      options: [{ text: '1' }, { text: '2' }],
      answer: 0,
    },
  ],
};

describe.skipIf(!dbUp)('chapters', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let publisher: Session;
  let evsId: string;
  let englishId: string;
  let evsChapterId: string;
  let englishChapterId: string;
  let skillId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    publisher = await login(baseline.superAdminEmail);

    const skill = await prismaUnscoped.skill.create({
      data: { code: 'LETTERS', name: 'Letter recognition' },
    });
    skillId = skill.id;

    const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'NURSERY' },
      select: { id: true },
    });

    const evs = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'NUR_EVS', name: 'EVS Book', classLevelId: nursery.id });
    evsId = evs.body.id as string;

    const english = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'NUR_ENG', name: 'English Book', classLevelId: nursery.id });
    englishId = english.body.id as string;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('divides a book into chapters', async () => {
    const created = await api
      .post(`${BASE}/publication/books/${evsId}/chapters`)
      .set(auth(publisher))
      .send({ name: 'Living things', number: 1 });

    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Living things');
    // Named but not written — the state that looks finished from the outside.
    expect(created.body.questionCount).toBe(0);
    evsChapterId = created.body.id as string;

    const other = await api
      .post(`${BASE}/publication/books/${englishId}/chapters`)
      .set(auth(publisher))
      .send({ name: 'Letters A to E', number: 1 });
    englishChapterId = other.body.id as string;

    const listed = await api.get(`${BASE}/publication/books/${evsId}/chapters`).set(auth(publisher));
    expect(listed.body).toHaveLength(1);
  });

  it('refuses a chapter from a different book', async () => {
    // The rule that keeps the two denormalised columns honest. Without it a
    // page lands in a chapter of a book it is not in, and nobody can find it.
    const wrong = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({
        code: 'MISFILED',
        title: 'Count the leaves',
        type: 'COUNTING',
        skillId,
        bookId: evsId,
        chapterId: englishChapterId,
        content: COUNTING,
      });

    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toContain('different book');
  });

  it('refuses a chapter with no book at all', async () => {
    const orphan = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({
        code: 'NO_BOOK',
        title: 'Count the leaves',
        type: 'COUNTING',
        skillId,
        chapterId: evsChapterId,
        content: COUNTING,
      });

    expect(orphan.status).toBe(400);
  });

  it('files a page into its chapter and counts it there', async () => {
    const filed = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({
        code: 'COUNT_LEAVES',
        title: 'Count the leaves',
        type: 'COUNTING',
        skillId,
        bookId: evsId,
        chapterId: evsChapterId,
        content: COUNTING,
      });

    expect(filed.status).toBe(201);
    expect(filed.body.chapter.name).toBe('Living things');

    await api
      .post(`${BASE}/publication/activities/${filed.body.id}/questions`)
      .set(auth(publisher))
      .send({
        say: 'How many leaves?',
        options: [{ text: '1', isCorrect: true }, { text: '2' }],
      });

    const chapters = await api
      .get(`${BASE}/publication/books/${evsId}/chapters`)
      .set(auth(publisher));

    // What tells an author a chapter has actually been written, rather than
    // merely named.
    expect(chapters.body[0].activityCount).toBe(1);
    expect(chapters.body[0].questionCount).toBe(1);
  });

  it('will not remove a chapter with pages still in it', async () => {
    const response = await api
      .delete(`${BASE}/publication/chapters/${evsChapterId}`)
      .set(auth(publisher));

    // Deleting would scatter a written chapter's pages back into the book with
    // no way to tell which had been where.
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('question type');
  });

  it('narrows the question list by where a question lives', async () => {
    // The catalogue is hundreds of rows. Every filter is a way of getting to
    // the page somebody is actually working on.
    const evsChapter = await prismaUnscoped.chapter.findFirstOrThrow({
      where: { bookId: evsId },
      select: { id: true },
    });

    const all = await api.get(`${BASE}/publication/questions`).set(auth(publisher));
    expect(all.body.total).toBeGreaterThan(0);

    const byBook = await api
      .get(`${BASE}/publication/questions`)
      .query({ bookId: evsId })
      .set(auth(publisher));
    expect(byBook.body.items.every((q: { book: { id: string } }) => q.book.id === evsId)).toBe(true);

    const byChapter = await api
      .get(`${BASE}/publication/questions`)
      .query({ chapterId: evsChapter.id })
      .set(auth(publisher));
    expect(byChapter.body.total).toBe(byBook.body.total);

    // A chapter from the other book has nothing in it, which is the honest
    // answer rather than an error.
    const elsewhere = await api
      .get(`${BASE}/publication/questions`)
      .query({ chapterId: englishChapterId })
      .set(auth(publisher));
    expect(elsewhere.body.total).toBe(0);
  });

  it('combines filters rather than letting the last one win', async () => {
    // Every filter but the search narrows the *page* a question sits on, so
    // they fold into one clause — two separate ones would silently replace
    // each other and the second filter would appear to do nothing.
    const both = await api
      .get(`${BASE}/publication/questions`)
      .query({ bookId: englishId, chapterId: englishChapterId })
      .set(auth(publisher));
    expect(both.body.total).toBe(0);

    const searched = await api
      .get(`${BASE}/publication/questions`)
      .query({ bookId: evsId, search: 'leaves' })
      .set(auth(publisher));
    expect(searched.body.total).toBe(1);

    const missing = await api
      .get(`${BASE}/publication/questions`)
      .query({ bookId: evsId, search: 'nothing matches this' })
      .set(auth(publisher));
    expect(missing.body.total).toBe(0);
  });

  it('is the publisher’s alone', async () => {
    const admin = await login(school.adminEmail);

    const listed = await api
      .get(`${BASE}/publication/books/${evsId}/chapters`)
      .set(auth(admin));
    expect(listed.status).toBe(403);

    const written = await api
      .post(`${BASE}/publication/books/${evsId}/chapters`)
      .set(auth(admin))
      .send({ name: 'Our own chapter' });
    expect(written.status).toBe(403);
  });
});
