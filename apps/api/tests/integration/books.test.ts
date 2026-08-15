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

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.enabled)).toBe(true);
  });
});
