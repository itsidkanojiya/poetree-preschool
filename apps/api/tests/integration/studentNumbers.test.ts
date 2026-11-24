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
 * A child's numbers: the admission number — issued by the school's series, or
 * typed by the office, as the school chooses — and the GR number from the
 * school's General Register, always typed.
 */
describe.skipIf(!dbUp)('admission and GR numbers', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let admin: Session;

  let serial = 0;
  const child = (extra: Record<string, unknown> = {}) => {
    serial += 1;
    return api
      .post(`${BASE}/students`)
      .set(auth(admin))
      .send({
        firstName: `Numbered${serial}`,
        lastName: 'Child',
        dateOfBirth: '2021-05-05',
        gender: 'FEMALE',
        guardians: [{ parentProfileId: school.parentProfileId, isPrimary: true }],
        ...extra,
      });
  };

  const mode = (admissionNoMode: 'AUTO' | 'MANUAL') =>
    api.patch(`${BASE}/school/profile`).set(auth(admin)).send({ admissionNoMode }).expect(200);

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    admin = await login(school.adminEmail);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  describe('automatic admission numbers', () => {
    it('is the default, and says which number comes next', async () => {
      const profile = await api.get(`${BASE}/school/profile`).set(auth(admin)).expect(200);
      expect(profile.body.admissionNoMode).toBe('AUTO');

      const next = await api.get(`${BASE}/students/next-admission-no`).set(auth(admin)).expect(200);
      expect(next.body.next).toMatch(/^ADM-\d{4}$/);
    });

    it('issues the next number when the office leaves it blank', async () => {
      const next = (await api.get(`${BASE}/students/next-admission-no`).set(auth(admin))).body.next;
      const created = await child().expect(201);
      expect(created.body.admissionNo).toBe(next);
    });

    it('still takes a number the office types', async () => {
      const created = await child({ admissionNo: 'TR-77' }).expect(201);
      expect(created.body.admissionNo).toBe('TR-77');
    });

    it('skips a number the office already typed by hand', async () => {
      const next = (await api.get(`${BASE}/students/next-admission-no`).set(auth(admin))).body
        .next as string;
      await child({ admissionNo: next }).expect(201);
      const issued = await child().expect(201);
      expect(issued.body.admissionNo).not.toBe(next);
    });
  });

  describe('manual admission numbers', () => {
    beforeAll(async () => {
      await mode('MANUAL');
    });

    afterAll(async () => {
      await mode('AUTO');
    });

    it('needs the office to type one', async () => {
      const refused = await child().expect(400);
      expect(refused.body.error.message).toMatch(/admission number/i);
      await child({ admissionNo: 'M-001' }).expect(201);
    });

    it('refuses one already used, naming the child', async () => {
      const refused = await child({ admissionNo: 'M-001' }).expect(409);
      expect(refused.body.error.message).toMatch(/M-001/);
    });
  });

  describe('GR numbers', () => {
    let grChild: string;

    it('is kept with the child, and shown on their record', async () => {
      const created = await child({ grNo: 'GR-1234' }).expect(201);
      grChild = created.body.id;
      const detail = await api.get(`${BASE}/students/${grChild}`).set(auth(admin)).expect(200);
      expect(detail.body.grNo).toBe('GR-1234');
    });

    it('is unique in the school, and says whose it is', async () => {
      const refused = await child({ grNo: 'GR-1234' }).expect(409);
      expect(refused.body.error.message).toMatch(/GR-1234/);
      expect(refused.body.error.message).toMatch(/Numbered/);
    });

    it('can be changed or cleared from the child’s record', async () => {
      await api
        .patch(`${BASE}/students/${grChild}`)
        .set(auth(admin))
        .send({ grNo: 'GR-9' })
        .expect(200);
      expect(
        (await prismaUnscoped.student.findUniqueOrThrow({ where: { id: grChild } })).grNo,
      ).toBe('GR-9');
      await api
        .patch(`${BASE}/students/${grChild}`)
        .set(auth(admin))
        .send({ grNo: null })
        .expect(200);
      expect(
        (await prismaUnscoped.student.findUniqueOrThrow({ where: { id: grChild } })).grNo,
      ).toBeNull();
    });

    it('finds a child by GR number', async () => {
      await api
        .patch(`${BASE}/students/${grChild}`)
        .set(auth(admin))
        .send({ grNo: 'GR-5555' })
        .expect(200);
      const found = await api
        .get(`${BASE}/students`)
        .query({ search: 'GR-5555' })
        .set(auth(admin))
        .expect(200);
      expect(found.body.items.map((s: { id: string }) => s.id)).toEqual([grChild]);
    });
  });
});
