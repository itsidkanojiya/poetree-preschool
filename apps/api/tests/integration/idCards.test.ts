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

  it('is the size the school asked for, either way up, not A4', async () => {
    // The whole reason the setting exists. A card laid out on A4 is not a card,
    // and the page size is the one thing about the artwork a machine can check.
    // Derived from the same table the renderer reads, rather than typed out.
    const sizes: IdCardSize[] = ['CR80', 'LARGE', 'HALF_A5'];
    const pt = (millimetres: number) => (millimetres * 72) / 25.4;

    for (const size of sizes) {
      for (const orientation of ['HORIZONTAL', 'VERTICAL'] as const) {
        const { widthMm, heightMm } = ID_CARD_SIZES[size];
        const long = pt(Math.max(widthMm, heightMm));
        const short = pt(Math.min(widthMm, heightMm));
        await prismaUnscoped.school.update({
          where: { id: school.id },
          data: { idCardSize: size, idCardOrientation: orientation },
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
        const label = `${size} ${orientation}`;
        expect(mediaBox, `no MediaBox for ${label}`).not.toBeNull();
        const [width, height] = [Number(mediaBox![1]), Number(mediaBox![2])];
        // Vertical stands the same card upright: 54 x 85.6 for a standard one.
        expect(width, label).toBeCloseTo(orientation === 'VERTICAL' ? short : long, 1);
        expect(height, label).toBeCloseTo(orientation === 'VERTICAL' ? long : short, 1);
      }
    }

    await prismaUnscoped.school.update({
      where: { id: school.id },
      data: { idCardSize: 'CR80', idCardOrientation: 'HORIZONTAL' },
    });
  });

  it('prints every type at every size without failing', async () => {
    // The four types the school chooses between, at each size, with every
    // optional field on and long values: what a layout most often breaks on.
    await prismaUnscoped.student.update({
      where: { id: school.studentId },
      data: {
        grNo: 'GR-000123456',
        bloodGroup: 'AB+',
        addressLine1: 'Flat 1203, Sunshine Heights, Behind the Big Temple, Karve Nagar Road',
        city: 'Pune',
      },
    });
    for (const size of ['CR80', 'LARGE', 'HALF_A5'] as const) {
      for (const orientation of ['HORIZONTAL', 'VERTICAL'] as const) {
        for (const layout of ['CLASSIC', 'BANNER', 'FRONT_BACK'] as const) {
          await prismaUnscoped.school.update({
            where: { id: school.id },
            data: {
              idCardSize: size,
              idCardOrientation: orientation,
              idCardLayout: layout,
              idCardShowGrNo: true,
              idCardShowAdmissionNo: true,
              idCardShowBloodGroup: true,
            },
          });
          const card = await api
            .get(`${BASE}/students/${school.studentId}/id-card`)
            .set(auth(admin));
          expect(card.status, `${size} ${orientation} ${layout}`).toBe(200);
        }
      }
    }
    await prismaUnscoped.school.update({
      where: { id: school.id },
      data: {
        idCardSize: 'CR80',
        idCardOrientation: 'HORIZONTAL',
        idCardLayout: 'CLASSIC',
        idCardShowGrNo: false,
      },
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

  it('prints every layout, and a two-sided one as front then back', async () => {
    // Page count is the part of a layout a machine can check, and the part
    // that matters most: a class file that is one page off prints every child's
    // back on the next child's front.
    const pagesOf = (body: Buffer) =>
      body.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;

    const fetchPdf = (path: string) =>
      api
        .get(`${BASE}${path}`)
        .set(auth(admin))
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });

    const expectedSides = { CLASSIC: 1, BANNER: 1, FRONT_BACK: 2 } as const;

    for (const layout of ['CLASSIC', 'BANNER', 'FRONT_BACK'] as const) {
      await prismaUnscoped.school.update({
        where: { id: school.id },
        // Every switch on, so each layout has its fullest card to fit.
        data: {
          idCardLayout: layout,
          idCardShowAddress: true,
          idCardShowDateOfBirth: true,
        },
      });

      const card = await fetchPdf(`/students/${school.studentId}/id-card`);
      expect(card.status, layout).toBe(200);
      expect(isPdf(card.body), layout).toBe(true);
      expect(pagesOf(card.body), layout).toBe(expectedSides[layout]);

      const children = await prismaUnscoped.studentEnrolment.count({
        where: { classroomId: school.classroomId, status: 'ACTIVE' },
      });
      const cards = await fetchPdf(`/classrooms/${school.classroomId}/id-cards`);
      expect(pagesOf(cards.body), layout).toBe(children * expectedSides[layout]);
    }

    await prismaUnscoped.school.update({
      where: { id: school.id },
      data: { idCardLayout: 'CLASSIC', idCardShowAddress: false, idCardShowDateOfBirth: false },
    });
  });

  it('lets the office choose a layout, and refuses one that does not exist', async () => {
    const saved = await api.patch(`${BASE}/school/profile`).set(auth(admin)).send({
      idCardLayout: 'BANNER',
      idCardOrientation: 'VERTICAL',
      idCardShowGrNo: true,
      idCardShowAdmissionNo: false,
    });

    expect(saved.status).toBe(200);
    expect(saved.body.idCardLayout).toBe('BANNER');
    expect(saved.body.idCardOrientation).toBe('VERTICAL');
    expect(saved.body.idCardShowGrNo).toBe(true);
    expect(saved.body.idCardShowAdmissionNo).toBe(false);

    const refused = await api
      .patch(`${BASE}/school/profile`)
      .set(auth(admin))
      .send({ idCardLayout: 'HOLOGRAM' });
    expect(refused.status).toBe(400);

    await prismaUnscoped.school.update({
      where: { id: school.id },
      data: {
        idCardLayout: 'CLASSIC',
        idCardOrientation: 'HORIZONTAL',
        idCardShowGrNo: false,
        idCardShowAdmissionNo: true,
      },
    });
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
    expect(shown.body.layout).toBe('CLASSIC');
    expect(shown.body.orientation).toBe('HORIZONTAL');
    // On every card, whatever the old switches said: name, grade, address,
    // mobile, birth date and batch.
    expect(shown.body.dateOfBirth).toBeTruthy();
    expect(shown.body.batch).toBeTruthy();
    expect(shown.body.classroom).toBeTruthy();
    expect(shown.body.guardianPhone).toBeTruthy();
    // GR No. only when the school ticks it.
    expect(shown.body.grNo).toBeNull();
    await prismaUnscoped.school.update({
      where: { id: school.id },
      data: { idCardShowGrNo: true, idCardShowAdmissionNo: false },
    });
    const ticked = await api
      .get(`${BASE}/me/children/${school.studentId}/id-card`)
      .set(auth(parent));
    expect(ticked.body.grNo).toBe('GR-000123456');
    expect(ticked.body.admissionNo).toBeNull();
    await prismaUnscoped.school.update({
      where: { id: school.id },
      data: { idCardShowGrNo: false, idCardShowAdmissionNo: true },
    });

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
