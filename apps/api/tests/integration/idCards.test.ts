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
import { ID_CARD_SIZES, type IdCardSize } from '@poetree/shared';

const dbUp = await isDatabaseReachable();

/**
 * The card a child wears on a lanyard.
 *
 * The artwork is not tested and cannot usefully be — only looking at it tells
 * you whether a name has been squeezed off the edge. What is tested is
 * everything that can be wrong without anybody noticing until eighty of them
 * have been printed: the page size the school asked for, a child with no
 * photograph, and whose child it is.
 */
describe.skipIf(!dbUp)('student ID cards', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let other: TestSchool;
  let admin: Session;
  let neighbour: Session;

  const isPdf = (body: Buffer) => body.subarray(0, 5).toString() === '%PDF-';

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    other = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);
    neighbour = await login(other.adminEmail);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('renders a card as a real PDF', async () => {
    const card = await api
      .get(`${BASE}/students/${school.studentId}/id-card`)
      .set(auth(admin))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(card.status).toBe(200);
    expect(card.headers['content-type']).toContain('application/pdf');
    expect(isPdf(card.body)).toBe(true);
  });

  it('is the size the school asked for, not A4', async () => {
    // The whole reason the setting exists. A card laid out on A4 is not a card,
    // and the page size is the one thing about the artwork a machine can check.
    // Derived from the same table the renderer reads, rather than typed out:
    // 85.6mm is 242.6pt, and writing 242 by hand is how a test ends up
    // asserting the author's arithmetic instead of the program's.
    const sizes: IdCardSize[] = ['CR80', 'LARGE', 'A6'];

    for (const size of sizes) {
      const { widthMm, heightMm } = ID_CARD_SIZES[size];
      const expectedWidthPt = (widthMm * 72) / 25.4;
      await prismaUnscoped.school.update({
        where: { id: school.id },
        data: { idCardSize: size as 'CR80' },
      });

      const card = await api
        .get(`${BASE}/students/${school.studentId}/id-card`)
        .set(auth(admin))
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });

      const mediaBox = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(
        card.body.toString('latin1'),
      );

      expect(mediaBox, `no MediaBox for ${size}`).not.toBeNull();
      expect(Number(mediaBox![1]), size).toBeCloseTo(expectedWidthPt, 1);
      expect(Number(mediaBox![2]), size).toBeCloseTo((heightMm * 72) / 25.4, 1);

      // A6 is the portrait one, and the only way to tell it from LARGE.
      if (size === 'A6') {
        expect(Number(mediaBox![2])).toBeGreaterThan(Number(mediaBox![1]));
      }
    }

    await prismaUnscoped.school.update({
      where: { id: school.id },
      data: { idCardSize: 'CR80' },
    });
  });

  it('still prints for a child with no photograph', async () => {
    // The seeded child has none, which is the ordinary case for a school that
    // has just started. Initials stand in; nothing throws.
    const student = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: school.studentId },
      select: { photoFileId: true },
    });
    expect(student.photoFileId).toBeNull();

    const card = await api
      .get(`${BASE}/students/${school.studentId}/id-card`)
      .set(auth(admin))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(card.status).toBe(200);
    expect(isPdf(card.body)).toBe(true);
  });

  it('prints a whole class in one file', async () => {
    const cards = await api
      .get(`${BASE}/classrooms/${school.classroomId}/id-cards`)
      .set(auth(admin))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(cards.status).toBe(200);
    expect(isPdf(cards.body)).toBe(true);
  });

  it('will not print another school’s child', async () => {
    // 404 rather than 403, like every other cross-tenant read.
    const refused = await api
      .get(`${BASE}/students/${school.studentId}/id-card`)
      .set(auth(neighbour));

    expect(refused.status).toBe(404);
  });

  it('gives a parent the same card as data, and obeys the school’s switches', async () => {
    await prismaUnscoped.student.update({
      where: { id: school.studentId },
      data: { bloodGroup: 'B+' },
    });

    const parent = await login(school.parentPhone);

    const shown = await api
      .get(`${BASE}/me/children/${school.studentId}/id-card`)
      .set(auth(parent));

    expect(shown.status).toBe(200);
    expect(shown.body.name).toBeTruthy();
    expect(shown.body.admissionNo).toBeTruthy();
    expect(shown.body.bloodGroup).toBe('B+');

    // Turned off in settings, gone from the phone too — or the screen would say
    // more than the card in the child's bag.
    await prismaUnscoped.school.update({
      where: { id: school.id },
      data: { idCardShowBloodGroup: false },
    });

    const hidden = await api
      .get(`${BASE}/me/children/${school.studentId}/id-card`)
      .set(auth(parent));

    expect(hidden.body.bloodGroup).toBeNull();
  });

  it('will not give a parent another family’s child', async () => {
    const parent = await login(school.parentPhone);

    const refused = await api
      .get(`${BASE}/me/children/${other.studentId}/id-card`)
      .set(auth(parent));

    expect([403, 404]).toContain(refused.status);
  });
});
