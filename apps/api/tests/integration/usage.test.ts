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

interface UsageBody {
  totals: { attempts: number; activeChildren: number; schoolsUsing: number };
  schools: Array<{ schoolId: string; activeChildren: number; attempts: number }>;
  activities: Array<{ code: string; attempts: number; schools: number; averageScore: number | null }>;
  neverPlayed: Array<{ code: string }>;
}

describe.skipIf(!dbUp)('what the publisher can see about usage', () => {
  let baseline: Baseline;
  let busy: TestSchool;
  let quiet: TestSchool;
  let publisher: Session;
  let played: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    busy = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    quiet = await seedSchool(baseline, 'beta', 'Beta Preschool');
    publisher = await login(baseline.superAdminEmail);

    const skill = await prismaUnscoped.skill.create({
      data: { code: 'NUMBER_SENSE', name: 'Number sense' },
    });

    const activity = await prismaUnscoped.learningActivity.create({
      data: { code: 'COUNT_1', title: 'Counting', type: 'COUNTING', skillId: skill.id },
    });
    played = activity.id;

    await prismaUnscoped.learningActivity.create({
      data: { code: 'NEVER_1', title: 'Nobody opened this', type: 'COUNTING', skillId: skill.id },
    });

    // The same child four times over. One child using the product, not four.
    for (let i = 0; i < 4; i += 1) {
      await prismaUnscoped.activityAttempt.create({
        data: {
          schoolId: busy.id,
          studentId: busy.studentId,
          activityId: activity.id,
          correctCount: 3,
          totalCount: 4,
        },
      });
    }
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('counts children rather than taps', async () => {
    const response = await api.get(`${BASE}/publication/usage`).set(auth(publisher));
    const body = response.body as UsageBody;

    expect(response.status).toBe(200);
    expect(body.totals.attempts).toBe(4);
    // The figure that decides whether a school is using this is how many
    // children opened it, not how many times the keenest one did.
    expect(body.totals.activeChildren).toBe(1);
    expect(body.totals.schoolsUsing).toBe(1);
  });

  it('shows a school with children and no use at all', async () => {
    const response = await api.get(`${BASE}/publication/usage`).set(auth(publisher));
    const body = response.body as UsageBody;

    const silent = body.schools.find((school) => school.schoolId === quiet.id);

    // This is the row worth a phone call, and it exists nowhere else in the
    // product — the overview would show this school as a healthy sale.
    expect(silent).toBeDefined();
    expect(silent!.attempts).toBe(0);
    expect(silent!.activeChildren).toBe(0);
  });

  it('names the activities nobody has ever opened', async () => {
    const response = await api.get(`${BASE}/publication/usage`).set(auth(publisher));
    const body = response.body as UsageBody;

    expect(body.neverPlayed.map((activity) => activity.code)).toContain('NEVER_1');
    expect(body.neverPlayed.map((activity) => activity.code)).not.toContain('COUNT_1');
  });

  it('leaves an unplayed activity without a score rather than a nought', async () => {
    const response = await api.get(`${BASE}/publication/usage`).set(auth(publisher));
    const body = response.body as UsageBody;

    const opened = body.activities.find((activity) => activity.code === 'COUNT_1');
    const untouched = body.activities.find((activity) => activity.code === 'NEVER_1');

    expect(opened!.averageScore).toBe(75);
    expect(opened!.schools).toBe(1);
    // 0% would read as an activity every child failed, which is a different
    // and much more alarming thing than one nobody tried.
    expect(untouched!.averageScore).toBeNull();
  });

  it('is the publisher’s alone', async () => {
    const admin = await login(busy.adminEmail);
    const response = await api.get(`${BASE}/publication/usage`).set(auth(admin));

    // It names every other school in the country by how little they use it.
    expect(response.status).toBe(403);
  });

  it('respects the window it was asked for', async () => {
    await prismaUnscoped.activityAttempt.updateMany({
      where: { activityId: played },
      data: { createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) },
    });

    const recent = await api
      .get(`${BASE}/publication/usage`)
      .query({ days: 30 })
      .set(auth(publisher));
    expect((recent.body as UsageBody).totals.attempts).toBe(0);

    const wider = await api
      .get(`${BASE}/publication/usage`)
      .query({ days: 365 })
      .set(auth(publisher));
    expect((wider.body as UsageBody).totals.attempts).toBe(4);

    // Still not "never played" — it landed once, however long ago.
    expect((recent.body as UsageBody).neverPlayed.map((a) => a.code)).not.toContain('COUNT_1');
  });
});
