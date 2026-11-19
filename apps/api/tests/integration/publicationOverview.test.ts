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
 * The publisher's overview names the schools that need action — expiring
 * within a month, suspended or expired — not only how many there are.
 */
describe.skipIf(!dbUp)('the publisher overview', () => {
  let baseline: Baseline;
  let expiring: TestSchool;
  let suspended: TestSchool;
  let publisher: Session;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    expiring = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    suspended = await seedSchool(baseline, 'beta', 'Beta Preschool');
    await seedSchool(baseline, 'gamma', 'Gamma Preschool');

    await prismaUnscoped.schoolSubscription.updateMany({
      where: { schoolId: expiring.id, isCurrent: true },
      data: { expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
    });
    await prismaUnscoped.school.update({
      where: { id: suspended.id },
      data: { status: 'SUSPENDED' },
    });

    publisher = await login(baseline.superAdminEmail);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('lists the schools that need attention, expiring first', async () => {
    const response = await api.get(`${BASE}/publication/overview`).set(auth(publisher));
    expect(response.status).toBe(200);
    expect(response.body.schools).toMatchObject({ total: 3, suspended: 1, expiringSoon: 1 });
    expect(response.body.attention).toEqual([
      expect.objectContaining({
        id: expiring.id,
        reason: 'EXPIRING',
        expiresAt: expect.any(String),
      }),
      expect.objectContaining({ id: suspended.id, reason: 'SUSPENDED', expiresAt: null }),
    ]);
  });

  it('is the publisher’s alone', async () => {
    const admin = await login(expiring.adminEmail);
    const response = await api.get(`${BASE}/publication/overview`).set(auth(admin));
    expect(response.status).toBe(403);
  });
});
