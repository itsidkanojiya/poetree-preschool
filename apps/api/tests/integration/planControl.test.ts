import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@poetree/shared';
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
import { prismaUnscoped, disconnectPrisma } from '../../src/db/prisma.js';
import { clearSchoolAccessCache } from '../../src/services/schoolAccess.service.js';

const dbUp = await isDatabaseReachable();

/**
 * Plan control: when the Super Admin switches a school's plan off, every user of
 * that school stops working — and no other school is touched.
 */
describe.skipIf(!dbUp)('plan control and cascade blocking', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let adminA: Session;
  let adminB: Session;
  let superAdmin: Session;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    adminA = await login(schoolA.adminEmail);
    adminB = await login(schoolB.adminEmail);
    superAdmin = await login(baseline.superAdminEmail);
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('reports the blast radius before suspending', async () => {
    const response = await api
      .get(`${BASE}/publication/schools/${schoolA.id}/suspension-impact`)
      .set(auth(superAdmin));

    expect(response.status).toBe(200);
    // admin + teacher + parent
    expect(response.body.users).toBe(3);
    expect(response.body.activeSessions).toBeGreaterThanOrEqual(1);
  });

  it('suspends the school and revokes every live session', async () => {
    const response = await api
      .post(`${BASE}/publication/schools/${schoolA.id}/suspend`)
      .set(auth(superAdmin))
      .send({ reason: 'Non-payment of subscription' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('SUSPENDED');
    expect(response.body.revokedSessions).toBeGreaterThanOrEqual(1);

    const live = await prismaUnscoped.refreshToken.count({
      where: { revokedAt: null, user: { schoolId: schoolA.id } },
    });
    expect(live).toBe(0);
  });

  it('blocks the suspended school’s admin on their very next request', async () => {
    const response = await api.get(`${BASE}/students`).set(auth(adminA));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.SCHOOL_SUSPENDED);
    expect(response.body.error.details.reason).toBe('Non-payment of subscription');
  });

  it('refuses a fresh sign-in for the suspended school', async () => {
    const response = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: schoolA.adminEmail, password: TEST_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.SCHOOL_SUSPENDED);
  });

  it('refuses to extend a suspended session by refreshing', async () => {
    const response = await api
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: adminA.refreshToken });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ERROR_CODES.INVALID_REFRESH_TOKEN);
  });

  it('leaves the other school completely unaffected', async () => {
    const request = await api.get(`${BASE}/students`).set(auth(adminB));
    expect(request.status).toBe(200);

    const signIn = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: schoolB.adminEmail, password: TEST_PASSWORD });
    expect(signIn.status).toBe(200);
  });

  it('still lets the Super Admin administer the suspended school', async () => {
    const read = await api
      .get(`${BASE}/publication/schools/${schoolA.id}`)
      .set(auth(superAdmin));
    expect(read.status).toBe(200);
    expect(read.body.status).toBe('SUSPENDED');

    const write = await api
      .patch(`${BASE}/publication/schools/${schoolA.id}`)
      .set(auth(superAdmin))
      .send({ city: 'Pune' });
    expect(write.status).toBe(200);
  });

  it('records the suspension in the audit log', async () => {
    const entry = await prismaUnscoped.auditLog.findFirst({
      where: { action: 'SCHOOL_SUSPENDED', schoolId: schoolA.id },
    });

    expect(entry).not.toBeNull();
    expect(entry?.actorUserId).toBe(superAdmin.userId);
    expect((entry?.metadata as { reason?: string } | null)?.reason).toBe(
      'Non-payment of subscription',
    );
  });

  it('restores access on reactivation', async () => {
    const reactivate = await api
      .post(`${BASE}/publication/schools/${schoolA.id}/reactivate`)
      .set(auth(superAdmin))
      .send({ note: 'Payment received' });

    expect(reactivate.status).toBe(200);
    expect(reactivate.body.status).toBe('ACTIVE');

    const session = await login(schoolA.adminEmail);
    const request = await api.get(`${BASE}/students`).set(auth(session));
    expect(request.status).toBe(200);

    const entry = await prismaUnscoped.auditLog.findFirst({
      where: { action: 'SCHOOL_REACTIVATED', schoolId: schoolA.id },
    });
    expect(entry).not.toBeNull();
  });

  it('blocks a school whose plan has quietly run out', async () => {
    await prismaUnscoped.schoolSubscription.updateMany({
      where: { schoolId: schoolB.id, isCurrent: true },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    clearSchoolAccessCache();

    const response = await api.get(`${BASE}/students`).set(auth(adminB));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.SCHOOL_SUSPENDED);

    // Lazy expiry should have written the new status through.
    const school = await prismaUnscoped.school.findUniqueOrThrow({ where: { id: schoolB.id } });
    expect(school.status).toBe('EXPIRED');
  });

  it('refuses to reactivate an expired plan without a new expiry date', async () => {
    const response = await api
      .post(`${BASE}/publication/schools/${schoolB.id}/reactivate`)
      .set(auth(superAdmin))
      .send({ note: 'Trying without a date' });

    expect(response.status).toBe(400);
  });

  it('reactivates an expired plan when given a new expiry date', async () => {
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const response = await api
      .post(`${BASE}/publication/schools/${schoolB.id}/reactivate`)
      .set(auth(superAdmin))
      .send({ expiresAt: expiresAt.toISOString() });

    expect(response.status).toBe(200);

    const session = await login(schoolB.adminEmail);
    const request = await api.get(`${BASE}/students`).set(auth(session));
    expect(request.status).toBe(200);
  });
});
