import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@poetree/shared';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  TEST_PASSWORD,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login } from '../helpers/api.js';
import { disconnectPrisma } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

/**
 * One device per family, and per teacher.
 *
 * Signing in on a new phone signs the old one out — at once, not when its
 * access token happens to expire — and the old phone is told why. The office
 * roles are left alone: they work from more than one computer.
 */
describe.skipIf(!dbUp)('one device at a time', () => {
  let schoolA: TestSchool;

  beforeAll(async () => {
    await resetDatabase();
    const baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('signs the first phone out the moment a second one signs in', async () => {
    const first = await login(schoolA.parentPhone);
    expect((await api.get(`${BASE}/auth/me`).set(auth(first))).status).toBe(200);

    const second = await login(schoolA.parentPhone);

    // Its access token is refused now, not in four hours, and says why.
    const stale = await api.get(`${BASE}/me/children`).set(auth(first));
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe(ERROR_CODES.SESSION_REPLACED);

    // And it cannot get a new one.
    const renew = await api
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: first.refreshToken });
    expect(renew.status).toBe(401);
    expect(renew.body.error.code).toBe(ERROR_CODES.SESSION_REPLACED);

    // The old phone trying to refresh is not mistaken for a stolen token: the
    // new phone is still signed in.
    expect((await api.get(`${BASE}/me/children`).set(auth(second))).status).toBe(200);
  });

  it('keeps one sign-in alive across its own refreshes', async () => {
    const phone = await login(schoolA.parentPhone);

    const renewed = await api
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: phone.refreshToken });
    expect(renewed.status).toBe(200);

    const again = await api
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: renewed.body.refreshToken });
    expect(again.status).toBe(200);

    const response = await api
      .get(`${BASE}/me/children`)
      .set({ Authorization: `Bearer ${again.body.accessToken}` });
    expect(response.status).toBe(200);
  });

  it('holds a teacher to one device too', async () => {
    const first = await login(schoolA.teacherEmail);
    await login(schoolA.teacherEmail);

    const stale = await api.get(`${BASE}/auth/me`).set(auth(first));
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe(ERROR_CODES.SESSION_REPLACED);
  });

  it('leaves the office signed in on as many computers as it uses', async () => {
    const desk = await login(schoolA.adminEmail);
    const laptop = await login(schoolA.adminEmail);

    expect((await api.get(`${BASE}/students`).set(auth(desk))).status).toBe(200);
    expect((await api.get(`${BASE}/students`).set(auth(laptop))).status).toBe(200);

    const renew = await api
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: desk.refreshToken });
    expect(renew.status).toBe(200);
  });

  it('keeps a parent signed in after changing their own password', async () => {
    const phone = await login(schoolA.parentPhone);

    const changed = await api
      .post(`${BASE}/auth/change-password`)
      .set(auth(phone))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Sunflower@42' });
    expect(changed.status).toBe(200);

    // The pair handed back is the one current session.
    const response = await api
      .get(`${BASE}/me/children`)
      .set({ Authorization: `Bearer ${changed.body.accessToken}` });
    expect(response.status).toBe(200);
  });
});
