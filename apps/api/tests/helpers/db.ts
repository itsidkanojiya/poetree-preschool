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

/**
 * Empties every table, discovered from the database rather than listed by hand.
 *
 * The previous version deleted a hand-written list in dependency order, which
 * silently rotted: it was missing attendance, homework, notices, fees and
 * timetable, and only appeared to work because those tables happened to be
 * empty. The first test to insert a payment broke it, on a foreign key that was
 * doing exactly its job.
 *
 * Truncating with foreign-key checks off removes both problems at once — no
 * ordering to maintain, and a new module needs no change here at all.
 */
export async function resetDatabase(): Promise<void> {
  const rows = await prismaUnscoped.$queryRaw<Array<{ db: string | null }>>`SELECT DATABASE() AS db`;
  const db = rows[0]?.db;

  // This wipes everything in the connected database. Refuse to run unless the
  // name says it is disposable — a mistyped TEST_DATABASE_URL should not be
  // able to empty a school's live data.
  if (!/test|shadow|_dev$/i.test(db ?? '')) {
    throw new Error(
      `resetDatabase() refused to truncate "${db}": the name does not look like a scratch database. ` +
        'Point TEST_DATABASE_URL at a throwaway schema.',
    );
  }

  const tables = await prismaUnscoped.$queryRaw<Array<{ name: string }>>`
    SELECT TABLE_NAME AS name
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
      AND TABLE_NAME <> '_prisma_migrations'
  `;

  // FOREIGN_KEY_CHECKS is per-connection, and Prisma pools connections — issuing
  // these as separate awaits let the disable and the deletes land on different
  // connections, so the constraint was still live when the delete ran. Batching
  // them into one $transaction pins them to a single connection.
  //
  // DELETE rather than TRUNCATE: TRUNCATE forces an implicit commit in MySQL,
  // which would end the transaction and take the disabled checks with it.
  await prismaUnscoped.$transaction([
    prismaUnscoped.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0'),
    ...tables.map(({ name }) => prismaUnscoped.$executeRawUnsafe(`DELETE FROM \`${name}\``)),
    prismaUnscoped.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1'),
  ]);

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
  teacherId: string;
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
  const teacherUserId = teacher.id;

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

  // The teacher must hold a live assignment, or row-level scope will (correctly)
  // refuse them access to the classroom.
  await prismaUnscoped.classroomTeacher.create({
    data: {
      schoolId: school.id,
      classroomId: classroom.id,
      userId: teacherUserId,
      role: 'CLASS_TEACHER',
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
      status: 'ACTIVE',
    },
  });

  // Class membership is an enrolment in a specific academic year.
  await prismaUnscoped.studentEnrolment.create({
    data: {
      schoolId: school.id,
      studentId: student.id,
      academicYearId: academicYear.id,
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
    teacherId: teacherUserId,
    parentPhone,
    parentProfileId: parentProfile.id,
    studentId: student.id,
    classroomId: classroom.id,
    academicYearId: academicYear.id,
  };
}
