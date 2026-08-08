import bcrypt from 'bcryptjs';
import { prismaUnscoped } from '../../src/db/prisma.js';
import { clearSchoolAccessCache } from '../../src/services/schoolAccess.service.js';

/**
 * Integration tests need a real MySQL. When one is not reachable — a fresh
 * clone, or CI before the VPS tunnel is up — the suites skip loudly rather than
 * failing with a connection error that looks like a bug in the code.
 */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prismaUnscoped.$queryRaw`SELECT 1`;
    return true;
  } catch {
    console.warn(
      '\n[tests] No database reachable at DATABASE_URL — integration suites skipped.\n' +
        '        Open the VPS tunnel and set TEST_DATABASE_URL to run them.\n',
    );
    return false;
  }
}

/** Order matters: children before parents, or MySQL rejects the deletes. */
export async function resetDatabase(): Promise<void> {
  await prismaUnscoped.studentGuardian.deleteMany();
  await prismaUnscoped.student.deleteMany();
  await prismaUnscoped.classroom.deleteMany();
  await prismaUnscoped.academicYear.deleteMany();
  await prismaUnscoped.teacherProfile.deleteMany();
  await prismaUnscoped.parentProfile.deleteMany();
  await prismaUnscoped.refreshToken.deleteMany();
  await prismaUnscoped.auditLog.deleteMany();
  await prismaUnscoped.schoolSubscription.deleteMany();
  await prismaUnscoped.user.deleteMany();
  await prismaUnscoped.school.deleteMany();
  await prismaUnscoped.subscriptionPlan.deleteMany();
  await prismaUnscoped.classLevel.deleteMany();
  await prismaUnscoped.publication.deleteMany();
  clearSchoolAccessCache();
}

export const TEST_PASSWORD = 'Passw0rd!23';

const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

export interface Baseline {
  publicationId: string;
  planId: string;
  superAdminEmail: string;
}

export async function seedBaseline(): Promise<Baseline> {
  const publication = await prismaUnscoped.publication.create({
    data: { name: 'Poetree Publication' },
  });

  await prismaUnscoped.classLevel.createMany({
    data: [
      { code: 'PLAY_GROUP', name: 'Play Group', sortOrder: 1 },
      { code: 'NURSERY', name: 'Nursery', sortOrder: 2 },
      { code: 'JUNIOR_KG', name: 'Junior KG', sortOrder: 3 },
      { code: 'SENIOR_KG', name: 'Senior KG', sortOrder: 4 },
    ],
  });

  const plan = await prismaUnscoped.subscriptionPlan.create({
    data: {
      code: 'TEST_PLAN',
      name: 'Test Plan',
      maxStudents: 500,
      maxTeachers: 50,
      priceInPaise: 0,
      features: [],
    },
  });

  const superAdminEmail = 'super@poetree.test';
  await prismaUnscoped.user.create({
    data: {
      scopeKey: 'PUBLICATION',
      schoolId: null,
      name: 'Super Admin',
      email: superAdminEmail,
      passwordHash,
      role: 'PUBLICATION_ADMIN',
      status: 'ACTIVE',
    },
  });

  return { publicationId: publication.id, planId: plan.id, superAdminEmail };
}

export interface TestSchool {
  id: string;
  code: string;
  adminEmail: string;
  adminId: string;
  teacherEmail: string;
  parentPhone: string;
  parentProfileId: string;
  studentId: string;
  classroomId: string;
  academicYearId: string;
}

/** A complete, self-consistent school: admin, teacher, parent, child, classroom. */
export async function seedSchool(
  baseline: Baseline,
  code: string,
  name: string,
): Promise<TestSchool> {
  const school = await prismaUnscoped.school.create({
    data: {
      publicationId: baseline.publicationId,
      name,
      code,
      slug: `${code}-slug`,
      status: 'ACTIVE',
    },
  });

  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await prismaUnscoped.schoolSubscription.create({
    data: {
      schoolId: school.id,
      planId: baseline.planId,
      expiresAt,
      status: 'ACTIVE',
      isCurrent: true,
    },
  });

  const adminEmail = `admin@${code}.test`;
  const admin = await prismaUnscoped.user.create({
    data: {
      schoolId: school.id,
      scopeKey: school.id,
      name: `${name} Admin`,
      email: adminEmail,
      passwordHash,
      role: 'SCHOOL_ADMIN',
      status: 'ACTIVE',
    },
  });

  const teacherEmail = `teacher@${code}.test`;
  const teacher = await prismaUnscoped.user.create({
    data: {
      schoolId: school.id,
      scopeKey: school.id,
      name: `${name} Teacher`,
      email: teacherEmail,
      passwordHash,
      role: 'TEACHER',
      status: 'ACTIVE',
    },
  });
  await prismaUnscoped.teacherProfile.create({
    data: { userId: teacher.id, schoolId: school.id },
  });

  const parentPhone = `+9198${code.length}0000${code.charCodeAt(0)}`;
  const parentUser = await prismaUnscoped.user.create({
    data: {
      schoolId: school.id,
      scopeKey: school.id,
      name: `${name} Parent`,
      phone: parentPhone,
      passwordHash,
      role: 'PARENT',
      status: 'ACTIVE',
    },
  });
  const parentProfile = await prismaUnscoped.parentProfile.create({
    data: { userId: parentUser.id, schoolId: school.id, relation: 'GUARDIAN' },
  });

  const academicYear = await prismaUnscoped.academicYear.create({
    data: {
      schoolId: school.id,
      name: '2026-27',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-04-30'),
      isCurrent: true,
    },
  });

  const nursery = await prismaUnscoped.classLevel.findUniqueOrThrow({ where: { code: 'NURSERY' } });
  const classroom = await prismaUnscoped.classroom.create({
    data: {
      schoolId: school.id,
      academicYearId: academicYear.id,
      classLevelId: nursery.id,
      section: 'A',
    },
  });

  const student = await prismaUnscoped.student.create({
    data: {
      schoolId: school.id,
      admissionNo: `${code.toUpperCase()}-001`,
      firstName: 'Child',
      lastName: name,
      dateOfBirth: new Date('2022-01-01'),
      gender: 'MALE',
      classroomId: classroom.id,
      status: 'ACTIVE',
    },
  });

  await prismaUnscoped.studentGuardian.create({
    data: {
      schoolId: school.id,
      studentId: student.id,
      parentProfileId: parentProfile.id,
      isPrimary: true,
    },
  });

  return {
    id: school.id,
    code,
    adminEmail,
    adminId: admin.id,
    teacherEmail,
    parentPhone,
    parentProfileId: parentProfile.id,
    studentId: student.id,
    classroomId: classroom.id,
    academicYearId: academicYear.id,
  };
}
