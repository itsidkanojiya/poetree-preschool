import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  TEST_PASSWORD,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';

const dbUp = await isDatabaseReachable();

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * One person, several roles; the school removing people and putting them back;
 * and a family adding a child to the account it has.
 *
 * Most of what is asserted here is a boundary: a teacher's session that cannot
 * read a parent's pages, a removed account that cannot sign in, a child whose
 * records survive their parent being taken off.
 */
describe.skipIf(!dbUp)('roles, removal and families', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let other: TestSchool;
  let admin: Session;
  let otherAdmin: Session;
  let nurseryId: string;
  /** The seeded parent at Alpha, who comes to teach there below. */
  let parentUserId: string;

  /** A code asked for and typed back, as the app does. 1234 is the static code. */
  const verified = async (channel: 'PHONE' | 'EMAIL', destination: string) => {
    const sent = await api
      .post(`${BASE}/public/schools/${school.code}/otp/send`)
      .send({ channel, destination });
    await api
      .post(`${BASE}/public/schools/${school.code}/otp/verify`)
      .send({ challengeId: sent.body.challengeId, code: '1234' });
    return sent.body.challengeId as string;
  };

  /** A registration from the app, with all three proofs. */
  const register = async (phone: string, email: string) =>
    api.post(`${BASE}/public/schools/${school.code}/registrations`).send({
      studentFirstName: 'Kabir',
      studentLastName: 'Rao',
      studentDateOfBirth: '2022-03-03',
      classLevelId: nurseryId,
      guardianName: 'Anil Rao',
      phone,
      phoneChallengeId: await verified('PHONE', phone),
      email,
      emailChallengeId: await verified('EMAIL', email),
      motherPhone: '+919820006060',
      motherPhoneChallengeId: await verified('PHONE', '+919820006060'),
      address: '4 Hill View, Pune',
      password: 'Family@2026',
      confirmPassword: 'Family@2026',
      declarationAccepted: true,
      termsAccepted: true,
    });

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    other = await seedSchool(baseline, 'beta', 'Beta Preschool');
    admin = await login(school.adminEmail);
    otherAdmin = await login(other.adminEmail);
    nurseryId = (
      await prismaUnscoped.classLevel.findUniqueOrThrow({
        where: { code: 'NURSERY' },
        select: { id: true },
      })
    ).id;
    parentUserId = (
      await prismaUnscoped.user.findFirstOrThrow({
        where: { phone: school.parentPhone },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  describe('a parent who comes to teach', () => {
    it('is offered the teacher role on their account, not a second account', async () => {
      const clash = await api.post(`${BASE}/teachers`).set(auth(admin)).send({
        name: 'Meera Shah',
        email: 'meera@alpha.test',
        phone: school.parentPhone,
        password: 'Teach2026x',
      });
      expect(clash.status).toBe(409);
      expect(clash.body.error.details.existingAccount).toMatchObject({
        userId: parentUserId,
        roles: ['PARENT'],
        removed: false,
      });

      const added = await api
        .post(`${BASE}/teachers/${parentUserId}/from-account`)
        .set(auth(admin))
        .send({ qualification: 'B.Ed' });
      expect(added.status).toBe(201);
      expect(added.body).toMatchObject({ userId: parentUserId, isParent: true, removedAt: null });

      const parents = await api.get(`${BASE}/parents`).set(auth(admin));
      const asParent = parents.body.items.find(
        (p: { userId: string }) => p.userId === parentUserId,
      );
      expect(asParent.isTeacher).toBe(true);
    });

    it('signs in as one role at a time, and switches between them', async () => {
      const signedIn = await api
        .post(`${BASE}/auth/login`)
        .send({ identifier: school.parentPhone, password: TEST_PASSWORD });
      expect([...signedIn.body.user.roles].sort()).toEqual(['PARENT', 'TEACHER']);
      // The role the account was opened with.
      expect(signedIn.body.user.role).toBe('PARENT');
      const parentToken = signedIn.body.accessToken as string;

      const children = await api.get(`${BASE}/me/children`).set(bearer(parentToken));
      expect(children.status).toBe(200);
      expect(children.body).toHaveLength(1);

      const switched = await api
        .post(`${BASE}/auth/switch-role`)
        .set(bearer(parentToken))
        .send({ role: 'TEACHER' });
      expect(switched.status).toBe(200);
      expect(switched.body.user.role).toBe('TEACHER');
      const teacherToken = switched.body.accessToken as string;

      // As a teacher, the parent's pages are not theirs to read...
      expect((await api.get(`${BASE}/me/children`).set(bearer(teacherToken))).status).toBe(403);
      // ...and the parent session the switch replaced is over.
      const stale = await api.get(`${BASE}/me/children`).set(bearer(parentToken));
      expect(stale.status).toBe(401);
      expect(stale.body.error.code).toBe('SESSION_REPLACED');

      // A refresh keeps the role the session switched to.
      const refreshed = await api
        .post(`${BASE}/auth/refresh`)
        .send({ refreshToken: switched.body.refreshToken });
      expect(refreshed.body.user.role).toBe('TEACHER');
      const me = await api.get(`${BASE}/auth/me`).set(bearer(refreshed.body.accessToken));
      expect(me.body.user.role).toBe('TEACHER');
    });

    it('cannot switch to a role they do not hold', async () => {
      const teacher = await login(school.teacherEmail);
      const refused = await api
        .post(`${BASE}/auth/switch-role`)
        .set(auth(teacher))
        .send({ role: 'PARENT' });
      expect(refused.status).toBe(403);
    });

    it('loses only the teacher role when removed as a teacher', async () => {
      const removed = await api.delete(`${BASE}/teachers/${parentUserId}`).set(auth(admin));
      expect(removed.status).toBe(200);
      expect(removed.body.removedAt).not.toBeNull();

      const signedIn = await api
        .post(`${BASE}/auth/login`)
        .send({ identifier: school.parentPhone, password: TEST_PASSWORD });
      expect(signedIn.status).toBe(200);
      expect(signedIn.body.user.roles).toEqual(['PARENT']);

      const listed = await api.get(`${BASE}/teachers`).query({ removed: 'true' }).set(auth(admin));
      expect(listed.body.items.map((t: { userId: string }) => t.userId)).toContain(parentUserId);
    });
  });

  describe('removing a teacher', () => {
    it('signs them out at once, keeps their name, and can be undone', async () => {
      const teacher = await login(school.teacherEmail);
      const before = await prismaUnscoped.classroomTeacher.count({
        where: { userId: school.teacherId },
      });
      expect(before).toBeGreaterThan(0);

      const removed = await api.delete(`${BASE}/teachers/${school.teacherId}`).set(auth(admin));
      expect(removed.status).toBe(200);

      // The token already on their phone stops working on its next request.
      const ended = await api.get(`${BASE}/me/classrooms`).set(auth(teacher));
      expect(ended.status).toBe(401);
      expect(ended.body.error.code).toBe('ACCOUNT_INACTIVE');
      const again = await api
        .post(`${BASE}/auth/login`)
        .send({ identifier: school.teacherEmail, password: TEST_PASSWORD });
      expect(again.status).toBe(403);

      // Off their classes; still a name on the records they left.
      expect(
        await prismaUnscoped.classroomTeacher.count({ where: { userId: school.teacherId } }),
      ).toBe(0);
      const row = await prismaUnscoped.user.findUniqueOrThrow({ where: { id: school.teacherId } });
      expect(row.name).not.toBe('');
      expect(row.deletedAt).not.toBeNull();

      const active = await api.get(`${BASE}/teachers`).set(auth(admin));
      expect(active.body.items.map((t: { userId: string }) => t.userId)).not.toContain(
        school.teacherId,
      );

      // Adding them again is refused in favour of putting them back.
      const readded = await api.post(`${BASE}/teachers`).set(auth(admin)).send({
        name: 'Same Teacher',
        email: school.teacherEmail,
        password: 'Teach2026x',
      });
      expect(readded.status).toBe(409);
      expect(readded.body.error.details.existingAccount.removed).toBe(true);

      const restored = await api
        .post(`${BASE}/teachers/${school.teacherId}/restore`)
        .set(auth(admin));
      expect(restored.status).toBe(200);
      expect(restored.body.removedAt).toBeNull();
      await login(school.teacherEmail);
    });

    it('is not something another school can do', async () => {
      const response = await api
        .delete(`${BASE}/teachers/${school.teacherId}`)
        .set(auth(otherAdmin));
      expect(response.status).toBe(404);
    });
  });

  describe('removing a parent', () => {
    it('leaves the child and their records alone, and can be undone', async () => {
      const parentId = (
        await prismaUnscoped.user.findFirstOrThrow({
          where: { phone: other.parentPhone },
          select: { id: true },
        })
      ).id;

      const detail = await api.get(`${BASE}/parents/${parentId}`).set(auth(otherAdmin));
      // The only parent this child has: the portal warns before removing them.
      expect(detail.body.children[0].hasOtherGuardian).toBe(false);

      const removed = await api.delete(`${BASE}/parents/${parentId}`).set(auth(otherAdmin));
      expect(removed.status).toBe(200);

      const child = await api.get(`${BASE}/students/${other.studentId}`).set(auth(otherAdmin));
      expect(child.status).toBe(200);
      expect(child.body.removedAt).toBeNull();
      // Nobody's guardian while removed.
      expect(child.body.guardians).toHaveLength(0);

      const signIn = await api
        .post(`${BASE}/auth/login`)
        .send({ identifier: other.parentPhone, password: TEST_PASSWORD });
      expect(signIn.status).toBe(403);

      const listed = await api
        .get(`${BASE}/parents`)
        .query({ removed: 'true' })
        .set(auth(otherAdmin));
      expect(listed.body.items.map((p: { userId: string }) => p.userId)).toContain(parentId);

      const restored = await api.post(`${BASE}/parents/${parentId}/restore`).set(auth(otherAdmin));
      expect(restored.status).toBe(200);
      const parent = await login(other.parentPhone);
      const children = await api.get(`${BASE}/me/children`).set(auth(parent));
      expect(children.body).toHaveLength(1);
    });

    it('ends their session the moment they are made inactive', async () => {
      const parent = await login(other.parentPhone);
      const parentId = parent.userId;

      await api
        .patch(`${BASE}/parents/${parentId}`)
        .set(auth(otherAdmin))
        .send({ status: 'INACTIVE' });
      expect((await api.get(`${BASE}/me/children`).set(auth(parent))).status).toBe(401);

      await api
        .patch(`${BASE}/parents/${parentId}`)
        .set(auth(otherAdmin))
        .send({ status: 'ACTIVE' });
    });
  });

  describe('removing a student', () => {
    it('hides the child everywhere, keeps their history, and can be undone', async () => {
      const enrolments = await prismaUnscoped.studentEnrolment.count({
        where: { studentId: other.studentId },
      });

      const removed = await api.delete(`${BASE}/students/${other.studentId}`).set(auth(otherAdmin));
      expect(removed.status).toBe(200);
      expect(removed.body.removedAt).not.toBeNull();

      // Withdrawn from the class, not erased.
      const after = await prismaUnscoped.studentEnrolment.findMany({
        where: { studentId: other.studentId },
        select: { status: true },
      });
      expect(after).toHaveLength(enrolments);
      expect(after.every((row) => row.status !== 'ACTIVE')).toBe(true);

      const roll = await api.get(`${BASE}/students`).set(auth(otherAdmin));
      expect(roll.body.items.map((s: { id: string }) => s.id)).not.toContain(other.studentId);
      const parent = await login(other.parentPhone);
      expect((await api.get(`${BASE}/me/children`).set(auth(parent))).body).toHaveLength(0);

      const listed = await api
        .get(`${BASE}/students`)
        .query({ removed: 'true' })
        .set(auth(otherAdmin));
      expect(listed.body.items.map((s: { id: string }) => s.id)).toContain(other.studentId);

      const restored = await api
        .post(`${BASE}/students/${other.studentId}/restore`)
        .set(auth(otherAdmin));
      expect(restored.status).toBe(200);
      expect(restored.body).toMatchObject({ removedAt: null, status: 'ACTIVE', classroom: null });
    });
  });

  describe('another child, from the app', () => {
    it('goes to the school, and approving it links the child to that parent', async () => {
      const parent = await login(school.parentPhone);
      const asked = await api.post(`${BASE}/me/child-requests`).set(auth(parent)).send({
        studentFirstName: 'Diya',
        studentLastName: 'Shah',
        studentDateOfBirth: '2022-02-02',
        classLevelId: nurseryId,
      });
      expect(asked.status).toBe(201);
      expect(asked.body).toMatchObject({ status: 'PENDING', classLevel: 'Nursery' });

      const mine = await api.get(`${BASE}/me/child-requests`).set(auth(parent));
      expect(mine.body).toHaveLength(1);

      const queue = await api.get(`${BASE}/registrations`).set(auth(admin));
      const row = queue.body.items.find((r: { id: string }) => r.id === asked.body.id);
      expect(row.parentAccount).toMatchObject({ userId: parentUserId });
      expect(row.classLevel.name).toBe('Nursery');

      const approved = await api
        .post(`${BASE}/registrations/${asked.body.id}/approve`)
        .set(auth(admin))
        .send({ mode: 'CREATE', gender: 'FEMALE' });
      expect(approved.status).toBe(200);

      const children = await api.get(`${BASE}/me/children`).set(auth(parent));
      expect(children.body).toHaveLength(2);
      // No second account was opened for them.
      expect(await prismaUnscoped.user.count({ where: { phone: school.parentPhone } })).toBe(1);
    });

    it('is only for a parent', async () => {
      const teacher = await login(school.teacherEmail);
      const refused = await api.post(`${BASE}/me/child-requests`).set(auth(teacher)).send({
        studentFirstName: 'X',
        studentDateOfBirth: '2022-02-02',
        classLevelId: nurseryId,
      });
      expect(refused.status).toBe(403);
    });
  });

  describe('registering', () => {
    it('sends a parent who already has an account to Add another child', async () => {
      const response = await register(school.parentPhone, 'someone.new@example.test');
      expect(response.status).toBe(409);
      expect(response.body.error.message).toContain('Add another child');
    });

    it('links a teacher’s own child to the teacher, who becomes a parent too', async () => {
      const created = await api.post(`${BASE}/teachers`).set(auth(admin)).send({
        name: 'Anil Rao',
        email: 'anil@alpha.test',
        phone: '+919820005555',
        password: 'Teach2026x',
      });
      expect(created.status).toBe(201);

      const sent = await register('+919820005555', 'anil@alpha.test');
      expect(sent.status).toBe(202);
      expect(sent.body.message).toContain('teacher account');

      const queue = await api.get(`${BASE}/registrations`).set(auth(admin));
      const row = queue.body.items.find(
        (r: { phone: string; status: string }) =>
          r.phone === '+919820005555' && r.status === 'PENDING',
      );
      expect(row.parentAccount).toMatchObject({ userId: created.body.userId, roles: ['TEACHER'] });
      expect(row).toMatchObject({ motherPhoneVerified: true, secondContactRelation: 'MOTHER' });

      const approved = await api
        .post(`${BASE}/registrations/${row.id}/approve`)
        .set(auth(admin))
        .send({ mode: 'CREATE', gender: 'MALE' });
      expect(approved.status).toBe(200);

      const signedIn = await api
        .post(`${BASE}/auth/login`)
        .send({ identifier: 'anil@alpha.test', password: 'Teach2026x' });
      expect([...signedIn.body.user.roles].sort()).toEqual(['PARENT', 'TEACHER']);
    });

    it('needs the second number proved with its own code', async () => {
      const phone = '+919820004444';
      const email = 'four@example.test';
      const phoneChallengeId = await verified('PHONE', phone);
      const response = await api.post(`${BASE}/public/schools/${school.code}/registrations`).send({
        studentFirstName: 'Zoya',
        studentDateOfBirth: '2022-03-03',
        classLevelId: nurseryId,
        guardianName: 'Imran Khan',
        phone,
        phoneChallengeId,
        email,
        emailChallengeId: await verified('EMAIL', email),
        motherPhone: '+919820004445',
        // The father's code again, which proves nothing about this number.
        motherPhoneChallengeId: phoneChallengeId,
        address: '9 Lake Road, Pune',
        password: 'Family@2026',
        confirmPassword: 'Family@2026',
        declarationAccepted: true,
        termsAccepted: true,
      });
      expect(response.status).toBe(400);
    });

    it('offers the standards the school teaches', async () => {
      const standards = await api.get(`${BASE}/public/schools/${school.code}/standards`);
      expect(standards.status).toBe(200);
      expect(standards.body.map((s: { name: string }) => s.name)).toContain('Nursery');
    });
  });
  describe('switching an account off and on', () => {
    it('stops a teacher at once, and lets them back with their roles', async () => {
      const teacher = await login(school.teacherEmail);

      const off = await api
        .patch(`${BASE}/teachers/${school.teacherId}`)
        .set(auth(admin))
        .send({ status: 'INACTIVE' });
      expect(off.status).toBe(200);
      expect(off.body.status).toBe('INACTIVE');

      // The session already on their phone ends, and signing in is refused.
      const ended = await api.get(`${BASE}/me/classrooms`).set(auth(teacher));
      expect(ended.status).toBe(401);
      expect(ended.body.error.code).toBe('ACCOUNT_INACTIVE');
      const refused = await api
        .post(`${BASE}/auth/login`)
        .send({ identifier: school.teacherEmail, password: TEST_PASSWORD });
      expect(refused.status).toBe(403);
      expect(refused.body.error.message).toContain('not active');

      const on = await api
        .patch(`${BASE}/teachers/${school.teacherId}`)
        .set(auth(admin))
        .send({ status: 'ACTIVE' });
      expect(on.body.status).toBe('ACTIVE');
      const back = await api
        .post(`${BASE}/auth/login`)
        .send({ identifier: school.teacherEmail, password: TEST_PASSWORD });
      expect(back.status).toBe(200);
      expect(back.body.user.roles).toEqual(['TEACHER']);
    });

    it('is only for the school the account belongs to', async () => {
      const response = await api
        .patch(`${BASE}/teachers/${school.teacherId}`)
        .set(auth(otherAdmin))
        .send({ status: 'INACTIVE' });
      expect(response.status).toBe(404);
    });

    it('is not something a teacher can do', async () => {
      const teacher = await login(school.teacherEmail);
      const parentId = (
        await prismaUnscoped.user.findFirstOrThrow({
          where: { phone: school.parentPhone },
          select: { id: true },
        })
      ).id;
      const response = await api
        .patch(`${BASE}/parents/${parentId}`)
        .set(auth(teacher))
        .send({ status: 'INACTIVE' });
      expect(response.status).toBe(403);
    });
  });
});
