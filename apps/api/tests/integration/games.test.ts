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
import { disconnectPrisma } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

/**
 * The games module: the publisher's switches, and a child's rounds. What
 * matters is that off means off for the app while nothing is lost, that a
 * switched-off game cannot be recorded, and that a family touches only their
 * own child.
 */
describe.skipIf(!dbUp)('games module', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let other: TestSchool;
  let superAdmin: Session;
  let parent: Session;
  let neighbour: Session;

  const home = (session = parent, student = school.studentId) =>
    api.get(`${BASE}/games`).query({ studentId: student }).set(auth(session));

  const play = (body: Record<string, unknown>, session = parent) =>
    api
      .post(`${BASE}/games/sessions`)
      .set(auth(session))
      .send({
        studentId: school.studentId,
        language: 'en',
        total: 10,
        correct: 8,
        wrong: 3,
        ...body,
      });

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    other = await seedSchool(baseline, 'beta', 'Beta Preschool');
    superAdmin = await login(baseline.superAdminEmail);
    parent = await login(school.parentPhone);
    neighbour = await login(other.parentPhone);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('starts every installation with the five games on', async () => {
    const res = await home();
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.games.map((g: { key: string }) => g.key)).toEqual([
      'letter_match',
      'find_letter',
      'complete_sequence',
      'count_choose',
      'listen_match',
    ]);
    expect(res.body.totals).toEqual({ played: 0, correct: 0, wrong: 0, stars: 0 });
  });

  it('keeps a child’s best round per game and language, and adds up the stars', async () => {
    expect((await play({ gameKey: 'letter_match', correct: 6 })).status).toBe(201);
    expect((await play({ gameKey: 'letter_match', correct: 8 })).status).toBe(201);
    const res = await play({ gameKey: 'find_letter', language: 'gu', correct: 10, wrong: 0 });
    expect(res.status).toBe(201);

    expect(res.body.progress.en.letter_match).toEqual({ played: 2, bestCorrect: 8, bestTotal: 10 });
    expect(res.body.progress.gu.find_letter.bestCorrect).toBe(10);
    expect(res.body.progress.hi).toBeUndefined();
    expect(res.body.totals).toEqual({ played: 3, correct: 24, wrong: 6, stars: 24 });
  });

  it('refuses a round with more right answers than questions, or an unknown game', async () => {
    expect((await play({ gameKey: 'letter_match', correct: 11 })).status).toBe(400);
    expect((await play({ gameKey: 'chess' })).status).toBe(400);
  });

  it('keeps another family away from this child', async () => {
    expect((await home(neighbour)).status).toBe(404);
    expect((await play({ gameKey: 'letter_match' }, neighbour)).status).toBe(404);
  });

  it('lets the publisher switch one game off, and not a parent', async () => {
    const refused = await api
      .patch(`${BASE}/publication/games/count_choose`)
      .set(auth(parent))
      .send({ isActive: false });
    expect(refused.status).toBe(403);

    const off = await api
      .patch(`${BASE}/publication/games/count_choose`)
      .set(auth(superAdmin))
      .send({ isActive: false });
    expect(off.status).toBe(200);

    const keys = (await home()).body.games.map((g: { key: string }) => g.key);
    expect(keys).not.toContain('count_choose');
    expect((await play({ gameKey: 'count_choose' })).status).toBe(404);

    await api
      .patch(`${BASE}/publication/games/count_choose`)
      .set(auth(superAdmin))
      .send({ isActive: true });
  });

  it('switches the whole module off for the app, and back on with nothing lost', async () => {
    const off = await api
      .put(`${BASE}/publication/games/settings`)
      .set(auth(superAdmin))
      .send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.enabled).toBe(false);

    const hidden = await home();
    expect(hidden.body.enabled).toBe(false);
    expect(hidden.body.games).toEqual([]);
    expect((await play({ gameKey: 'letter_match' })).status).toBe(404);

    await api
      .put(`${BASE}/publication/games/settings`)
      .set(auth(superAdmin))
      .send({ enabled: true });
    const back = await home();
    expect(back.body.totals.played).toBe(3);
  });
});
