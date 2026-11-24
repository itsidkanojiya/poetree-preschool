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
import { schoolToday } from '../../src/lib/feeSchedule.js';
import { runBirthdayWishes } from '../../src/jobs/birthdayWishes.js';

const dbUp = await isDatabaseReachable();

/** 10:00 in India today: inside the hours a school sends anything. */
const morning = () => {
  const today = schoolToday(new Date());
  return new Date(`${today}T04:30:00Z`);
};

/**
 * A school that switches it on wishes each child a happy birthday — a message
 * to their parents in the morning, once a year, never at night.
 */
describe.skipIf(!dbUp)('birthday wishes', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let admin: Session;
  let parentUserId: string;

  const wishes = () =>
    prismaUnscoped.notification.findMany({
      where: { userId: parentUserId, type: 'BIRTHDAY_WISH' },
    });

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    admin = await login(school.adminEmail);
    parentUserId = (
      await prismaUnscoped.parentProfile.findUniqueOrThrow({
        where: { id: school.parentProfileId },
      })
    ).userId;

    const today = schoolToday(new Date());
    await prismaUnscoped.student.update({
      where: { id: school.studentId },
      data: { dateOfBirth: new Date(`2021-${today.slice(5)}T00:00:00Z`), firstName: 'Aarav' },
    });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('is off until the school switches it on', async () => {
    const profile = await api.get(`${BASE}/school/profile`).set(auth(admin)).expect(200);
    expect(profile.body.birthdayWishesEnabled).toBe(false);
    await runBirthdayWishes(morning());
    expect(await wishes()).toHaveLength(0);
  });

  it('wishes the child’s parents once the school switches it on', async () => {
    await api
      .patch(`${BASE}/school/profile`)
      .set(auth(admin))
      .send({ birthdayWishesEnabled: true })
      .expect(200);

    const run = await runBirthdayWishes(morning());
    expect(run.sent).toBe(1);
    const sent = await wishes();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.title).toMatch(/Happy birthday, Aarav/);
    expect(sent[0]!.body).toMatch(/Alpha Preschool/);
  });

  it('does not wish the same child twice in a year', async () => {
    await runBirthdayWishes(morning());
    await runBirthdayWishes(morning());
    expect(await wishes()).toHaveLength(1);
  });

  it('sends nothing at night', async () => {
    await prismaUnscoped.notification.deleteMany({ where: { type: 'BIRTHDAY_WISH' } });
    const today = schoolToday(new Date());
    // 23:30 in India, still the child's birthday.
    const run = await runBirthdayWishes(new Date(`${today}T18:00:00Z`));
    expect(run.sent).toBe(0);
  });
});
