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

const COUNTING = {
  kind: 'COUNTING',
  items: [{ prompt: { say: 'How many?' }, options: [{ text: '1' }, { text: '2' }], answer: 0 }],
};

/**
 * "Done", apart from scores: what a 2D & 3D chapter counts towards being
 * finished. A flashcard set has no score and must not grow one.
 */
describe.skipIf(!dbUp)('finishing activities', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let publisher: Session;
  let parent: Session;
  let bookId: string;
  let scoredId: string;
  let cardsId: string;
  let otherChildId: string;

  async function doneFor(studentId: string): Promise<Record<string, boolean | null>> {
    const response = await api
      .get(`${BASE}/progress/activities`)
      .query({ studentId, bookId })
      .set(auth(parent));
    expect(response.status).toBe(200);
    return Object.fromEntries(
      (response.body as { id: string; completedByChild: boolean | null }[]).map((row) => [
        row.id,
        row.completedByChild,
      ]),
    );
  }

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    publisher = await login(baseline.superAdminEmail);
    parent = await login(school.parentPhone);

    const skill = await prismaUnscoped.skill.create({ data: { code: 'COUNT', name: 'Counting' } });
    const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({
      where: { code: 'NURSERY' },
      select: { id: true },
    });

    const book = await api
      .post(`${BASE}/publication/books`)
      .set(auth(publisher))
      .send({ code: 'NUR_MATHS', name: 'Maths Book', classLevelId: nursery.id });
    bookId = book.body.id as string;
    const chapter = await api
      .post(`${BASE}/publication/books/${bookId}/chapters`)
      .set(auth(publisher))
      .send({ name: 'Numbers', animationUrl: 'https://youtu.be/dQw4w9WgXcQ' });
    await api
      .put(`${BASE}/publication/schools/${school.id}/books`)
      .set(auth(publisher))
      .send({ books: [{ bookId, enabled: true }] });

    const create = async (code: string, type: string, content?: object) => {
      const created = await api
        .post(`${BASE}/publication/activities`)
        .set(auth(publisher))
        .send({
          code,
          title: code,
          type,
          skillId: skill.id,
          bookIds: [bookId],
          chapterId: chapter.body.id,
          classLevelId: nursery.id,
          ...(content ? { content } : {}),
        });
      expect(created.status).toBe(201);
      return created.body.id as string;
    };
    scoredId = await create('COUNT_TO_TWO', 'COUNTING', COUNTING);
    cardsId = await create('NUMBER_CARDS', 'FLASHCARD');

    const other = await prismaUnscoped.student.create({
      data: {
        schoolId: school.id,
        admissionNo: 'A-0999',
        firstName: 'Someone',
        dateOfBirth: new Date('2021-06-01'),
        gender: 'FEMALE',
      },
    });
    otherChildId = other.id;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('starts with nothing done', async () => {
    expect(await doneFor(school.studentId)).toEqual({ [scoredId]: false, [cardsId]: false });
  });

  it('marks flashcards done without giving them a score', async () => {
    const response = await api
      .post(`${BASE}/progress/activities/${cardsId}/completed`)
      .set(auth(parent))
      .send({ studentId: school.studentId });
    expect(response.status).toBe(200);

    expect((await doneFor(school.studentId))[cardsId]).toBe(true);
    // No attempt, so nothing feeds the skills figures.
    expect(
      await prismaUnscoped.activityAttempt.count({
        where: { studentId: school.studentId, activityId: cardsId },
      }),
    ).toBe(0);
  });

  it('counts a scored activity done once its attempt is recorded', async () => {
    const attempt = await api
      .post(`${BASE}/progress/attempts`)
      .set(auth(parent))
      .send({ studentId: school.studentId, activityId: scoredId, correctCount: 1, totalCount: 1 });
    expect(attempt.status).toBe(201);

    expect(await doneFor(school.studentId)).toEqual({ [scoredId]: true, [cardsId]: true });
  });

  it('writes done once, however often it is played again', async () => {
    for (let i = 0; i < 2; i++) {
      await api
        .post(`${BASE}/progress/activities/${cardsId}/completed`)
        .set(auth(parent))
        .send({ studentId: school.studentId });
    }
    expect(
      await prismaUnscoped.activityCompletion.count({
        where: { studentId: school.studentId, activityId: cardsId },
      }),
    ).toBe(1);
  });

  it('keeps each child’s own: a parent cannot read or credit another child', async () => {
    const credit = await api
      .post(`${BASE}/progress/activities/${cardsId}/completed`)
      .set(auth(parent))
      .send({ studentId: otherChildId });
    expect(credit.status).toBe(404);

    const read = await api
      .get(`${BASE}/progress/activities`)
      .query({ studentId: otherChildId, bookId })
      .set(auth(parent));
    expect(read.status).toBe(404);

    expect(
      await prismaUnscoped.activityCompletion.count({ where: { studentId: otherChildId } }),
    ).toBe(0);
  });

  it('says nothing about done when no child is named', async () => {
    const response = await api
      .get(`${BASE}/progress/activities`)
      .query({ bookId })
      .set(auth(parent));
    expect(response.status).toBe(200);
    expect(
      (response.body as { completedByChild: unknown }[]).every(
        (row) => row.completedByChild === null,
      ),
    ).toBe(true);
  });
});
