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

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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
  let nurseryId: string;

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
    nurseryId = nursery.id;
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
        bookIds: [evsId],
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
        bookIds: [evsId],
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
  it('renumbers the contents page when chapters are dragged', async () => {
    // Three chapters, printed 1-2-3, dragged so the last one leads.
    const made = [];
    for (const [index, name] of ['One', 'Two', 'Three'].entries()) {
      const created = await api
        .post(`${BASE}/publication/books/${englishId}/chapters`)
        .set(auth(publisher))
        .send({ name: `Drag ${name}`, number: index + 1 });
      made.push(created.body.id as string);
    }

    // Every chapter the book has, not only the three just made — the book was
    // seeded with one, and a partial list is refused on purpose.
    const others = await prismaUnscoped.chapter.findMany({
      where: { bookId: englishId, id: { notIn: made } },
      select: { id: true },
    });

    const reordered = await api
      .put(`${BASE}/publication/books/${englishId}/chapters/order`)
      .set(auth(publisher))
      .send({ chapterIds: [made[2], made[0], made[1], ...others.map((row) => row.id)] });

    expect(reordered.status).toBe(200);

    const moved = await prismaUnscoped.chapter.findMany({
      where: { id: { in: made } },
      select: { id: true, number: true, sortOrder: true },
    });
    const byId = new Map(moved.map((row) => [row.id, row]));

    // Numbering follows the order, so the one dragged to the front is 1.
    expect(byId.get(made[2]!)?.number).toBe(1);
    expect(byId.get(made[0]!)?.number).toBe(2);
    expect(byId.get(made[1]!)?.number).toBe(3);
    expect(byId.get(made[2]!)?.sortOrder).toBe(1);
  });

  it('numbers a chapter by where it sits, not by what was typed', async () => {
    /**
     * The number follows the order, for every chapter.
     *
     * It used to be left alone unless it had one already, so a contents page
     * could sit there reading 1, 3, 2 after a drag — the position and the
     * printed number saying different things about the same book. Nobody types
     * "4" for the fourth chapter; they put it fourth.
     */
    const intro = await api
      .post(`${BASE}/publication/books/${evsId}/chapters`)
      .set(auth(publisher))
      .send({ name: 'Getting ready' });

    // Numbered on the way in, without being asked for one.
    expect(intro.body.number).toBeGreaterThan(0);

    const existing = await prismaUnscoped.chapter.findMany({
      where: { bookId: evsId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });

    // Put the newest chapter first and everything else after it.
    const order = [
      intro.body.id as string,
      ...existing.map((row) => row.id).filter((id) => id !== intro.body.id),
    ];

    const response = await api
      .put(`${BASE}/publication/books/${evsId}/chapters/order`)
      .set(auth(publisher))
      .send({ chapterIds: order });
    expect(response.status).toBe(200);

    const after = await prismaUnscoped.chapter.findMany({
      where: { bookId: evsId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, number: true, sortOrder: true },
    });

    // 1, 2, 3 … with no gaps and nothing out of step.
    expect(after.map((row) => row.number)).toEqual(after.map((_, index) => index + 1));
    expect(after[0]!.id).toBe(intro.body.id);
  });

  it('refuses an order that is not this book’s chapters', async () => {
    // A partial list would leave the chapters it forgot on stale positions,
    // which is how a contents page ends up with two chapter threes.
    const partial = await api
      .put(`${BASE}/publication/books/${englishId}/chapters/order`)
      .set(auth(publisher))
      .send({ chapterIds: [englishChapterId] });
    expect(partial.status).toBe(400);

    // And a chapter belonging to a different book is not this book's to sort.
    const all = await prismaUnscoped.chapter.findMany({
      where: { bookId: englishId },
      select: { id: true },
    });
    const foreign = await api
      .put(`${BASE}/publication/books/${englishId}/chapters/order`)
      .set(auth(publisher))
      .send({ chapterIds: [...all.map((row) => row.id).slice(1), evsChapterId] });
    expect(foreign.status).toBe(400);
  });
  it('puts one page in several books without copying it', async () => {
    // The same "trace the letter A" belongs in the phonics book and in English.
    // Writing it twice meant two rows to fix and two piles of attempts for what
    // a child experienced as one page.
    const shared = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({
        title: 'Trace the letter A',
        type: 'TRACING',
        skillId,
        bookIds: [evsId, englishId],
      });

    expect(shared.status).toBe(201);
    expect(shared.body.books.map((book: { id: string }) => book.id).sort()).toEqual(
      [evsId, englishId].sort(),
    );

    // And it is found under either book.
    for (const bookId of [evsId, englishId]) {
      const inBook = await api
        .get(`${BASE}/publication/activities`)
        .set(auth(publisher))
        .query({ bookId });
      expect(
        inBook.body.items.some((row: { id: string }) => row.id === shared.body.id),
      ).toBe(true);
    }
  });

  it('refuses a chapter for a page that lives in more than one book', async () => {
    // A chapter belongs to one book, so it cannot say where a shared page sits.
    const shared = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({ title: 'Shared page', type: 'FLASHCARD', skillId, bookIds: [evsId, englishId] });

    const filed = await api
      .patch(`${BASE}/publication/activities/${shared.body.id}`)
      .set(auth(publisher))
      .send({ chapterId: evsChapterId });

    expect(filed.status).toBe(400);
  });

  it('puts an every-book page in a book it was never linked to', async () => {
    const everywhere = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({ title: 'Warm up', type: 'FLASHCARD', skillId, allBooks: true, bookIds: [] });

    expect(everywhere.body.allBooks).toBe(true);
    expect(everywhere.body.books).toHaveLength(0);

    // A book written afterwards has it too, which is the whole point.
    const later = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ name: 'Written later', classLevelId: nurseryId });

    const inLater = await api
      .get(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .query({ bookId: later.body.id });

    expect(
      inLater.body.items.some((row: { id: string }) => row.id === everywhere.body.id),
    ).toBe(true);
  });

  it('takes a page out of a book when the list no longer names it', async () => {
    const page = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({ title: 'Moved page', type: 'FLASHCARD', skillId, bookIds: [evsId, englishId] });

    const moved = await api
      .patch(`${BASE}/publication/activities/${page.body.id}`)
      .set(auth(publisher))
      .send({ bookIds: [englishId] });

    expect(moved.status).toBe(200);
    expect(moved.body.books.map((book: { id: string }) => book.id)).toEqual([englishId]);
  });
  it('carries a chapter’s picture through to the contents page a child sees', async () => {
    // The same trip the book cover makes, one level down: a contents page of
    // numbered rectangles is unreadable to a child who cannot read, which is
    // every child this is for.
    const artwork = await api
      .post(`${BASE}/publication/assets`)
      .set(auth(publisher))
      .attach('file', TINY_PNG, 'living-things.png');
    expect(artwork.status).toBe(201);

    const patched = await api
      .patch(`${BASE}/publication/chapters/${evsChapterId}`)
      .set(auth(publisher))
      .send({ coverFileId: artwork.body.id });

    expect(patched.status).toBe(200);
    expect(patched.body.coverUrl).toContain(artwork.body.id);

    await api
      .put(`${BASE}/publication/schools/${school.id}/books`)
      .set(auth(publisher))
      .send({ books: [{ bookId: evsId, enabled: true }] });

    const parent = await login(school.parentPhone);
    const contents = await api
      .get(`${BASE}/catalogue/children/${school.studentId}/books/${evsId}/chapters`)
      .set(auth(parent));

    expect(contents.status).toBe(200);
    const chapter = contents.body.find((row: { id: string }) => row.id === evsChapterId);
    expect(chapter.coverUrl).toContain(`/catalogue/assets/${artwork.body.id}`);
  });

  it('leaves the other chapters’ pictures alone when one is saved', async () => {
    // The portal saves the whole contents page at once, so the danger is a
    // rename sending a null cover for every row it touched — eleven chapters
    // quietly losing their artwork because somebody fixed a typo in the
    // twelfth. An absent key has to mean "as it was".
    const renamed = await api
      .patch(`${BASE}/publication/chapters/${evsChapterId}`)
      .set(auth(publisher))
      .send({ name: 'Living things around us' });

    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Living things around us');
    expect(renamed.body.coverUrl).not.toBeNull();
  });

  it('takes a picture off when the cover is explicitly cleared', async () => {
    const cleared = await api
      .patch(`${BASE}/publication/chapters/${evsChapterId}`)
      .set(auth(publisher))
      .send({ coverFileId: null });

    expect(cleared.status).toBe(200);
    expect(cleared.body.coverUrl).toBeNull();
  });

  it('refuses a school’s own file as a chapter picture', async () => {
    // The mirror of the book cover rule. A school's file is tenant-scoped, and
    // hanging one off a chapter would serve one school's bytes to every other
    // school that bought the book — through a route that deliberately asks no
    // questions about tenancy.
    const admin = await login(school.adminEmail);
    const theirs = await api
      .post(`${BASE}/files`)
      .set(auth(admin))
      .attach('file', TINY_PNG, 'ours.png');
    expect(theirs.status).toBe(201);

    const rejected = await api
      .patch(`${BASE}/publication/chapters/${englishChapterId}`)
      .set(auth(publisher))
      .send({ coverFileId: theirs.body.id });

    expect(rejected.status).toBe(400);

    const chapter = await prismaUnscoped.chapter.findUniqueOrThrow({
      where: { id: englishChapterId },
      select: { coverFileId: true },
    });
    expect(chapter.coverFileId).toBeNull();
  });
});
