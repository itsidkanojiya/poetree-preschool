import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  TEST_PASSWORD,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { clearSchoolAccessCache } from '../../src/services/schoolAccess.service.js';
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe.skipIf(!dbUp)('how long a school may use it', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let publisher: Session;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    publisher = await login(baseline.superAdminEmail);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('sets a date and leaves everyone working', async () => {
    const saved = await api
      .put(`${BASE}/publication/schools/${school.id}/validity`)
      .set(auth(publisher))
      .send({ validUntil: inDays(30) });

    expect(saved.status).toBe(200);
    expect(saved.body.validUntil).not.toBeNull();

    const teacher = await login(school.teacherEmail);
    const working = await api.get(`${BASE}/me/classrooms`).set(auth(teacher));
    expect(working.status).toBe(200);
  });

  it('locks the school out the moment the date has passed', async () => {
    await api
      .put(`${BASE}/publication/schools/${school.id}/validity`)
      .set(auth(publisher))
      .send({ validUntil: inDays(-1) });

    clearSchoolAccessCache();

    // Not a scheduled job: the school is expired because somebody tried to use
    // it after the date, which needs nothing running at midnight to be right.
    const signIn = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: school.teacherEmail, password: TEST_PASSWORD });

    expect(signIn.status).toBe(403);
    expect(signIn.body.error.code).toBe('SCHOOL_SUSPENDED');

    const stored = await prismaUnscoped.school.findUniqueOrThrow({
      where: { id: school.id },
      select: { status: true },
    });
    expect(stored.status).toBe('EXPIRED');
  });

  it('lets them straight back in when the date is extended', async () => {
    // The thing that would otherwise catch somebody out: renewing without
    // knowing you also have to press reactivate leaves every teacher shut out.
    const renewed = await api
      .put(`${BASE}/publication/schools/${school.id}/validity`)
      .set(auth(publisher))
      .send({ validUntil: inDays(365) });

    expect(renewed.body.status).toBe('ACTIVE');

    clearSchoolAccessCache();
    const teacher = await login(school.teacherEmail);
    const working = await api.get(`${BASE}/me/classrooms`).set(auth(teacher));
    expect(working.status).toBe(200);
  });

  it('does not undo a suspension somebody made on purpose', async () => {
    await api
      .post(`${BASE}/publication/schools/${school.id}/suspend`)
      .set(auth(publisher))
      .send({ reason: 'Unpaid invoice' });

    await api
      .put(`${BASE}/publication/schools/${school.id}/validity`)
      .set(auth(publisher))
      .send({ validUntil: inDays(365) });

    const stored = await prismaUnscoped.school.findUniqueOrThrow({
      where: { id: school.id },
      select: { status: true },
    });

    // A suspension is a person's decision about a school. A date should not
    // quietly reverse it.
    expect(stored.status).toBe('SUSPENDED');
  });

  it('treats no date as no end date', async () => {
    await api
      .post(`${BASE}/publication/schools/${school.id}/reactivate`)
      .set(auth(publisher))
      .send({ expiresAt: inDays(30) });

    const cleared = await api
      .put(`${BASE}/publication/schools/${school.id}/validity`)
      .set(auth(publisher))
      .send({ validUntil: null });

    expect(cleared.body.validUntil).toBeNull();

    clearSchoolAccessCache();
    const teacher = await login(school.teacherEmail);
    expect((await api.get(`${BASE}/me/classrooms`).set(auth(teacher))).status).toBe(200);
  });

  it('is the publisher’s to set', async () => {
    const admin = await login(school.adminEmail);

    const response = await api
      .put(`${BASE}/publication/schools/${school.id}/validity`)
      .set(auth(admin))
      .send({ validUntil: inDays(3650) });

    // A school extending its own access is a school that never expires.
    expect(response.status).toBe(403);
  });
});
