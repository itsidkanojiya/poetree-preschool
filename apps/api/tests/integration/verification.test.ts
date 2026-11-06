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
 * A family's registration is verified by the school.
 *
 * While it waits the office may correct it; once verified or turned down the
 * request is locked. The child it became stays editable — every field — with
 * each change written down from what it was to what it became.
 */
describe.skipIf(!dbUp)('verifying a registration', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let other: TestSchool;
  let admin: Session;
  let nurseryId: string;

  const verified = async (channel: 'PHONE' | 'EMAIL', destination: string) => {
    const sent = await api
      .post(`${BASE}/public/schools/${school.code}/otp/send`)
      .send({ channel, destination });
    await api
      .post(`${BASE}/public/schools/${school.code}/otp/verify`)
      .send({ challengeId: sent.body.challengeId, code: '1234' });
    return sent.body.challengeId as string;
  };

  /** A family's registration, sent and found in the school's queue. */
  const registration = async (phone: string): Promise<{ id: string; phone: string }> => {
    const email = `${phone.replace(/[^0-9]/g, '')}@example.test`;
    const second = `+91${(Number(phone.slice(-10)) + 1).toString().slice(-10)}`;
    const sent = await api.post(`${BASE}/public/schools/${school.code}/registrations`).send({
      studentFirstName: 'Arush',
      studentLastName: 'Mehta',
      studentDateOfBirth: '2021-05-02',
      classLevelId: nurseryId,
      guardianName: 'Rohan Mehta',
      phone,
      phoneChallengeId: await verified('PHONE', phone),
      email,
      emailChallengeId: await verified('EMAIL', email),
      motherPhone: second,
      motherPhoneChallengeId: await verified('PHONE', second),
      address: '3 Park Lane, Pune',
      password: 'Family@2026',
      confirmPassword: 'Family@2026',
      declarationAccepted: true,
      termsAccepted: true,
    });
    expect(sent.status).toBe(202);
    const queue = await api.get(`${BASE}/registrations`).set(auth(admin));
    const row = queue.body.items.find((r: { phone: string }) => r.phone === phone);
    return { id: row.id as string, phone };
  };

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    other = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);
    nurseryId = (
      await prismaUnscoped.classLevel.findUniqueOrThrow({
        where: { code: 'NURSERY' },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('can be corrected while it waits, and each correction is recorded', async () => {
    const { id } = await registration('+919820003001');

    const corrected = await api
      .patch(`${BASE}/registrations/${id}`)
      .set(auth(admin))
      .send({ studentFirstName: 'Aarush', studentDateOfBirth: '2021-05-12', bloodGroup: 'B+' });
    expect(corrected.status).toBe(200);
    expect(corrected.body).toMatchObject({
      studentName: 'Aarush Mehta',
      studentDateOfBirth: '2021-05-12T00:00:00.000Z',
      bloodGroup: 'B+',
    });

    const logged = await prismaUnscoped.auditLog.findFirstOrThrow({
      where: { action: 'REGISTRATION_UPDATED', entityId: id },
    });
    expect(logged.before).toMatchObject({
      studentFirstName: 'Arush',
      studentDateOfBirth: '2021-05-02',
    });
    expect(logged.after).toMatchObject({
      studentFirstName: 'Aarush',
      studentDateOfBirth: '2021-05-12',
    });
  });

  it('records the standard it was moved to by name, not by id', async () => {
    const { id } = await registration('+919820003051');
    const other = await prismaUnscoped.classLevel.findFirstOrThrow({
      where: { isActive: true, NOT: { id: nurseryId } },
      select: { id: true, name: true },
    });

    const moved = await api
      .patch(`${BASE}/registrations/${id}`)
      .set(auth(admin))
      .send({ classLevelId: other.id });
    expect(moved.status).toBe(200);
    expect(moved.body.classLevel).toMatchObject({ id: other.id });

    const logged = await prismaUnscoped.auditLog.findFirstOrThrow({
      where: { action: 'REGISTRATION_UPDATED', entityId: id },
    });
    expect(logged.after).toMatchObject({ classLevelId: other.name });
    expect((logged.before as Record<string, unknown>).classLevelId).not.toBe(nurseryId);
  });

  it('keeps the numbers and the address that were proved with a code', async () => {
    const { id, phone } = await registration('+919820003101');

    await api
      .patch(`${BASE}/registrations/${id}`)
      .set(auth(admin))
      .send({ phone: '+919820009999', email: 'someone@else.test', guardianName: 'Rohan K Mehta' });

    const row = await prismaUnscoped.parentRegistration.findUniqueOrThrow({ where: { id } });
    expect(row.phone).toBe(phone);
    expect(row.email).toBe('919820003101@example.test');
    expect(row.guardianName).toBe('Rohan K Mehta');
  });

  it('is locked once verified, and the child says who verified it', async () => {
    const { id } = await registration('+919820003201');

    const approved = await api
      .post(`${BASE}/registrations/${id}/approve`)
      .set(auth(admin))
      .send({ mode: 'CREATE', gender: 'MALE' });
    expect(approved.status).toBe(200);

    const locked = await api
      .patch(`${BASE}/registrations/${id}`)
      .set(auth(admin))
      .send({ studentFirstName: 'Too late' });
    expect(locked.status).toBe(409);
    expect(locked.body.error.message).toContain('verified');

    const child = await api.get(`${BASE}/students/${approved.body.student.id}`).set(auth(admin));
    expect(child.body.verification).toMatchObject({ verifiedBy: expect.any(String) });
    expect(child.body.verification.verifiedAt).toBeTruthy();
  });

  it('is locked once turned down', async () => {
    const { id } = await registration('+919820003301');
    await api
      .post(`${BASE}/registrations/${id}/reject`)
      .set(auth(admin))
      .send({ reason: 'Not ours' });

    const locked = await api
      .patch(`${BASE}/registrations/${id}`)
      .set(auth(admin))
      .send({ studentFirstName: 'Too late' });
    expect(locked.status).toBe(409);
    expect(locked.body.error.message).toContain('turned down');
  });

  it('leaves a verified child editable, every change logged from what to what', async () => {
    const { id } = await registration('+919820003401');
    const approved = await api
      .post(`${BASE}/registrations/${id}/approve`)
      .set(auth(admin))
      .send({ mode: 'CREATE', gender: 'FEMALE' });
    const studentId = approved.body.student.id as string;

    const edited = await api.patch(`${BASE}/students/${studentId}`).set(auth(admin)).send({
      middleName: 'Rohan',
      addressLine1: '9 Lake Road',
      city: 'Pune',
      allergies: 'Peanuts',
      emergencyContactPhone: '+919820004040',
    });
    expect(edited.status).toBe(200);
    // The father's name is kept now — it used to be dropped on the way in.
    expect(edited.body).toMatchObject({
      middleName: 'Rohan',
      addressLine1: '9 Lake Road',
      city: 'Pune',
      allergies: 'Peanuts',
      emergencyContactPhone: '+919820004040',
    });

    const history = await api.get(`${BASE}/students/${studentId}/history`).set(auth(admin));
    expect(history.status).toBe(200);
    const change = history.body.find((h: { action: string }) => h.action === 'STUDENT_UPDATED');
    expect(change.by).toBeTruthy();
    expect(change.changes).toEqual(
      expect.arrayContaining([
        { field: 'middleName', before: null, after: 'Rohan' },
        { field: 'allergies', before: null, after: 'Peanuts' },
      ]),
    );
    // And the verification itself is on the record.
    expect(history.body.map((h: { action: string }) => h.action)).toContain(
      'REGISTRATION_APPROVED',
    );
  });

  it('is the school office’s, not a teacher’s or another school’s', async () => {
    const { id } = await registration('+919820003501');

    const teacher = await login(school.teacherEmail);
    const asTeacher = await api
      .patch(`${BASE}/registrations/${id}`)
      .set(auth(teacher))
      .send({ studentFirstName: 'Nope' });
    expect(asTeacher.status).toBe(403);

    const neighbour = await login(other.adminEmail);
    const asNeighbour = await api
      .patch(`${BASE}/registrations/${id}`)
      .set(auth(neighbour))
      .send({ studentFirstName: 'Nope' });
    expect(asNeighbour.status).toBe(404);
  });
});
