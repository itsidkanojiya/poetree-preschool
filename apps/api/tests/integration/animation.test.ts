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
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';
import { backgroundSettled } from '../../src/lib/compress.js';
import { compressBookPdf, pdfCompressor } from '../../src/services/book.service.js';

const dbUp = await isDatabaseReachable();

const COUNTING = {
  kind: 'COUNTING',
  items: [{ prompt: { say: 'How many?' }, options: [{ text: '1' }, { text: '2' }], answer: 0 }],
};

/** The smallest thing that sniffs as a PDF. */
function pdfBytes(label: string): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n`);
}

describe.skipIf(!dbUp)('books to read and films to watch', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let otherSchool: TestSchool;
  let publisher: Session;
  let parent: Session;
  let filmedBookId: string;
  let filmedChapterId: string;
  let openBookId: string;
  let openChapterId: string;
  let filmedActivityId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    otherSchool = await seedSchool(baseline, 'beta', 'Beta Preschool');
    publisher = await login(baseline.superAdminEmail);
    // Whatever an upload starts in the background does nothing here; the tests
    // below hand compressBookPdf a stand-in of their own.
    pdfCompressor.compress = async () => null;
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
      .send({ code: 'NUR_EVS', name: 'EVS Book', classLevelId: nursery.id });
    filmedBookId = withFilm.body.id as string;

    const filmed = await api
      .post(`${BASE}/publication/books/${filmedBookId}/chapters`)
      .set(auth(publisher))
      .send({ name: 'Leaves', animationUrl: 'https://youtu.be/dQw4w9WgXcQ?t=5' });
    filmedChapterId = filmed.body.id as string;
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

    // Alpha bought both books; Beta bought neither.
    await api
      .put(`${BASE}/publication/schools/${school.id}/books`)
      .set(auth(publisher))
      .send({
        books: [
          { bookId: filmedBookId, enabled: true },
          { bookId: openBookId, enabled: true },
        ],
      });

    for (const [code, bookId, chapterId] of [
      ['COUNT_LEAVES', filmedBookId, filmedChapterId],
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
      if (bookId === filmedBookId) filmedActivityId = activity.body.id as string;
    }
  });

  afterAll(async () => {
    await backgroundSettled();
    await disconnectPrisma();
  });

  describe('films', () => {
    it('refuses a link that is not a YouTube video', async () => {
      const bad = await api
        .post(`${BASE}/publication/books/${filmedBookId}/chapters`)
        .set(auth(publisher))
        .send({ name: 'Broken', animationUrl: 'https://vimeo.com/12345678' });

      // A film that will not play would only be found out by a child sitting
      // in front of it.
      expect(bad.status).toBe(400);
    });

    it('lists a subject’s videos book by book, only books that have one', async () => {
      const films = await api
        .get(`${BASE}/catalogue/children/${school.studentId}/films`)
        .query({ subjectId: 'none' })
        .set(auth(parent));

      expect(films.status).toBe(200);
      expect(films.body.map((book: { id: string }) => book.id)).toEqual([filmedBookId]);
      const [leaves] = films.body[0].films;
      expect(leaves.id).toBe(filmedChapterId);
      expect(leaves.animation.videoId).toBe('dQw4w9WgXcQ');
      expect(leaves.isWatched).toBe(false);
    });

    it('locks nothing: a filmed chapter’s pages are open before the film', async () => {
      const shelf = await api
        .get(`${BASE}/catalogue/children/${school.studentId}/books`)
        .set(auth(parent));
      const filmedBook = shelf.body.find((b: { id: string }) => b.id === filmedBookId);
      // Still counted, for the badge; no longer a lock.
      expect(filmedBook.filmsToWatch).toBe(1);
      expect(filmedBook.isUnlocked).toBe(true);

      const chapters = await api
        .get(`${BASE}/catalogue/children/${school.studentId}/books/${filmedBookId}/chapters`)
        .set(auth(parent));
      expect(chapters.body[0].isUnlocked).toBe(true);

      const offered = await api
        .get(`${BASE}/progress/activities`)
        .query({ studentId: school.studentId })
        .set(auth(parent));
      const page = offered.body.find((a: { id: string }) => a.id === filmedActivityId);
      expect(page.isLocked).toBe(false);
    });

    it('ticks the video once watched, and records the watch only once', async () => {
      for (let i = 0; i < 2; i++) {
        const watched = await api
          .post(`${BASE}/catalogue/chapters/${filmedChapterId}/watched`)
          .set(auth(parent))
          .send({ studentId: school.studentId });
        expect(watched.status).toBe(200);
      }

      // Watched is watched. A child replaying it has not watched it twice, and
      // a flaky connection retrying must not write a second row.
      const rows = await prismaUnscoped.chapterAnimationView.count({
        where: { studentId: school.studentId, chapterId: filmedChapterId },
      });
      expect(rows).toBe(1);

      const films = await api
        .get(`${BASE}/catalogue/children/${school.studentId}/films`)
        .set(auth(parent));
      expect(films.body[0].films[0].isWatched).toBe(true);
    });

    it('will not record a watch for somebody else’s child', async () => {
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
        .post(`${BASE}/catalogue/chapters/${filmedChapterId}/watched`)
        .set(auth(parent))
        .send({ studentId: other.id });

      // Same school, same book — every filter passes except the guardian link.
      expect(response.status).toBe(404);
    });
  });

  describe('a book’s PDF', () => {
    let firstVersion: string;

    it('is a PDF or nothing', async () => {
      const picture = await api
        .post(`${BASE}/publication/books/${openBookId}/pdf`)
        .set(auth(publisher))
        .attach('file', Buffer.from('\x89PNG\r\n\x1a\n not a book'), 'cover.pdf');

      // Judged by the bytes, not by the name it was given.
      expect(picture.status).toBe(400);
    });

    it('is uploaded by the publisher and appears on the child’s shelf', async () => {
      const uploaded = await api
        .post(`${BASE}/publication/books/${openBookId}/pdf`)
        .set(auth(publisher))
        .attach('file', pdfBytes('first'), 'English Book.pdf');

      expect(uploaded.status).toBe(200);
      expect(uploaded.body.pdf.fileName).toBe('English Book.pdf');

      const shelf = await api
        .get(`${BASE}/catalogue/children/${school.studentId}/books`)
        .set(auth(parent));
      const book = shelf.body.find((b: { id: string }) => b.id === openBookId);
      expect(book.pdf.url).toBe(
        `/api/v1/catalogue/children/${school.studentId}/books/${openBookId}/pdf`,
      );
      expect(book.pdf.sizeBytes).toBe(pdfBytes('first').length);
      firstVersion = book.pdf.version as string;

      // A book with nothing uploaded says so, rather than offering a broken link.
      expect(shelf.body.find((b: { id: string }) => b.id === filmedBookId).pdf).toBeNull();
    });

    it('is read by a child whose school has the book', async () => {
      const pdf = await api
        .get(`${BASE}/catalogue/children/${school.studentId}/books/${openBookId}/pdf`)
        .set(auth(parent));

      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.headers.etag).toBe(`"${firstVersion}"`);
    });

    it('is not served to a school that did not buy the book', async () => {
      const outsider = await login(otherSchool.parentPhone);
      const pdf = await api
        .get(`${BASE}/catalogue/children/${otherSchool.studentId}/books/${openBookId}/pdf`)
        .set(auth(outsider));

      expect(pdf.status).toBe(404);
    });

    it('is not served as catalogue artwork, whoever knows its id', async () => {
      const asset = await api.get(`${BASE}/catalogue/assets/${firstVersion}`).set(auth(parent));

      // That route answers any signed-in user, and the book is what a school
      // pays for.
      expect(asset.status).toBe(404);
    });

    it('gets a new version when replaced, and the old file goes', async () => {
      await api
        .post(`${BASE}/publication/books/${openBookId}/pdf`)
        .set(auth(publisher))
        .attach('file', pdfBytes('second edition'), 'English Book v2.pdf');

      const shelf = await api
        .get(`${BASE}/catalogue/children/${school.studentId}/books`)
        .set(auth(parent));
      const book = shelf.body.find((b: { id: string }) => b.id === openBookId);
      // A new version is what tells the app its offline copy is stale.
      expect(book.pdf.version).not.toBe(firstVersion);

      const old = await prismaUnscoped.fileObject.findUniqueOrThrow({
        where: { id: firstVersion },
        select: { deletedAt: true },
      });
      expect(old.deletedAt).not.toBeNull();
    });

    it('can be taken off again', async () => {
      const removed = await api
        .delete(`${BASE}/publication/books/${openBookId}/pdf`)
        .set(auth(publisher));
      expect(removed.status).toBe(200);
      expect(removed.body.pdf).toBeNull();

      const pdf = await api
        .get(`${BASE}/catalogue/children/${school.studentId}/books/${openBookId}/pdf`)
        .set(auth(parent));
      expect(pdf.status).toBe(404);
    });

    it('is the publisher’s to upload, not a parent’s', async () => {
      const response = await api
        .post(`${BASE}/publication/books/${openBookId}/pdf`)
        .set(auth(parent))
        .attach('file', pdfBytes('not yours'), 'mine.pdf');

      expect(response.status).toBe(403);
    });
  });
  describe('a subject’s picture', () => {
    it('is shown on the child’s subject in place of its icon, and can be taken off', async () => {
      // One white pixel: the smallest thing that is a real picture.
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64',
      );
      const asset = await api
        .post(`${BASE}/publication/assets`)
        .set(auth(publisher))
        .attach('file', png, 'evs.png');
      expect(asset.status).toBe(201);
      const pictureUrl = `/api/v1/catalogue/assets/${asset.body.id}`;

      const subject = await api
        .post(`${BASE}/publication/book-subjects`)
        .set(auth(publisher))
        .send({ name: 'EVS', icon: 'globe', pictureFileId: asset.body.id });
      expect(subject.status).toBe(201);
      expect(subject.body.pictureUrl).toBe(pictureUrl);

      await api
        .patch(`${BASE}/publication/books/${filmedBookId}`)
        .set(auth(publisher))
        .send({ subjectId: subject.body.id });

      const shelf = await api
        .get(`${BASE}/catalogue/children/${school.studentId}/subjects`)
        .set(auth(parent));
      const evs = shelf.body.find((row: { id: string | null }) => row.id === subject.body.id);
      expect(evs.pictureUrl).toBe(pictureUrl);

      const cleared = await api
        .patch(`${BASE}/publication/book-subjects/${subject.body.id}`)
        .set(auth(publisher))
        .send({ pictureFileId: null });
      // Back to the icon it was given.
      expect(cleared.body.pictureUrl).toBeNull();
      expect(cleared.body.icon).toBe('globe');
    });
  });
  describe('making a book’s PDF smaller', () => {
    async function upload(label: string): Promise<string> {
      const response = await api
        .post(`${BASE}/publication/books/${openBookId}/pdf`)
        .set(auth(publisher))
        .attach('file', pdfBytes(label), 'English Book.pdf');
      expect(response.status).toBe(200);
      const book = await prismaUnscoped.book.findUniqueOrThrow({
        where: { id: openBookId },
        select: { pdfFileId: true },
      });
      return book.pdfFileId!;
    }

    it('swaps in the smaller copy, and says how big the book was', async () => {
      const big = 'a big book '.repeat(400);
      const fileId = await upload(big);

      expect(await compressBookPdf(openBookId, fileId, async () => pdfBytes('small'))).toBe(
        'replaced',
      );

      const list = await api.get(`${BASE}/publication/books`).set(auth(publisher));
      const book = list.body.find((row: { id: string }) => row.id === openBookId);
      expect(book.pdf.sizeBytes).toBe(pdfBytes('small').length);
      expect(book.pdf.originalSizeBytes).toBe(pdfBytes(big).length);

      // A new version, which is what makes phones fetch the smaller copy.
      const shelf = await api
        .get(`${BASE}/catalogue/children/${school.studentId}/books`)
        .set(auth(parent));
      const forChild = shelf.body.find((row: { id: string }) => row.id === openBookId);
      expect(forChild.pdf.version).not.toBe(fileId);
      expect(forChild.pdf.sizeBytes).toBe(pdfBytes('small').length);
    });

    it('keeps the book as uploaded when the copy is hardly smaller', async () => {
      const fileId = await upload('already lean');

      // The same bytes back: nothing gained, so nothing for phones to fetch.
      expect(await compressBookPdf(openBookId, fileId, async (path) => readFileSync(path))).toBe(
        'kept',
      );

      const book = await prismaUnscoped.book.findUniqueOrThrow({
        where: { id: openBookId },
        select: { pdfFileId: true, pdfOriginalSizeBytes: true },
      });
      expect(book.pdfFileId).toBe(fileId);
      expect(book.pdfOriginalSizeBytes).toBeNull();
    });

    it('never puts an older book back over a newer upload', async () => {
      const first = await upload('first edition '.repeat(100));
      const second = await upload('second edition');

      // The first upload's copy finishes after the second has arrived.
      expect(await compressBookPdf(openBookId, first, async () => pdfBytes('tiny'))).toBe(
        'superseded',
      );

      const book = await prismaUnscoped.book.findUniqueOrThrow({
        where: { id: openBookId },
        select: { pdfFileId: true },
      });
      expect(book.pdfFileId).toBe(second);
    });
  });

  describe('catalogue pictures', () => {
    it('are stored as a small WebP that looks the same', async () => {
      const png = await sharp({
        create: { width: 400, height: 300, channels: 4, background: '#3aa7e0' },
      })
        .composite([
          {
            input: Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><circle cx="200" cy="150" r="90" fill="#ffd23f"/></svg>',
            ),
          },
        ])
        .png()
        .toBuffer();

      const asset = await api
        .post(`${BASE}/publication/assets`)
        .set(auth(publisher))
        .attach('file', png, 'sun.png');

      expect(asset.status).toBe(201);
      expect(asset.body.mimeType).toBe('image/webp');
      expect(asset.body.originalName).toBe('sun.webp');
      expect(asset.body.sizeBytes).toBeLessThan(png.length);
    });
  });
});
