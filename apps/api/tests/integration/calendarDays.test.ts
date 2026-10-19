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
 * The attendance calendar asks for a month of homework and notices and sorts
 * it into days. A day is a day in India: 23:30 on the 8th is the 8th's, and
 * 00:30 on the 9th is the 9th's, though UTC calls both the 8th.
 */
const LATE_ON_THE_8TH = new Date('2026-10-08T18:00:00Z'); // 23:30 IST, 8 October
const EARLY_ON_THE_9TH = new Date('2026-10-08T19:00:00Z'); // 00:30 IST, 9 October

describe.skipIf(!dbUp)('homework and notices by school day', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let teacher: Session;
  let admin: Session;
  let parent: Session;
  const homework: Record<string, string> = {};
  const notices: Record<string, string> = {};

  async function setHomework(key: string, dueDate: string, assignedOn: Date): Promise<void> {
    const created = await api
      .post(`${BASE}/homework`)
      .set(auth(teacher))
      .send({ classroomId: school.classroomId, title: key, dueDate, allowsSubmission: true });
    expect(created.status).toBe(201);
    await api.post(`${BASE}/homework/${created.body.id}/publish`).set(auth(teacher));
    // When it was set is the server's clock; the test needs a particular day.
    await prismaUnscoped.homework.update({ where: { id: created.body.id }, data: { assignedOn } });
    homework[key] = created.body.id as string;
  }

  async function post(key: string, publishAt: Date): Promise<void> {
    const created = await api
      .post(`${BASE}/notices`)
      .set(auth(admin))
      .send({ title: key, body: `About ${key}.`, audience: 'ALL' });
    expect(created.status).toBe(201);
    await prismaUnscoped.notice.update({ where: { id: created.body.id }, data: { publishAt } });
    notices[key] = created.body.id as string;
  }

  async function homeworkOn(from: string, to = from): Promise<string[]> {
    const response = await api
      .get(`${BASE}/homework`)
      .query({ classroomId: school.classroomId, studentId: school.studentId, from, to })
      .set(auth(parent));
    expect(response.status).toBe(200);
    return (response.body.items as { title: string }[]).map((item) => item.title).sort();
  }

  async function noticesOn(from: string, to = from): Promise<string[]> {
    const response = await api.get(`${BASE}/notices`).query({ from, to }).set(auth(parent));
    expect(response.status).toBe(200);
    return (response.body.items as { title: string }[]).map((item) => item.title).sort();
  }

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    teacher = await login(school.teacherEmail);
    admin = await login(school.adminEmail);
    parent = await login(school.parentPhone);

    // Set a week before, due on the 8th.
    await setHomework('Due on the 8th', '2026-10-08', new Date('2026-10-01T05:00:00Z'));
    // Set late on the 8th, due later.
    await setHomework('Set late on the 8th', '2026-10-12', LATE_ON_THE_8TH);
    // Set just after midnight, so on the 9th.
    await setHomework('Set early on the 9th', '2026-10-13', EARLY_ON_THE_9TH);
    // Nothing to do with October 8 or 9.
    await setHomework('In November', '2026-11-20', new Date('2026-11-16T05:00:00Z'));

    await post('Late on the 8th', LATE_ON_THE_8TH);
    await post('Early on the 9th', EARLY_ON_THE_9TH);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('gives a day the homework set or due on it, by the school’s clock', async () => {
    expect(await homeworkOn('2026-10-08')).toEqual(['Due on the 8th', 'Set late on the 8th']);
    expect(await homeworkOn('2026-10-09')).toEqual(['Set early on the 9th']);
    // Due on the 12th, set on the 8th: on both days, nowhere between.
    expect(await homeworkOn('2026-10-12')).toEqual(['Set late on the 8th']);
    expect(await homeworkOn('2026-10-10')).toEqual([]);
  });

  it('gives a month everything set or due within it', async () => {
    expect(await homeworkOn('2026-10-01', '2026-10-31')).toEqual([
      'Due on the 8th',
      'Set early on the 9th',
      'Set late on the 8th',
    ]);
  });

  it('gives a day the notices published on it, by the school’s clock', async () => {
    expect(await noticesOn('2026-10-08')).toEqual(['Late on the 8th']);
    expect(await noticesOn('2026-10-09')).toEqual(['Early on the 9th']);
    expect(await noticesOn('2026-10-10')).toEqual([]);
  });

  it('still hides an expired notice, whatever day is asked about', async () => {
    await prismaUnscoped.notice.update({
      where: { id: notices['Late on the 8th'] },
      data: { expiresAt: new Date('2026-10-09T00:00:00Z') },
    });

    expect(await noticesOn('2026-10-08')).toEqual([]);
  });

  it('lists everything as before when no day is given', async () => {
    const all = await api
      .get(`${BASE}/homework`)
      .query({ classroomId: school.classroomId })
      .set(auth(parent));
    expect(all.body.items).toHaveLength(4);
  });

  it('refuses a day that is not a date', async () => {
    const response = await api
      .get(`${BASE}/homework`)
      .query({ classroomId: school.classroomId, from: '8 Oct' })
      .set(auth(parent));
    expect(response.status).toBe(400);
  });
});
