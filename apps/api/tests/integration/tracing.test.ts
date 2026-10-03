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
 * The tracing module: the publisher's catalogue and switch, and a child
 * watching then tracing. What matters is that the video comes first, that a
 * family touches only their own child, and that off means off for the app
 * while nothing is lost.
 */
describe.skipIf(!dbUp)('tracing module', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let other: TestSchool;
  let superAdmin: Session;
  let parent: Session;
  let neighbour: Session;
  let capitalId: string;
  let itemA: { id: string };
  let itemB: { id: string };

  const home = (student = school.studentId, session = parent) =>
    api.get(`${BASE}/tracing`).query({ studentId: student }).set(auth(session));

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

  it('starts every installation with capitals, numbers and small letters', async () => {
    const res = await home();
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.categories.map((c: { key: string }) => c.key)).toEqual([
      'capital',
      'number',
      'small',
    ]);
    const counts = Object.fromEntries(
      res.body.categories.map((c: { key: string; itemCount: number }) => [c.key, c.itemCount]),
    );
    expect(counts).toEqual({ capital: 26, number: 10, small: 26 });
    capitalId = res.body.categories[0].id;
  });

  it('keeps the other scripts ready but off until the publisher switches them on', async () => {
    const catalogue = await api.get(`${BASE}/publication/tracing`).set(auth(superAdmin));
    expect(catalogue.status).toBe(200);
    const hindi = catalogue.body.categories.find((c: { key: string }) => c.key === 'hindi');
    expect(hindi.isActive).toBe(false);
    expect(hindi.items.length).toBeGreaterThan(30);
  });

  it('gives each letter its shape from the stroke table, in order', async () => {
    const res = await api
      .get(`${BASE}/tracing/categories/${capitalId}`)
      .query({ studentId: school.studentId })
      .set(auth(parent));
    expect(res.status).toBe(200);
    expect(res.body.items[0].glyph).toBe('A');
    expect(res.body.items[25].glyph).toBe('Z');
    expect(res.body.items[0].strokes.length).toBeGreaterThan(0);
    expect(res.body.items[0].say).toContain('capital letter A');
    expect(res.body.items[0].video).toBeNull();
    itemA = res.body.items[0];
    itemB = res.body.items[1];
  });

  it('lets the publisher give a letter its video, and refuses a link that is not one', async () => {
    const bad = await api
      .patch(`${BASE}/publication/tracing/items/${itemA.id}`)
      .set(auth(superAdmin))
      .send({ videoUrl: 'https://example.com/a.mp4' });
    expect(bad.status).toBe(400);

    const good = await api
      .patch(`${BASE}/publication/tracing/items/${itemA.id}`)
      .set(auth(superAdmin))
      .send({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(good.status).toBe(200);
    expect(good.body.videoId).toBe('dQw4w9WgXcQ');

    const refused = await api
      .patch(`${BASE}/publication/tracing/items/${itemA.id}`)
      .set(auth(parent))
      .send({ videoUrl: '' });
    expect(refused.status).toBe(403);
  });

  it('will not count a letter traced before its video is watched', async () => {
    const early = await api
      .post(`${BASE}/tracing/items/${itemA.id}/traced`)
      .set(auth(parent))
      .send({ studentId: school.studentId });
    expect(early.status).toBe(409);

    const watched = await api
      .post(`${BASE}/tracing/items/${itemA.id}/watched`)
      .set(auth(parent))
      .send({ studentId: school.studentId });
    expect(watched.status).toBe(204);

    const traced = await api
      .post(`${BASE}/tracing/items/${itemA.id}/traced`)
      .set(auth(parent))
      .send({ studentId: school.studentId });
    expect(traced.status).toBe(200);

    // A letter with no video yet opens straight away.
    const noVideo = await api
      .post(`${BASE}/tracing/items/${itemB.id}/traced`)
      .set(auth(parent))
      .send({ studentId: school.studentId });
    expect(noVideo.status).toBe(200);

    const after = await home();
    const capital = after.body.categories.find((c: { key: string }) => c.key === 'capital');
    expect(capital.tracedCount).toBe(2);
  });

  it('keeps another family away from this child', async () => {
    const read = await home(school.studentId, neighbour);
    expect(read.status).toBe(404);

    const write = await api
      .post(`${BASE}/tracing/items/${itemB.id}/watched`)
      .set(auth(neighbour))
      .send({ studentId: school.studentId });
    expect(write.status).toBe(404);
  });

  it('hides a category the publisher switches off', async () => {
    const small = (await home()).body.categories.find((c: { key: string }) => c.key === 'small');
    const off = await api
      .patch(`${BASE}/publication/tracing/categories/${small.id}`)
      .set(auth(superAdmin))
      .send({ isActive: false });
    expect(off.status).toBe(204);

    const keys = (await home()).body.categories.map((c: { key: string }) => c.key);
    expect(keys).not.toContain('small');
  });

  it('switches the whole module off for the app, and back on with nothing lost', async () => {
    const off = await api
      .put(`${BASE}/publication/tracing/settings`)
      .set(auth(superAdmin))
      .send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.enabled).toBe(false);

    const hidden = await home();
    expect(hidden.body).toEqual({ enabled: false, categories: [] });

    const closed = await api
      .get(`${BASE}/tracing/categories/${capitalId}`)
      .query({ studentId: school.studentId })
      .set(auth(parent));
    expect(closed.status).toBe(404);

    await api
      .put(`${BASE}/publication/tracing/settings`)
      .set(auth(superAdmin))
      .send({ enabled: true });

    const back = await home();
    const capital = back.body.categories.find((c: { key: string }) => c.key === 'capital');
    expect(capital.tracedCount).toBe(2);
  });

  it('adds only letters the stroke table can draw', async () => {
    const unknown = await api
      .post(`${BASE}/publication/tracing/categories/${capitalId}/items`)
      .set(auth(superAdmin))
      .send({ glyph: '☺' });
    expect(unknown.status).toBe(400);

    const duplicate = await api
      .post(`${BASE}/publication/tracing/categories/${capitalId}/items`)
      .set(auth(superAdmin))
      .send({ glyph: 'A' });
    expect(duplicate.status).toBe(409);

    const zero = await api
      .post(`${BASE}/publication/tracing/categories/${capitalId}/items`)
      .set(auth(superAdmin))
      .send({ glyph: '0' });
    expect(zero.status).toBe(201);
  });
});
