import bcrypt from 'bcryptjs';
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

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const CLASSMATE_PHONE = '+919812345600';

describe.skipIf(!dbUp)('a child’s photograph', () => {
  let baseline: Baseline;
  let schoolA: TestSchool;
  let schoolB: TestSchool;
  let adminA: Session;
  let teacherA: Session;
  let parentA: Session;
  let photoId: string;

  beforeAll(async () => {
    await resetDatabase();
    baseline = await seedBaseline();
    schoolA = await seedSchool(baseline, 'alpha', 'Alpha Preschool');
    schoolB = await seedSchool(baseline, 'beta', 'Beta Preschool');

    adminA = await login(schoolA.adminEmail);
    teacherA = await login(schoolA.teacherEmail);
    parentA = await login(schoolA.parentPhone);

    const upload = await api
      .post(`${BASE}/files`)
      .set(auth(adminA))
      .attach('file', TINY_PNG, 'aarav.png');
    photoId = upload.body.id as string;

    await api
      .put(`${BASE}/students/${schoolA.studentId}/photo`)
      .set(auth(adminA))
      .send({ fileId: photoId });

    // A second family in the same classroom — every filter except the guardian
    // link passes for them.
    const user = await prismaUnscoped.user.create({
      data: {
        schoolId: schoolA.id,
        scopeKey: schoolA.id,
        name: 'Classmate Parent',
        phone: CLASSMATE_PHONE,
        passwordHash: bcrypt.hashSync(TEST_PASSWORD, 4),
        role: 'PARENT',
        status: 'ACTIVE',
      },
    });
    const profile = await prismaUnscoped.parentProfile.create({
      data: { userId: user.id, schoolId: schoolA.id, relation: 'GUARDIAN' },
    });
    const classmate = await prismaUnscoped.student.create({
      data: {
        schoolId: schoolA.id,
        admissionNo: 'A-0999',
        firstName: 'Classmate',
        dateOfBirth: new Date('2021-06-01'),
        gender: 'FEMALE',
      },
    });
    await prismaUnscoped.studentGuardian.create({
      data: {
        schoolId: schoolA.id,
        studentId: classmate.id,
        parentProfileId: profile.id,
        isPrimary: true,
      },
    });
    await prismaUnscoped.studentEnrolment.create({
      data: {
        schoolId: schoolA.id,
        studentId: classmate.id,
        classroomId: schoolA.classroomId,
        academicYearId: schoolA.academicYearId,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('shows on the child’s record once uploaded', async () => {
    const student = await api.get(`${BASE}/students/${schoolA.studentId}`).set(auth(adminA));

    // Carried on avatarUrl so every screen that already renders a face gets one
    // without being touched.
    expect(student.body.avatarUrl).toBe(`/api/v1/files/${photoId}`);
  });

  it('is visible to their own family and their own teacher', async () => {
    const family = await api.get(`${BASE}/files/${photoId}`).set(auth(parentA));
    expect(family.status).toBe(200);

    // The face on the register: without this a teacher sees broken squares for
    // the children sitting in front of them.
    const teacher = await api.get(`${BASE}/files/${photoId}`).set(auth(teacherA));
    expect(teacher.status).toBe(200);
  });

  it('is not visible to another family in the same class', async () => {
    // The test that matters. Same school, same classroom, same teacher — every
    // filter except the guardian link passes.
    const classmate = await login(CLASSMATE_PHONE);
    const response = await api.get(`${BASE}/files/${photoId}`).set(auth(classmate));

    expect(response.status).toBe(404);
    // Missing, not forbidden: a 403 would confirm the photograph exists.
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('is not visible to another school at all', async () => {
    const adminB = await login(schoolB.adminEmail);
    const response = await api.get(`${BASE}/files/${photoId}`).set(auth(adminB));

    expect(response.status).toBe(404);
  });

  it('refuses a file that is not a picture', async () => {
    const pdf = await api
      .post(`${BASE}/files`)
      .set(auth(adminA))
      .attach('file', Buffer.from('%PDF-1.4\n%\n1 0 obj\n<<>>\nendobj\n'), 'note.pdf');

    const response = await api
      .put(`${BASE}/students/${schoolA.studentId}/photo`)
      .set(auth(adminA))
      .send({ fileId: pdf.body.id });

    expect(response.status).toBe(400);
  });

  it('can be taken away again', async () => {
    await api
      .put(`${BASE}/students/${schoolA.studentId}/photo`)
      .set(auth(adminA))
      .send({ fileId: null });

    const student = await api.get(`${BASE}/students/${schoolA.studentId}`).set(auth(adminA));
    expect(student.body.avatarUrl).toBeNull();

    // And with it, the family's access to those bytes.
    const family = await api.get(`${BASE}/files/${photoId}`).set(auth(parentA));
    expect(family.status).toBe(404);
  });
});
