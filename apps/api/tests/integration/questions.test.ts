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

/** A real 1x1 PNG — a fabricated row has no bytes on disk and would 404. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe.skipIf(!dbUp)('questions with pictures', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let publisher: Session;
  let admin: Session;
  let parent: Session;
  let activityId: string;
  let bookId: string;
  let appleId: string;
  let ballId: string;
  let schoolFileId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');

    publisher = await login(baseline.superAdminEmail);
    admin = await login(school.adminEmail);
    parent = await login(school.parentPhone);

    const skill = await prismaUnscoped.skill.create({
      data: { code: 'LETTERS', name: 'Letter recognition' },
    });
    const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'NURSERY' },
      select: { id: true },
    });

    const book = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'NUR_ENG', name: 'English Book', classLevelId: nursery.id });
    bookId = book.body.id as string;

    await api
      .put(`${BASE}/publication/schools/${school.id}/books`)
      .set(auth(publisher))
      .send({ books: [{ bookId, enabled: true }] });

    const activity = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({
        code: 'CIRCLE_LETTER',
        title: 'Circle the correct letter',
        type: 'MATCHING',
        skillId: skill.id,
        bookId,
        classLevelId: nursery.id,
        content: {
          kind: 'MATCHING',
          items: [{ prompt: { say: 'Which is A?' }, options: [{ glyph: 'A' }, { glyph: 'B' }], answer: 0 }],
        },
      });
    activityId = activity.body.id as string;

    // Two pieces of catalogue artwork.
    const apple = await api
      .post(`${BASE}/publication/assets`)
      .set(auth(publisher))
      .attach('file', TINY_PNG, 'apple.png');
    appleId = apple.body.id as string;

    const ball = await api
      .post(`${BASE}/publication/assets`)
      .set(auth(publisher))
      .attach('file', TINY_PNG, 'ball.png');
    ballId = ball.body.id as string;

    // And one that belongs to the school, which must never reach the catalogue.
    const schoolFile = await api
      .post(`${BASE}/files`)
      .set(auth(admin))
      .attach('file', TINY_PNG, 'a-child.png');
    schoolFileId = schoolFile.body.id as string;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('adds a question with a picture on each option', async () => {
    const created = await api
      .post(`${BASE}/publication/activities/${activityId}/questions`)
      .set(auth(publisher))
      .send({
        say: 'Circle the apple',
        options: [
          { fileId: appleId, isCorrect: true },
          { fileId: ballId },
        ],
      });

    expect(created.status).toBe(201);
    expect(created.body.options).toHaveLength(2);
    expect(created.body.options[0].imageUrl).toBe(`/api/v1/catalogue/assets/${appleId}`);
    // Nothing wrong with it, so nothing to warn the author about.
    expect(created.body.problem).toBeNull();
  });

  it('says what is wrong rather than letting a child meet it', async () => {
    const noAnswer = await api
      .post(`${BASE}/publication/activities/${activityId}/questions`)
      .set(auth(publisher))
      .send({
        say: 'Circle the ball',
        options: [{ fileId: appleId }, { fileId: ballId }],
      });

    // A scored question with no right answer means a four-year-old taps every
    // square and is told each time that they were wrong.
    expect(noAnswer.status).toBe(201);
    expect(noAnswer.body.problem).toBe('Nothing is marked as the right answer');
  });

  it('refuses a school’s own file as catalogue artwork', async () => {
    // The picture of somebody's child must never end up inside content served
    // to every school that bought the book.
    const response = await api
      .post(`${BASE}/publication/activities/${activityId}/questions`)
      .set(auth(publisher))
      .send({
        say: 'Circle the child',
        options: [
          { fileId: schoolFileId, isCorrect: true },
          { fileId: ballId },
        ],
      });

    expect(response.status).toBe(400);
  });

  it('serves the picture to a signed-in family, and a school file never', async () => {
    const picture = await api.get(`${BASE}/catalogue/assets/${appleId}`).set(auth(parent));
    expect(picture.status).toBe(200);
    expect(picture.headers['content-type']).toContain('image/png');
    // Shared artwork, so it may sit in a cache — unlike anything school-owned.
    expect(picture.headers['cache-control']).toContain('public');

    // The mirror of the leak this route could otherwise become: a valid file
    // id belonging to a school gets nothing here, however legitimate it is.
    const leaked = await api.get(`${BASE}/catalogue/assets/${schoolFileId}`).set(auth(parent));
    expect(leaked.status).toBe(404);
  });

  it('gives the app the questions, composed, with only the sound ones', async () => {
    const offered = await api.get(`${BASE}/progress/activities`).set(auth(parent));

    const playable = offered.body.find((row: { id: string }) => row.id === activityId);
    expect(playable).toBeDefined();

    // Two questions were written; the one with no right answer is left out
    // rather than served broken.
    expect(playable.contentJson.items).toHaveLength(1);
    expect(playable.contentJson.items[0].options[0].imageUrl).toBe(
      `/api/v1/catalogue/assets/${appleId}`,
    );
    expect(playable.contentJson.items[0].answer).toBe(0);
  });

  it('hides the whole book from a school that did not buy it', async () => {
    await api
      .put(`${BASE}/publication/schools/${school.id}/books`)
      .set(auth(publisher))
      .send({ books: [{ bookId, enabled: false }] });

    const offered = await api.get(`${BASE}/progress/activities`).set(auth(parent));
    expect(offered.body.find((row: { id: string }) => row.id === activityId)).toBeUndefined();
  });

  it('takes a drawn path for a tracing question, and refuses one without', async () => {
    const skill = await prismaUnscoped.skill.findFirstOrThrow({ select: { id: true } });
    const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'NURSERY' },
      select: { id: true },
    });

    const tracing = await api
      .post(`${BASE}/publication/activities`)
      .set(auth(publisher))
      .send({
        code: 'TRACE_THE_A',
        title: 'Trace and write',
        type: 'TRACING',
        skillId: skill.id,
        bookId,
        classLevelId: nursery.id,
        content: {
          kind: 'TRACING',
          items: [
            { glyph: 'A', say: 'Trace the letter A', strokes: [[{ x: 0.5, y: 0.1 }, { x: 0.2, y: 0.9 }]] },
          ],
        },
      });

    const drawn = await api
      .post(`${BASE}/publication/activities/${tracing.body.id}/questions`)
      .set(auth(publisher))
      .send({
        say: 'Trace the letter A',
        promptGlyph: 'A',
        strokes: [
          [
            { x: 0.5, y: 0.1 },
            { x: 0.2, y: 0.9 },
          ],
          [
            { x: 0.5, y: 0.1 },
            { x: 0.8, y: 0.9 },
          ],
        ],
      });

    expect(drawn.status).toBe(201);
    expect(drawn.body.strokes).toHaveLength(2);
    expect(drawn.body.problem).toBeNull();

    // A letter with no path is a blank square a child is asked to trace.
    const undrawn = await api
      .post(`${BASE}/publication/activities/${tracing.body.id}/questions`)
      .set(auth(publisher))
      .send({ say: 'Trace the letter B', promptGlyph: 'B' });

    expect(undrawn.body.problem).toBe('No strokes to trace yet');
  });

  it('keeps a school out of the question editor', async () => {
    const listed = await api
      .get(`${BASE}/publication/activities/${activityId}/questions`)
      .set(auth(admin));
    expect(listed.status).toBe(403);

    const written = await api
      .post(`${BASE}/publication/activities/${activityId}/questions`)
      .set(auth(admin))
      .send({ say: 'Ours', options: [{ glyph: 'A', isCorrect: true }, { glyph: 'B' }] });
    expect(written.status).toBe(403);

    const uploaded = await api
      .post(`${BASE}/publication/assets`)
      .set(auth(admin))
      .attach('file', TINY_PNG, 'ours.png');
    expect(uploaded.status).toBe(403);
  });
});
