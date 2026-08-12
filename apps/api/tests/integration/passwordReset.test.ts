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
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

const NEW_PASSWORD = 'Chosen-by-me-2026';

describe.skipIf(!dbUp)('password reset', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let adminA: Session;
  let teacherA: Session;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    adminA = await login(schoolA.adminEmail);
    teacherA = await login(schoolA.teacherEmail);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('hands the office a temporary password and ends the family’s sessions', async () => {
    // The parent is signed in on a phone before any of this happens.
    const before = await login(schoolA.parentPhone);
    const parentId = await parentUserId(schoolA);

    const reset = await api
      .post(`${BASE}/parents/${parentId}/reset-password`)
      .set(auth(adminA));

    expect(reset.status).toBe(200);
    expect(reset.body.temporaryPassword).toMatch(/^[A-Z][a-z]+-[a-z]+-\d{4}$/);

    // The old session cannot be renewed. This is the point of a reset: it is
    // what an office does when a phone has been lost.
    const renew = await api
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: before.refreshToken });
    expect(renew.status).toBe(401);

    // The old password is gone, the temporary one works.
    const stale = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: schoolA.parentPhone, password: TEST_PASSWORD });
    expect(stale.status).toBe(401);

    const fresh = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: schoolA.parentPhone, password: reset.body.temporaryPassword });
    expect(fresh.status).toBe(200);
    expect(fresh.body.user.mustChangePassword).toBe(true);
  });

  it('refuses to let a temporary password be used for anything else', async () => {
    const parentId = await parentUserId(schoolA);
    const reset = await api.post(`${BASE}/parents/${parentId}/reset-password`).set(auth(adminA));

    const session = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: schoolA.parentPhone, password: reset.body.temporaryPassword });
    const token = session.body.accessToken as string;

    // Somebody at the desk may have heard it read out, so it is not a session.
    const children = await api
      .get(`${BASE}/me/children`)
      .set('authorization', `Bearer ${token}`);
    expect(children.status).toBe(403);
    expect(children.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // But the two screens they need still answer.
    const me = await api.get(`${BASE}/auth/me`).set('authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);

    const changed = await api
      .post(`${BASE}/auth/change-password`)
      .set('authorization', `Bearer ${token}`)
      .send({ currentPassword: reset.body.temporaryPassword, newPassword: NEW_PASSWORD });
    expect(changed.status).toBe(200);

    // Fresh tokens come back, or the reward for doing the right thing would be
    // the sign-in screen: the change revokes every session including this one.
    expect(changed.body.accessToken).toBeTruthy();
    const after = await api
      .get(`${BASE}/me/children`)
      .set('authorization', `Bearer ${changed.body.accessToken}`);
    expect(after.status).toBe(200);
  });

  it('will not reset somebody at another school', async () => {
    const parentId = await parentUserId(schoolB);

    const response = await api
      .post(`${BASE}/parents/${parentId}/reset-password`)
      .set(auth(adminA));

    // Missing, not forbidden — a 403 would confirm the account exists.
    expect(response.status).toBe(404);
  });

  it('will not let a teacher reset anyone', async () => {
    const parentId = await parentUserId(schoolA);

    const response = await api
      .post(`${BASE}/parents/${parentId}/reset-password`)
      .set(auth(teacherA));

    expect(response.status).toBe(403);
  });

  it('will not let an admin reset another admin, or themselves', async () => {
    const admin = await prismaUnscoped.user.findFirst({
      where: { schoolId: schoolA.id, role: 'SCHOOL_ADMIN' },
      select: { id: true },
    });

    // A school admin's own reset belongs to the publication, not to the school
    // — otherwise two admins could lock each other out in a disagreement.
    const other = await api
      .post(`${BASE}/teachers/${admin!.id}/reset-password`)
      .set(auth(adminA));
    expect([403, 404]).toContain(other.status);
  });

  it('records who did it', async () => {
    const parentId = await parentUserId(schoolA);
    await api.post(`${BASE}/parents/${parentId}/reset-password`).set(auth(adminA));

    const entry = await prismaUnscoped.auditLog.findFirst({
      where: { action: 'PASSWORD_RESET', entityId: parentId },
      orderBy: { createdAt: 'desc' },
    });

    // "Who set my password?" is asked months later, and the answer has to
    // survive the person who did it leaving.
    expect(entry).not.toBeNull();
    expect(entry!.actorUserId).toBe(adminA.userId);
  });
});

async function parentUserId(school: TestSchool): Promise<string> {
  const user = await prismaUnscoped.user.findFirst({
    where: { schoolId: school.id, role: 'PARENT' },
    select: { id: true },
  });
  return user!.id;
}
