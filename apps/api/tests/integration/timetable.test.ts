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
 * A week is not a shape a school has to fill in.
 *
 * Maths on Wednesday and nothing at all in the same period on Monday is the
 * ordinary case, not an incomplete timetable — a preschool's Monday is simply
 * not its Wednesday. Every cell is its own day and period, and one being empty
 * says nothing about any other.
 */
describe.skipIf(!dbUp)('a week that is only as full as it needs to be', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let admin: Session;
  let periodId: string;
  let mathsId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    admin = await login(school.adminEmail);

    const period = await api
      .post(`${BASE}/timetable/periods`)
      .set(auth(admin))
      .send({
        academicYearId: school.academicYearId,
        name: 'First',
        startTime: '09:00',
        endTime: '09:40',
        sortOrder: 1,
      });
    periodId = period.body.id as string;

    const maths = await api.post(`${BASE}/subjects`).set(auth(admin)).send({ name: 'Maths' });
    mathsId = maths.body.id as string;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('puts a subject on Wednesday and leaves Monday alone', async () => {
    const saved = await api
      .put(`${BASE}/timetable/classrooms/${school.classroomId}`)
      .set(auth(admin))
      // Wednesday only. Monday is not sent as an empty slot — it is not sent.
      .send({ slots: [{ dayOfWeek: 3, periodId, subjectId: mathsId }] });

    expect(saved.status).toBe(200);

    const days = saved.body.entries.map((entry: { dayOfWeek: number }) => entry.dayOfWeek);
    expect(days).toEqual([3]);

    const wednesday = saved.body.entries[0];
    expect(wednesday.subject.name).toBe('Maths');
  });

  it('lets each day of the same period be a different subject, or none', async () => {
    const play = await api.post(`${BASE}/subjects`).set(auth(admin)).send({ name: 'Play' });

    const saved = await api
      .put(`${BASE}/timetable/classrooms/${school.classroomId}`)
      .set(auth(admin))
      .send({
        slots: [
          { dayOfWeek: 1, periodId, subjectId: play.body.id },
          { dayOfWeek: 3, periodId, subjectId: mathsId },
          // Thursday carries a teacher and no subject, which is allowed: a
          // period can be supervised before anybody has decided what it is.
          { dayOfWeek: 4, periodId, teacherId: school.teacherId },
        ],
      });

    expect(saved.status).toBe(200);

    const byDay = new Map<number, { subject: { name: string } | null }>(
      saved.body.entries.map((entry: { dayOfWeek: number }) => [entry.dayOfWeek, entry]),
    );

    expect(byDay.get(1)?.subject?.name).toBe('Play');
    expect(byDay.get(3)?.subject?.name).toBe('Maths');
    expect(byDay.get(4)?.subject).toBeNull();
    // Tuesday, Friday and the rest were never mentioned and do not exist.
    expect(byDay.has(2)).toBe(false);
    expect(byDay.has(5)).toBe(false);
  });

  it('removes a lesson when the grid is saved without it', async () => {
    // What the ✕ on a slot does: the cell is left out of the save, so the row
    // goes. Without this a cleared slot would come back on the next reload.
    const cleared = await api
      .put(`${BASE}/timetable/classrooms/${school.classroomId}`)
      .set(auth(admin))
      .send({ slots: [{ dayOfWeek: 3, periodId, subjectId: mathsId }] });

    expect(cleared.status).toBe(200);
    expect(cleared.body.entries.map((e: { dayOfWeek: number }) => e.dayOfWeek)).toEqual([3]);

    const rows = await prismaUnscoped.timetableEntry.count({
      where: { classroomId: school.classroomId },
    });
    expect(rows).toBe(1);
  });

  it('empties the week entirely when nothing is scheduled', async () => {
    const emptied = await api
      .put(`${BASE}/timetable/classrooms/${school.classroomId}`)
      .set(auth(admin))
      .send({ slots: [] });

    expect(emptied.status).toBe(200);
    expect(emptied.body.entries).toEqual([]);
  });
});
