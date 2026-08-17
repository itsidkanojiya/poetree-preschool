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

describe.skipIf(!dbUp)('books and who has them', () => {
  let baseline: Baseline;
  let bought: TestSchool;
  let didNot: TestSchool;
  let publisher: Session;
  let boughtTeacher: Session;
  let didNotTeacher: Session;
  let nurseryId: string;
  let evsId: string;
  let phonicsId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    bought = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    didNot = await seedSchool(baseline, 'beta', 'Beta Preschool');

    publisher = await login(baseline.superAdminEmail);
    boughtTeacher = await login(bought.teacherEmail);
    didNotTeacher = await login(didNot.teacherEmail);

    const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'NURSERY' },
      select: { id: true },
    });
    nurseryId = nursery.id;

    const evs = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'NUR_EVS', name: 'EVS Book', classLevelId: nurseryId });
    evsId = evs.body.id as string;

    const phonics = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'NUR_PHONICS', name: 'Phonics', classLevelId: nurseryId });
    phonicsId = phonics.body.id as string;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('gives a new book to nobody until it is sold', async () => {
    // The surprising half of the rule, and the one worth pinning: a book that
    // appeared by itself at a school which never bought it is a support call
    // about content they are not paying for.
    const forSchool = await api
      .get(`${BASE}/publication/schools/${bought.id}/books`)
      .set(auth(publisher));

    expect(forSchool.status).toBe(200);
    expect(forSchool.body).toHaveLength(2);
    expect(forSchool.body.every((row: { enabled: boolean }) => !row.enabled)).toBe(true);

    // And the school's own users see nothing yet.
    const mine = await api.get(`${BASE}/catalogue/books`).set(auth(boughtTeacher));
    expect(mine.body).toHaveLength(0);
  });

  it('says which books have nothing in them', async () => {
    const forSchool = await api
      .get(`${BASE}/publication/schools/${bought.id}/books`)
      .set(auth(publisher));

    // Switching on an empty book gives a family a shelf with nothing on it,
    // which reads as broken rather than as unsold.
    expect(forSchool.body.every((row: { hasContent: boolean }) => !row.hasContent)).toBe(true);
  });

  it('gives a school exactly what it bought and nothing else', async () => {
    await api
      .put(`${BASE}/publication/schools/${bought.id}/books`)
      .set(auth(publisher))
      .send({
        books: [
          { bookId: evsId, enabled: true },
          { bookId: phonicsId, enabled: false },
        ],
      });

    const mine = await api.get(`${BASE}/catalogue/books`).set(auth(boughtTeacher));

    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].name).toBe('EVS Book');
    expect(mine.body[0].classLevel.name).toBe('Nursery');
  });

  it('gives the school next door none of it', async () => {
    // Same publisher, same books, nothing bought. This is the test that would
    // fail first if entitlement were ever read from the wrong school.
    const theirs = await api.get(`${BASE}/catalogue/books`).set(auth(didNotTeacher));

    expect(theirs.status).toBe(200);
    expect(theirs.body).toHaveLength(0);
  });

  it('takes a book away again when it is switched off', async () => {
    await api
      .put(`${BASE}/publication/schools/${bought.id}/books`)
      .set(auth(publisher))
      .send({ books: [{ bookId: evsId, enabled: false }] });

    const mine = await api.get(`${BASE}/catalogue/books`).set(auth(boughtTeacher));
    expect(mine.body).toHaveLength(0);
  });

  it('keeps a school out of the catalogue and out of its own entitlement', async () => {
    const admin = await login(bought.adminEmail);

    // A school editing what it bought is a school selling to itself.
    const wrote = await api
      .post(`${BASE}/publication/books`)
      .set(auth(admin))
      .send({ code: 'OUR_OWN', name: 'Our own book', classLevelId: nurseryId });
    expect(wrote.status).toBe(403);

    const toggled = await api
      .put(`${BASE}/publication/schools/${bought.id}/books`)
      .set(auth(admin))
      .send({ books: [{ bookId: evsId, enabled: true }] });
    expect(toggled.status).toBe(403);
  });

  it('will not let two books share a code', async () => {
    const clash = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'NUR_EVS', name: 'EVS again', classLevelId: nurseryId });

    expect(clash.status).toBe(409);
  });

  it('carries a cover from the publisher all the way to a family', async () => {
    // The cover is the only thing a four-year-old can use to find their book,
    // so it has to survive the whole trip: publisher upload, the book row, and
    // out again on the child's shelf.
    const artwork = await api
      .post(`${BASE}/publication/assets`)
      .set(auth(publisher))
      .attach('file', TINY_PNG, 'evs-cover.png');
    expect(artwork.status).toBe(201);

    const patched = await api
      .patch(`${BASE}/publication/books/${evsId}`)
      .set(auth(publisher))
      .send({ coverFileId: artwork.body.id });
    expect(patched.status).toBe(200);
    expect(patched.body.coverUrl).toContain(artwork.body.id);

    // Switched back on, because the test above took it away.
    await api
      .put(`${BASE}/publication/schools/${bought.id}/books`)
      .set(auth(publisher))
      .send({ books: [{ bookId: evsId, enabled: true }] });

    const parent = await login(bought.parentPhone);
    const shelf = await api
      .get(`${BASE}/catalogue/children/${bought.studentId}/books`)
      .set(auth(parent));

    expect(shelf.status).toBe(200);
    const evs = shelf.body.find((row: { id: string }) => row.id === evsId);
    expect(evs.coverUrl).toContain(`/catalogue/assets/${artwork.body.id}`);
  });

  it('keeps another year’s workbook off a child’s shelf', async () => {
    // A school buys a book for the whole school, so entitlement alone would put
    // the Junior KG workbook on a Nursery child's shelf — work they have not
    // been taught, beside their own. The seeded child sits in Nursery.
    const juniorKg = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'JUNIOR_KG' },
      select: { id: true },
    });

    const older = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'JRKG_ENG', name: 'Junior KG English', classLevelId: juniorKg.id });

    await api
      .put(`${BASE}/publication/schools/${bought.id}/books`)
      .set(auth(publisher))
      .send({
        books: [
          { bookId: evsId, enabled: true },
          { bookId: older.body.id, enabled: true },
        ],
      });

    const parent = await login(bought.parentPhone);
    const shelf = await api
      .get(`${BASE}/catalogue/children/${bought.studentId}/books`)
      .set(auth(parent));

    expect(shelf.status).toBe(200);
    const names = shelf.body.map((row: { name: string }) => row.name);
    expect(names).toContain('EVS Book');
    expect(names).not.toContain('Junior KG English');
  });

  it('refuses a school’s own file as a book cover', async () => {
    // The mirror of the leak the catalogue asset route is careful about: a
    // school file is tenant-scoped, and hanging one off a book would serve one
    // school's bytes to every other school that bought it — through a route
    // that deliberately asks no questions about tenancy.
    const admin = await login(bought.adminEmail);
    const theirs = await api
      .post(`${BASE}/files`)
      .set(auth(admin))
      .attach('file', TINY_PNG, 'ours.png');
    expect(theirs.status).toBe(201);

    const rejected = await api
      .patch(`${BASE}/publication/books/${phonicsId}`)
      .set(auth(publisher))
      .send({ coverFileId: theirs.body.id });

    expect(rejected.status).toBe(400);

    const book = await prismaUnscoped.book.findUniqueOrThrow({
      where: { id: phonicsId },
      select: { coverFileId: true },
    });
    expect(book.coverFileId).toBeNull();
  });

  it('starts a brand new school with everything switched on', async () => {
    // The opposite default from a new book, and deliberately so: the Super
    // Admin has just sold them something, and an empty shelf on the first
    // morning is the worse first impression.
    //
    // Created through the API rather than the seed helper, because the helper
    // writes the row directly and would skip the very code being tested.
    const created = await api
      .post(`${BASE}/publication/schools`)
      .set(auth(publisher))
      .send({ name: 'Gamma Preschool', code: 'gamma' });
    expect(created.status).toBe(201);

    const rows = await prismaUnscoped.schoolBook.findMany({
      where: { schoolId: created.body.id },
      select: { enabled: true },
    });

    // Counted rather than written down: tests above add books of their own,
    // and the rule being pinned is "one row per book, all on", not "three".
    const catalogue = await prismaUnscoped.book.count({ where: { isActive: true } });
    expect(rows).toHaveLength(catalogue);
    expect(rows.every((row) => row.enabled)).toBe(true);
  });
  it('writes its own code when the form does not send one', async () => {
    // Nobody should have to invent NUR_GRAMMAR. Asked to name a book "Grammar"
    // under Nursery, that is what anybody would write, so the code writes
    // itself — and stays fixed afterwards, which is the point of having one.
    const created = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ name: 'Grammar', classLevelId: nurseryId });

    expect(created.status).toBe(201);
    expect(created.body.code).toBe('NURSERY_GRAMMAR');
  });

  it('gives two books of the same name under one standard different codes', async () => {
    // Not a mistake worth an error: the second one just gets a number.
    const first = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ name: 'Rhymes', classLevelId: nurseryId });
    const second = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ name: 'Rhymes', classLevelId: nurseryId });

    expect(first.body.code).toBe('NURSERY_RHYMES');
    expect(second.status).toBe(201);
    expect(second.body.code).toBe('NURSERY_RHYMES_2');
  });

  it('still takes a code that is given, for a catalogue being imported', async () => {
    const created = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'LEGACY_042', name: 'Imported', classLevelId: nurseryId });

    expect(created.body.code).toBe('LEGACY_042');
  });
});
