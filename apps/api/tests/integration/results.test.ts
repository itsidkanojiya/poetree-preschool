import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

const pdf = (request: ReturnType<typeof api.get>) =>
  request.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

/**
 * Term report cards: the office sets up, the class teacher fills in and hands
 * over, the office publishes. What is tested is who may do each step, that a
 * family sees nothing early and only their own child, and that a published
 * card is frozen — renaming a grade afterwards must not rewrite it.
 */
describe.skipIf(!dbUp)('report cards', () => {
  let school: TestSchool;
  let other: TestSchool;
  let admin: Session;
  let teacher: Session;
  let parent: Session;
  let otherTeacher: Session;
  let termId: string;
  let classLevelId: string;
  let areaId: string;
  let excellentId: string;
  let reportCardId: string;

  const grid = () => `${BASE}/results/classrooms/${school.classroomId}/terms/${termId}`;

  beforeAll(async () => {
    await resetDatabase();
    const baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    other = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);
    teacher = await login(school.teacherEmail);
    parent = await login(school.parentPhone);
    otherTeacher = await login(other.teacherEmail);

    const classroom = await prismaUnscoped.classroom.findUniqueOrThrow({
      where: { id: school.classroomId },
    });
    classLevelId = classroom.classLevelId;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('starts a school on a plain-words scale', async () => {
    const scale = await api.get(`${BASE}/results/scale`).set(auth(admin));
    expect(scale.status).toBe(200);
    expect(scale.body.map((l: { label: string }) => l.label)).toEqual([
      'Excellent',
      'Very good',
      'Good',
      'Needs practice',
    ]);
    excellentId = scale.body[0].id;
  });

  it('lets the office set up terms and what is graded, and not a teacher', async () => {
    const refused = await api
      .post(`${BASE}/results/terms`)
      .set(auth(teacher))
      .send({ name: 'Term 1' });
    expect(refused.status).toBe(403);

    const term = await api.post(`${BASE}/results/terms`).set(auth(admin)).send({ name: 'Term 1' });
    expect(term.status).toBe(201);
    termId = term.body.id;

    const areas = await api
      .post(`${BASE}/results/areas/preset`)
      .set(auth(admin))
      .send({ classLevelId, preset: 'development' });
    expect(areas.status).toBe(200);
    expect(areas.body.length).toBeGreaterThan(3);
    expect(areas.body[0].group).toBe('Development');
    areaId = areas.body[0].id;

    // Twice adds nothing twice.
    const again = await api
      .post(`${BASE}/results/areas/preset`)
      .set(auth(admin))
      .send({ classLevelId, preset: 'development' });
    expect(again.body).toHaveLength(areas.body.length);
  });

  it('lets the class teacher fill in their own class', async () => {
    const empty = await api.get(grid()).set(auth(teacher));
    expect(empty.status).toBe(200);
    expect(empty.body.children).toHaveLength(1);
    expect(empty.body.children[0].status).toBe('NOT_STARTED');

    const saved = await api
      .put(`${BASE}/results/report-cards`)
      .set(auth(teacher))
      .send({
        termId,
        studentId: school.studentId,
        grades: [{ areaId, gradeLevelId: excellentId }],
        remarks: 'A joy to teach.',
      });
    expect(saved.status).toBe(200);
    expect(saved.body.status).toBe('DRAFT');
    expect(saved.body.graded).toBe(1);
    reportCardId = saved.body.reportCardId;
  });

  it('keeps another school’s teacher out', async () => {
    const read = await api.get(grid()).set(auth(otherTeacher));
    expect(read.status).toBe(404);
  });

  it('shows the family nothing before it is published', async () => {
    const list = await api
      .get(`${BASE}/me/children/${school.studentId}/report-cards`)
      .set(auth(parent));
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);

    const copy = await pdf(
      api.get(`${BASE}/results/report-cards/${reportCardId}/pdf`).set(auth(parent)),
    );
    expect(copy.status).toBe(404);
  });

  it('hands the class to the office, after which the teacher cannot change it', async () => {
    const refused = await api.post(`${grid()}/publish`).set(auth(teacher)).send({});
    expect(refused.status).toBe(403);

    const submitted = await api.post(`${grid()}/submit`).set(auth(teacher));
    expect(submitted.status).toBe(200);
    expect(submitted.body.counts.submitted).toBe(1);

    const late = await api
      .put(`${BASE}/results/report-cards`)
      .set(auth(teacher))
      .send({ termId, studentId: school.studentId, grades: [], remarks: 'changed' });
    expect(late.status).toBe(409);
  });

  it('publishes to the family, frozen as it was', async () => {
    const published = await api.post(`${grid()}/publish`).set(auth(admin)).send({});
    expect(published.status).toBe(200);
    expect(published.body.counts.published).toBe(1);

    const list = await api
      .get(`${BASE}/me/children/${school.studentId}/report-cards`)
      .set(auth(parent));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].term).toBe('Term 1');

    // Renaming the grade afterwards must not rewrite a card the family has.
    await api
      .put(`${BASE}/results/scale`)
      .set(auth(admin))
      .send({
        levels: [{ id: excellentId, label: 'Outstanding' }, { label: 'Fine' }],
      });

    const card = await api
      .get(`${BASE}/me/children/${school.studentId}/report-cards/${termId}`)
      .set(auth(parent));
    expect(card.status).toBe(200);
    expect(card.body.remarks).toBe('A joy to teach.');
    const grades = card.body.groups.flatMap((g: { rows: Array<{ grade: string | null }> }) =>
      g.rows.map((r) => r.grade),
    );
    expect(grades).toContain('Excellent');
    expect(grades).not.toContain('Outstanding');
    expect(card.body).not.toHaveProperty('classTeacherUserId');

    const copy = await pdf(
      api.get(`${BASE}/results/report-cards/${reportCardId}/pdf`).set(auth(parent)),
    );
    expect(copy.status).toBe(200);
    expect(copy.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('cannot be edited once published, until the office takes it back', async () => {
    const edit = await api
      .put(`${BASE}/results/report-cards`)
      .set(auth(admin))
      .send({ termId, studentId: school.studentId, grades: [] });
    expect(edit.status).toBe(409);

    const back = await api
      .post(`${BASE}/results/report-cards/${reportCardId}/unpublish`)
      .set(auth(admin));
    expect(back.status).toBe(204);

    const list = await api
      .get(`${BASE}/me/children/${school.studentId}/report-cards`)
      .set(auth(parent));
    expect(list.body).toEqual([]);
  });

  it('prints the whole class for its teacher', async () => {
    const file = await pdf(api.get(`${grid()}/pdf`).set(auth(teacher)));
    expect(file.status).toBe(200);
    expect(file.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('shows the office every class’s progress through the term', async () => {
    const overview = await api.get(`${BASE}/results/terms/${termId}/overview`).set(auth(admin));
    expect(overview.status).toBe(200);
    expect(overview.body).toHaveLength(1);
    expect(overview.body[0].children).toBe(1);
  });
});
