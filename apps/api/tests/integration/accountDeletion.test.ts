import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@poetree/shared';
import {
  isDatabaseReachable,
  resetDatabase,
  seedBaseline,
  seedSchool,
  TEST_PASSWORD,
  type Baseline,
  type TestSchool,
} from '../helpers/db.js';
import { api, auth, BASE, login } from '../helpers/api.js';
import { disconnectPrisma, prismaUnscoped } from '../../src/db/prisma.js';
import { clearSchoolAccessCache } from '../../src/services/schoolAccess.service.js';

const dbUp = await isDatabaseReachable();

const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

/**
 * A family closing their account — from the app, and from the website once the
 * app is gone.
 *
 * Google Play's rule is that closing an account removes what it held. These
 * check both halves of what that means here: everything that was the parent's
 * is gone, and the child's school record — which is the school's — is not.
 */
describe.skipIf(!dbUp)('account deletion', () => {
  let baseline: Baseline;
  let school: TestSchool;
  let other: TestSchool;

  /** A parent of the school's seeded child, with an email and a phone. */
  const addParent = async (target: TestSchool, phone: string, email?: string) => {
    const user = await prismaUnscoped.user.create({
      data: {
        schoolId: target.id,
        scopeKey: target.id,
        name: 'Meera Shah',
        phone,
        email: email ?? null,
        passwordHash,
        role: 'PARENT',
        status: 'ACTIVE',
      },
    });
    const profile = await prismaUnscoped.parentProfile.create({
      data: {
        userId: user.id,
        schoolId: target.id,
        relation: 'MOTHER',
        address: '12 Lake Road, Ahmedabad',
      },
    });
    await prismaUnscoped.studentGuardian.create({
      data: { schoolId: target.id, studentId: target.studentId, parentProfileId: profile.id },
    });
    return { userId: user.id, profileId: profile.id };
  };

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    school = await seedSchool(baseline, 'delta', 'Delta Preschool');
    other = await seedSchool(baseline, 'omega', 'Omega Preschool');
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  describe('from the app', () => {
    it('erases everything that was the parent’s and keeps the child’s record', async () => {
      const phone = '+919820011001';
      const email = 'meera@family.test';
      const { userId, profileId } = await addParent(school, phone, email);
      const session = await login(phone);

      // Things the account accumulates: a phone for push, a notification, the
      // registration that started it, and an audit trail about it.
      await prismaUnscoped.deviceToken.create({
        data: { schoolId: school.id, userId, token: 'fcm-token-meera', platform: 'ANDROID' },
      });
      await prismaUnscoped.notification.create({
        data: {
          schoolId: school.id,
          userId,
          type: 'NOTICE_PUBLISHED',
          title: 'Sports day',
          body: 'Wear white on Friday.',
        },
      });
      const registration = await prismaUnscoped.parentRegistration.create({
        data: {
          schoolId: school.id,
          guardianName: 'Meera Shah',
          phone,
          email,
          passwordHash,
          studentName: 'Child Delta',
          status: 'APPROVED',
        },
      });
      await prismaUnscoped.auditLog.create({
        data: {
          schoolId: school.id,
          action: 'REGISTRATION_SUBMITTED',
          entity: 'ParentRegistration',
          entityId: registration.id,
          metadata: { phone, studentName: 'Child' },
        },
      });
      await prismaUnscoped.auditLog.create({
        data: {
          action: 'LOGIN_FAILED',
          entity: 'User',
          metadata: { identifier: phone, reason: 'NO_SUCH_USER' },
          ipAddress: '10.0.0.7',
        },
      });

      const response = await api
        .post(`${BASE}/auth/delete-account`)
        .set(auth(session))
        .send({ password: TEST_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        deleted: true,
        schoolName: 'Delta Preschool',
        registrationOnly: false,
      });

      // Nothing left that names or reaches the parent.
      const row = await prismaUnscoped.user.findUniqueOrThrow({ where: { id: userId } });
      expect(row.name).toBe('Deleted account');
      expect(row.phone).toBeNull();
      expect(row.email).toBeNull();
      expect(row.status).toBe('INACTIVE');
      expect(row.deletedAt).not.toBeNull();
      expect(await bcrypt.compare(TEST_PASSWORD, row.passwordHash)).toBe(false);

      expect(await prismaUnscoped.parentProfile.count({ where: { id: profileId } })).toBe(0);
      expect(
        await prismaUnscoped.studentGuardian.count({ where: { parentProfileId: profileId } }),
      ).toBe(0);
      expect(await prismaUnscoped.refreshToken.count({ where: { userId } })).toBe(0);
      expect(await prismaUnscoped.deviceToken.count({ where: { userId } })).toBe(0);
      expect(await prismaUnscoped.notification.count({ where: { userId } })).toBe(0);
      expect(await prismaUnscoped.parentRegistration.count({ where: { phone } })).toBe(0);

      // The audit trail keeps its events and loses who they were about.
      const trail = await prismaUnscoped.auditLog.findMany({
        where: { action: { in: ['REGISTRATION_SUBMITTED', 'LOGIN_FAILED'] } },
      });
      expect(trail).toHaveLength(2);
      for (const entry of trail) {
        expect(entry.metadata).toBeNull();
        expect(entry.ipAddress).toBeNull();
      }
      const closed = await prismaUnscoped.auditLog.findFirstOrThrow({
        where: { action: 'ACCOUNT_DELETED', entityId: userId },
      });
      expect(closed.metadata).toEqual({ via: 'APP' });
      expect(closed.ipAddress).toBeNull();

      // The child is the school's, and is still there — with the other
      // guardian the school seeded.
      const child = await prismaUnscoped.student.findUniqueOrThrow({
        where: { id: school.studentId },
        include: { guardians: true },
      });
      expect(child.deletedAt).toBeNull();
      expect(child.guardians.map((g) => g.parentProfileId)).toEqual([school.parentProfileId]);
    });

    it('ends the session on the phone at once, and the sign-in for good', async () => {
      const phone = '+919820011002';
      await addParent(school, phone);
      const session = await login(phone);

      await api
        .post(`${BASE}/auth/delete-account`)
        .set(auth(session))
        .send({ password: TEST_PASSWORD })
        .expect(200);

      // The access token is hours from expiring in production; it must stop
      // working now, not then.
      const stale = await api.get(`${BASE}/auth/me`).set(auth(session));
      expect(stale.status).toBe(401);

      const renew = await api
        .post(`${BASE}/auth/refresh`)
        .send({ refreshToken: session.refreshToken });
      expect(renew.status).toBe(401);

      const again = await api
        .post(`${BASE}/auth/login`)
        .send({ identifier: phone, password: TEST_PASSWORD });
      expect(again.status).toBe(401);
      expect(again.body.error.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);
    });

    it('closes an account whose holder chose a fee plan', async () => {
      // StudentFeePlan.chosenBy is a Restrict key: a hard delete of the user
      // would fail here, and the fee record is the school's to keep.
      const phone = '+919820011003';
      const { userId } = await addParent(school, phone);
      const plan = await prismaUnscoped.feePlan.create({
        data: { schoolId: school.id, academicYearId: school.academicYearId, name: 'Quarterly' },
      });
      const selection = await prismaUnscoped.studentFeePlan.create({
        data: {
          schoolId: school.id,
          studentId: school.studentId,
          academicYearId: school.academicYearId,
          planId: plan.id,
          chosenById: userId,
          chosenByRole: 'PARENT',
        },
      });
      const session = await login(phone);

      const response = await api
        .post(`${BASE}/auth/delete-account`)
        .set(auth(session))
        .send({ password: TEST_PASSWORD });
      expect(response.status).toBe(200);

      const kept = await prismaUnscoped.studentFeePlan.findUniqueOrThrow({
        where: { id: selection.id },
        include: { chosenBy: { select: { name: true, phone: true } } },
      });
      expect(kept.chosenBy).toEqual({ name: 'Deleted account', phone: null });
    });

    it('still lets a family leave a school whose plan has lapsed', async () => {
      const phone = '+919820011004';
      await addParent(other, phone);
      const session = await login(phone);

      await prismaUnscoped.school.update({
        where: { id: other.id },
        data: { status: 'SUSPENDED' },
      });
      clearSchoolAccessCache();

      try {
        // Everything else is refused…
        const blocked = await api.get(`${BASE}/me/children`).set(auth(session));
        expect(blocked.body.error.code).toBe(ERROR_CODES.SCHOOL_SUSPENDED);

        // …but not this.
        const response = await api
          .post(`${BASE}/auth/delete-account`)
          .set(auth(session))
          .send({ password: TEST_PASSWORD });
        expect(response.status).toBe(200);
      } finally {
        await prismaUnscoped.school.update({ where: { id: other.id }, data: { status: 'ACTIVE' } });
        clearSchoolAccessCache();
      }
    });

    it('asks for the password again, and changes nothing when it is wrong', async () => {
      const phone = '+919820011005';
      const { userId } = await addParent(school, phone);
      const session = await login(phone);

      const response = await api
        .post(`${BASE}/auth/delete-account`)
        .set(auth(session))
        .send({ password: 'not-the-password' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);

      const row = await prismaUnscoped.user.findUniqueOrThrow({ where: { id: userId } });
      expect(row.phone).toBe(phone);
      expect(row.deletedAt).toBeNull();
      expect((await api.get(`${BASE}/auth/me`).set(auth(session))).status).toBe(200);
    });

    it('refuses without a session or without a password', async () => {
      const anonymous = await api
        .post(`${BASE}/auth/delete-account`)
        .send({ password: TEST_PASSWORD });
      expect(anonymous.status).toBe(401);

      const phone = '+919820011006';
      await addParent(school, phone);
      const session = await login(phone);
      const empty = await api.post(`${BASE}/auth/delete-account`).set(auth(session)).send({});
      expect(empty.status).toBe(400);
    });

    it('leaves staff accounts to the school office', async () => {
      const teacher = await login(school.teacherEmail);

      const response = await api
        .post(`${BASE}/auth/delete-account`)
        .set(auth(teacher))
        .send({ password: TEST_PASSWORD });

      expect(response.status).toBe(403);
      const row = await prismaUnscoped.user.findUniqueOrThrow({ where: { id: school.teacherId } });
      expect(row.deletedAt).toBeNull();
    });
  });

  describe('from the website', () => {
    const deleteViaWebsite = (body: Record<string, unknown>) =>
      api.post(`${BASE}/public/account-deletion`).send(body);

    it('finds the account however the number is typed', async () => {
      const phone = '+919820022001';
      const { userId } = await addParent(school, phone);

      const response = await deleteViaWebsite({
        identifier: '98200 22001',
        password: TEST_PASSWORD,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        deleted: true,
        schoolName: 'Delta Preschool',
        registrationOnly: false,
      });
      const row = await prismaUnscoped.user.findUniqueOrThrow({ where: { id: userId } });
      expect(row.phone).toBeNull();

      const closed = await prismaUnscoped.auditLog.findFirstOrThrow({
        where: { action: 'ACCOUNT_DELETED', entityId: userId },
      });
      expect(closed.metadata).toEqual({ via: 'WEBSITE' });
    });

    it('accepts the email address as well as the phone', async () => {
      const { userId } = await addParent(school, '+919820022002', 'arjun@family.test');

      const response = await deleteViaWebsite({
        identifier: 'Arjun@Family.test',
        password: TEST_PASSWORD,
      });

      expect(response.status).toBe(200);
      const row = await prismaUnscoped.user.findUniqueOrThrow({ where: { id: userId } });
      expect(row.email).toBeNull();
    });

    it('asks which school when one number is a parent at two', async () => {
      const phone = '+919820022003';
      const atDelta = await addParent(school, phone);
      const atOmega = await addParent(other, phone);

      const ambiguous = await deleteViaWebsite({ identifier: phone, password: TEST_PASSWORD });
      expect(ambiguous.status).toBe(409);
      expect([...ambiguous.body.error.details.schoolCodes].sort()).toEqual(['delta', 'omega']);

      const chosen = await deleteViaWebsite({
        identifier: phone,
        password: TEST_PASSWORD,
        schoolCode: 'OMEGA',
      });
      expect(chosen.status).toBe(200);
      expect(chosen.body.schoolName).toBe('Omega Preschool');

      // Only the one asked for.
      const omegaRow = await prismaUnscoped.user.findUniqueOrThrow({
        where: { id: atOmega.userId },
      });
      const deltaRow = await prismaUnscoped.user.findUniqueOrThrow({
        where: { id: atDelta.userId },
      });
      expect(omegaRow.deletedAt).not.toBeNull();
      expect(deltaRow.deletedAt).toBeNull();
      expect(deltaRow.phone).toBe(phone);
    });

    it('withdraws a registration the school never approved', async () => {
      const phone = '+919820022004';
      const waiting = await prismaUnscoped.parentRegistration.create({
        data: {
          schoolId: school.id,
          guardianName: 'Kavya Iyer',
          phone,
          passwordHash,
          studentName: 'Ira Iyer',
          bloodGroup: 'B+',
          status: 'PENDING',
        },
      });
      await prismaUnscoped.otpChallenge.create({
        data: {
          schoolId: school.id,
          channel: 'PHONE',
          destination: phone,
          codeHash: 'x'.repeat(64),
          expiresAt: new Date(Date.now() + 600_000),
        },
      });

      const response = await deleteViaWebsite({ identifier: phone, password: TEST_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        deleted: true,
        schoolName: 'Delta Preschool',
        registrationOnly: true,
      });
      expect(await prismaUnscoped.parentRegistration.count({ where: { id: waiting.id } })).toBe(0);
      expect(await prismaUnscoped.otpChallenge.count({ where: { destination: phone } })).toBe(0);
    });

    it('refuses a wrong password and an unknown number alike', async () => {
      const phone = '+919820022005';
      const { userId } = await addParent(school, phone);

      const wrong = await deleteViaWebsite({ identifier: phone, password: 'not-it' });
      const unknown = await deleteViaWebsite({
        identifier: '+919820099999',
        password: TEST_PASSWORD,
      });

      for (const response of [wrong, unknown]) {
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);
      }
      const row = await prismaUnscoped.user.findUniqueOrThrow({ where: { id: userId } });
      expect(row.deletedAt).toBeNull();
    });

    it('answers without a token, and ignores one sent by mistake', async () => {
      const phone = '+919820022006';
      await addParent(school, phone);
      const stale = await login(school.adminEmail);

      const response = await api
        .post(`${BASE}/public/account-deletion`)
        .set(auth(stale))
        .send({ identifier: phone, password: TEST_PASSWORD });

      expect(response.status).toBe(200);
      // The admin whose token rode along is untouched.
      const admin = await prismaUnscoped.user.findUniqueOrThrow({ where: { id: school.adminId } });
      expect(admin.deletedAt).toBeNull();
    });
  });
});
