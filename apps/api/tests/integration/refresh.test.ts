import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import { api, BASE, login, type Session } from '../helpers/api.js';
import { prismaUnscoped, disconnectPrisma } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

/**
 * Session rotation, and the difference between a race and a theft.
 *
 * Rotation detection revokes every session a user has, which is right for a
 * stolen token and ruinous for a browser that happened to refresh twice at
 * once. Production had twenty-three of these against eleven honest rotations:
 * the alarm was firing more often on ordinary use than it ever would on an
 * attacker, and it took the phone down with the browser each time.
 */
describe.skipIf(!dbUp)('refresh token rotation', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let session: Session;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    session = await login(schoolA.adminEmail);
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('rotates: the new token works and is not the old one', async () => {
    const response = await api
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: session.refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.refreshToken).not.toBe(session.refreshToken);

    session = {
      ...session,
      accessToken: response.body.accessToken,
      refreshToken: response.body.refreshToken,
    };
  });

  it('survives several requests refreshing at once', async () => {
    // Exactly what a page load does: one cookie, four requests in flight.
    const shared = session.refreshToken;

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        api.post(`${BASE}/auth/refresh`).send({ refreshToken: shared }),
      ),
    );

    // Every one of them gets a working session back. Before the grace window
    // the first won and the other three were treated as theft.
    for (const result of results) {
      expect(result.status).toBe(200);
      expect(result.body.accessToken).toBeTruthy();
    }

    const revokedForReuse = await prismaUnscoped.refreshToken.count({
      where: { userId: schoolA.adminId, revokedBy: 'REUSE_DETECTED' },
    });
    expect(revokedForReuse).toBe(0);

    session = {
      ...session,
      accessToken: results[0]!.body.accessToken,
      refreshToken: results[0]!.body.refreshToken,
    };
  });

  it('leaves a second device signed in', async () => {
    // The phone and the browser hold separate tokens. A race in one used to
    // revoke every session the user had, which signed the other out too.
    const phone = await login(schoolA.adminEmail);

    await Promise.all([
      api.post(`${BASE}/auth/refresh`).send({ refreshToken: session.refreshToken }),
      api.post(`${BASE}/auth/refresh`).send({ refreshToken: session.refreshToken }),
    ]);

    const stillWorks = await api
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: phone.refreshToken });

    expect(stillWorks.status).toBe(200);
  });

  it('still treats a genuinely old token as theft', async () => {
    const victim = await login(schoolA.teacherEmail);

    const rotated = await api
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: victim.refreshToken });
    expect(rotated.status).toBe(200);

    // Age the rotation past the grace window — what a replayed stolen token
    // looks like, rather than a browser refreshing twice in one breath.
    await prismaUnscoped.refreshToken.updateMany({
      where: { userId: victim.userId, revokedBy: 'ROTATED' },
      data: { revokedAt: new Date(Date.now() - 10 * 60_000) },
    });

    const replayed = await api
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: victim.refreshToken });

    expect(replayed.status).toBe(401);

    // And the alarm does what it is for: every session for that user ends.
    const live = await prismaUnscoped.refreshToken.count({
      where: { userId: victim.userId, revokedAt: null },
    });
    expect(live).toBe(0);
  });

  it('refuses a token that was revoked by signing out', async () => {
    const other = await login(schoolA.parentPhone);

    await api
      .post(`${BASE}/auth/logout`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({ refreshToken: other.refreshToken });

    const response = await api
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: other.refreshToken });

    // A signed-out token is never a race, whatever the timing.
    expect(response.status).toBe(401);
  });
});
