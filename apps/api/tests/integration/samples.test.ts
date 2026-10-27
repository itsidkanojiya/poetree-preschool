import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTHORED_ACTIVITY_TYPES } from '@poetree/shared';
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
import { SAMPLE_BOOK_CODE } from '../../src/services/samples.service.js';

/**
 * The sample book: every type, modelled on the Pre-Primary A books, every
 * question one a child could play, and none of it in front of a child.
 */

const dbUp = await isDatabaseReachable();

describe.skipIf(!dbUp)('the sample book', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let publisher: Session;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    publisher = await login(baseline.superAdminEmail);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('is the publisher’s alone to add', async () => {
    const admin = await login(school.adminEmail);
    const refused = await api.post(`${BASE}/publication/samples/pre-primary-a`).set(auth(admin));
    expect(refused.status).toBe(403);
  });

  it('adds every type, each question ready to play, given to no school', async () => {
    const first = await api.post(`${BASE}/publication/samples/pre-primary-a`).set(auth(publisher));
    expect(first.status).toBe(200);
    expect(first.body.added).toBe(first.body.total);
    expect(first.body.total).toBeGreaterThanOrEqual(15);

    const book = await prismaUnscoped.book.findFirstOrThrow({
      where: { code: SAMPLE_BOOK_CODE },
      include: {
        chapters: { select: { name: true } },
        // Every new book is written switched off at each school; what matters
        // is that no school has it switched on.
        _count: { select: { schools: { where: { enabled: true } } } },
      },
    });
    expect(book.chapters.map((chapter) => chapter.name)).toEqual([
      'My world (Holistic)',
      'Letters (Literacy)',
      'Numbers (Numeracy)',
      'Rhymes and stories',
    ]);
    // No child meets it until the publisher gives it to a school.
    expect(book._count.schools).toBe(0);

    const activities = await prismaUnscoped.learningActivity.findMany({
      where: { books: { some: { bookId: book.id } } },
      select: { id: true, type: true, chapterId: true },
    });
    expect(new Set(activities.map((activity) => activity.type))).toEqual(
      new Set(AUTHORED_ACTIVITY_TYPES),
    );
    expect(activities.every((activity) => activity.chapterId !== null)).toBe(true);

    for (const activity of activities) {
      const list = await api
        .get(`${BASE}/publication/activities/${activity.id}/questions`)
        .set(auth(publisher));
      expect(list.body.length).toBeGreaterThan(0);
      for (const question of list.body as Array<{ say: string; problem: string | null }>) {
        expect({ activity: activity.type, say: question.say, problem: question.problem }).toEqual({
          activity: activity.type,
          say: question.say,
          problem: null,
        });
      }
    }

    // The shadows are drawn from the app's own pictures.
    const shadow = await prismaUnscoped.questionOption.count({
      where: { matchShadow: true, fileId: { not: null } },
    });
    expect(shadow).toBe(4);
  }, 180_000);

  it('adds nothing twice', async () => {
    const again = await api.post(`${BASE}/publication/samples/pre-primary-a`).set(auth(publisher));
    expect(again.status).toBe(200);
    expect(again.body.added).toBe(0);
    expect(again.body.questionsAdded).toBe(0);
    expect(await prismaUnscoped.book.count({ where: { code: SAMPLE_BOOK_CODE } })).toBe(1);
  });

  it('tops up a sample page that has lost an activity', async () => {
    const page = await prismaUnscoped.learningActivity.findUniqueOrThrow({
      where: { code: 'SAMPLE_FRUIT_CARDS' },
      select: { id: true, questions: { select: { id: true, say: true } } },
    });
    const gone = page.questions[0]!;
    await prismaUnscoped.activityQuestion.delete({ where: { id: gone.id } });

    const topped = await api.post(`${BASE}/publication/samples/pre-primary-a`).set(auth(publisher));
    expect(topped.body.added).toBe(0);
    expect(topped.body.questionsAdded).toBe(1);
    const back = await prismaUnscoped.activityQuestion.count({
      where: { activityId: page.id, say: gone.say },
    });
    expect(back).toBe(1);
  });
});
