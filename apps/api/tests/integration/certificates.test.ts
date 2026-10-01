import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { disconnectPrisma } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

const pdf = (request: ReturnType<typeof api.get>) =>
  request.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

const isPdf = (body: Buffer) => body.subarray(0, 5).toString() === '%PDF-';

/**
 * Certificates the school awards.
 *
 * What matters is who sees what, and when: nothing reaches a family until the
 * office issues it, a family sees only their own child's, and a revoked one is
 * gone. The artwork is looked at, not tested.
 */
describe.skipIf(!dbUp)('certificates', () => {
  let school: TestSchool;
  let other: TestSchool;
  let admin: Session;
  let teacher: Session;
  let parent: Session;
  let neighbour: Session;
  let certificateId: string;
  let awardId: string;

  beforeAll(async () => {
    await resetDatabase();
    const baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    other = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);
    teacher = await login(school.teacherEmail);
    parent = await login(school.parentPhone);
    neighbour = await login(other.adminEmail);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('lets the office write one, and nobody else', async () => {
    const refused = await api
      .post(`${BASE}/certificates`)
      .set(auth(teacher))
      .send({ title: 'Star of the Month', issuedOn: '2026-10-01' });
    expect(refused.status).toBe(403);

    const created = await api
      .post(`${BASE}/certificates`)
      .set(auth(admin))
      .send({
        title: 'Star of the Month',
        body: 'for always being kind',
        design: 'STARS',
        issuedOn: '2026-10-01',
        studentIds: [school.studentId],
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('DRAFT');
    expect(created.body.recipients).toHaveLength(1);
    expect(created.body.recipients[0].number).toBeNull();
    certificateId = created.body.id;
    awardId = created.body.recipients[0].awardId;
  });

  it('keeps a draft from the family', async () => {
    const list = await api
      .get(`${BASE}/me/children/${school.studentId}/certificates`)
      .set(auth(parent));
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);

    const copy = await pdf(api.get(`${BASE}/certificates/awards/${awardId}/pdf`).set(auth(parent)));
    expect(copy.status).toBe(404);
  });

  it('previews the design as a landscape A4 page', async () => {
    const preview = await pdf(
      api.get(`${BASE}/certificates/${certificateId}/preview`).set(auth(admin)),
    );
    expect(preview.status).toBe(200);
    expect(isPdf(preview.body)).toBe(true);

    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(
      preview.body.toString('latin1'),
    );
    expect(Number(box![1])).toBeCloseTo(841.89, 1);
    expect(Number(box![2])).toBeCloseTo(595.28, 1);
  });

  it('numbers each copy when issued, and tells the family', async () => {
    const issued = await api.post(`${BASE}/certificates/${certificateId}/issue`).set(auth(admin));
    expect(issued.status).toBe(200);
    expect(issued.body.status).toBe('ISSUED');
    expect(issued.body.recipients[0].number).toBe('CERT-0001');
    expect(issued.body.recipients[0].classroomLabel).toContain('A');

    const list = await api
      .get(`${BASE}/me/children/${school.studentId}/certificates`)
      .set(auth(parent));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe('Star of the Month');

    const copy = await pdf(api.get(`${BASE}/certificates/awards/${awardId}/pdf`).set(auth(parent)));
    expect(copy.status).toBe(200);
    expect(isPdf(copy.body)).toBe(true);
  });

  it('cannot be changed once issued', async () => {
    const edit = await api
      .patch(`${BASE}/certificates/${certificateId}`)
      .set(auth(admin))
      .send({ title: 'Something else' });
    expect(edit.status).toBe(409);

    const again = await api.post(`${BASE}/certificates/${certificateId}/issue`).set(auth(admin));
    expect(again.status).toBe(409);
  });

  it('numbers the next certificate on from the last, with no gaps', async () => {
    const created = await api
      .post(`${BASE}/certificates`)
      .set(auth(admin))
      .send({ title: 'Sports Day', issuedOn: '2026-10-02', studentIds: [school.studentId] });
    const issued = await api.post(`${BASE}/certificates/${created.body.id}/issue`).set(auth(admin));
    expect(issued.body.recipients[0].number).toBe('CERT-0002');
  });

  it('will not issue a certificate to nobody', async () => {
    const created = await api
      .post(`${BASE}/certificates`)
      .set(auth(admin))
      .send({ title: 'Empty', issuedOn: '2026-10-02' });
    const issued = await api.post(`${BASE}/certificates/${created.body.id}/issue`).set(auth(admin));
    expect(issued.status).toBe(400);
  });

  it('takes a revoked copy away from the family', async () => {
    const revoked = await api
      .post(`${BASE}/certificates/awards/${awardId}/revoke`)
      .set(auth(admin));
    expect(revoked.status).toBe(204);

    const list = await api
      .get(`${BASE}/me/children/${school.studentId}/certificates`)
      .set(auth(parent));
    expect(list.body.map((c: { awardId: string }) => c.awardId)).not.toContain(awardId);

    const copy = await pdf(api.get(`${BASE}/certificates/awards/${awardId}/pdf`).set(auth(parent)));
    expect(copy.status).toBe(404);
  });

  it('is invisible to another school', async () => {
    const read = await api.get(`${BASE}/certificates/${certificateId}`).set(auth(neighbour));
    expect(read.status).toBe(404);

    const list = await api.get(`${BASE}/certificates`).set(auth(neighbour));
    expect(list.body).toEqual([]);

    const recipients = await api
      .post(`${BASE}/certificates`)
      .set(auth(neighbour))
      .send({ title: 'Theirs', issuedOn: '2026-10-02', studentIds: [school.studentId] });
    expect(recipients.status).toBe(400);
  });
});
