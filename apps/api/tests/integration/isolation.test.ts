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
import { api, auth, BASE, login, type Session } from '../helpers/api.js';
import { prismaUnscoped, disconnectPrisma } from '../../src/db/prisma.js';
import { signAccessToken } from '../../src/lib/tokens.js';

const dbUp = await isDatabaseReachable();

/**
 * The gate described in the plan. If any of these fail, one school can see or
 * change another school's data and nothing else in the platform matters.
 */
describe.skipIf(!dbUp)('cross-tenant isolation', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let adminA: Session;
  let adminB: Session;
  let superAdmin: Session;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    adminA = await login(schoolA.adminEmail);
    adminB = await login(schoolB.adminEmail);
    superAdmin = await login(baseline.superAdminEmail);
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  it('lists only its own students', async () => {
    const response = await api.get(`${BASE}/students`).set(auth(adminA));

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].id).toBe(schoolA.studentId);
    expect(response.body.total).toBe(1);
  });

  it('reports another school’s student as missing, not forbidden', async () => {
    const response = await api.get(`${BASE}/students/${schoolB.studentId}`).set(auth(adminA));

    // 404 rather than 403: a 403 would confirm the id exists somewhere.
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('refuses to update another school’s student and leaves it untouched', async () => {
    const before = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: schoolB.studentId },
    });

    const response = await api
      .patch(`${BASE}/students/${schoolB.studentId}`)
      .set(auth(adminA))
      .send({ firstName: 'Hijacked' });

    expect(response.status).toBe(404);

    const after = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: schoolB.studentId },
    });
    expect(after.firstName).toBe(before.firstName);
    expect(after.schoolId).toBe(schoolB.id);
  });

  it('ignores a schoolId supplied in the request body', async () => {
    const response = await api
      .post(`${BASE}/students`)
      .set(auth(adminA))
      .send({
        // Spoofed — must be discarded by validation and overridden by the
        // isolation extension.
        schoolId: schoolB.id,
        firstName: 'Spoof',
        lastName: 'Attempt',
        dateOfBirth: '2022-03-01',
        gender: 'FEMALE',
        admissionNo: 'ALPHA-SPOOF',
        guardians: [{ parentProfileId: schoolA.parentProfileId, isPrimary: false }],
      });

    expect(response.status).toBe(201);

    const created = await prismaUnscoped.student.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(created.schoolId).toBe(schoolA.id);
    expect(created.schoolId).not.toBe(schoolB.id);
  });

  it('refuses to link a guardian belonging to another school', async () => {
    const response = await api
      .post(`${BASE}/students`)
      .set(auth(adminA))
      .send({
        firstName: 'Cross',
        lastName: 'Link',
        dateOfBirth: '2022-04-01',
        gender: 'MALE',
        admissionNo: 'ALPHA-CROSS',
        guardians: [{ parentProfileId: schoolB.parentProfileId, isPrimary: true }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('refuses to attach a classroom belonging to another school', async () => {
    const response = await api
      .post(`${BASE}/students`)
      .set(auth(adminA))
      .send({
        firstName: 'Cross',
        lastName: 'Class',
        dateOfBirth: '2022-05-01',
        gender: 'MALE',
        admissionNo: 'ALPHA-CLASS',
        classroomId: schoolB.classroomId,
        guardians: [{ parentProfileId: schoolA.parentProfileId, isPrimary: true }],
      });

    expect(response.status).toBe(400);
  });

  it('keeps teacher and parent rosters separate', async () => {
    const [teachersA, teachersB, parentsA] = await Promise.all([
      api.get(`${BASE}/teachers`).set(auth(adminA)),
      api.get(`${BASE}/teachers`).set(auth(adminB)),
      api.get(`${BASE}/parents`).set(auth(adminA)),
    ]);

    expect(teachersA.body.items.map((t: { email: string }) => t.email)).toEqual([
      schoolA.teacherEmail,
    ]);
    expect(teachersB.body.items.map((t: { email: string }) => t.email)).toEqual([
      schoolB.teacherEmail,
    ]);
    expect(parentsA.body.items).toHaveLength(1);
    expect(parentsA.body.items[0].phone).toBe(schoolA.parentPhone);
  });

  it('blocks a school admin from the Super Admin surface', async () => {
    const response = await api.get(`${BASE}/publication/schools`).set(auth(adminA));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('blocks a teacher token from school-admin routes', async () => {
    // Minted directly: teachers have no portal login in Phase 1, but the Phase 2
    // app will present exactly this token shape.
    const teacher = await prismaUnscoped.user.findFirstOrThrow({
      where: { schoolId: schoolA.id, role: 'TEACHER' },
    });
    const token = signAccessToken({
      userId: teacher.id,
      role: 'TEACHER',
      schoolId: schoolA.id,
    });

    const response = await api.get(`${BASE}/students`).set({ Authorization: `Bearer ${token}` });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('lets a teacher sign in to the portal but still refuses parents', async () => {
    // Teachers joined PORTAL_ROLES at the ERP phase — they need attendance and
    // homework on a desktop as well as in the app.
    const teacherLogin = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: schoolA.teacherEmail, password: TEST_PASSWORD });

    expect(teacherLogin.status).toBe(200);
    expect(teacherLogin.body.user.role).toBe('TEACHER');
    expect(teacherLogin.body.user.school.code).toBe(schoolA.code);

    // Parents remain app-only.
    const parentLogin = await api
      .post(`${BASE}/auth/login`)
      .send({ identifier: schoolA.parentPhone, password: TEST_PASSWORD });

    expect(parentLogin.status).toBe(403);
    expect(parentLogin.body.error.code).toBe(ERROR_CODES.PORTAL_ACCESS_DENIED);
  });

  it('lets the Super Admin see every school', async () => {
    const response = await api.get(`${BASE}/publication/schools`).set(auth(superAdmin));

    expect(response.status).toBe(200);
    expect(response.body.items.map((s: { code: string }) => s.code).sort()).toEqual([
      'alpha',
      'beta',
    ]);
  });
});
