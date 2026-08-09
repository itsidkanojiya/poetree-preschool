/**
 * Idempotent seed.
 *
 * Creates the publication, the four class levels, two plans, the bootstrap
 * Super Admin, and TWO demo schools. The second school is not decoration — it
 * is what makes cross-tenant isolation testable, by hand and in the test suite.
 *
 *   npm run db:seed -w @poetree/api
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@poetree.com';

/**
 * No fallback, deliberately.
 *
 * This file previously carried a literal default password. The repository is
 * public, so that password was published to the world while the portal was
 * reachable on a public IP — anyone could sign in as Super Admin. A seed must
 * never contain a credential that works.
 */
const suppliedPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;
if (!suppliedPassword || suppliedPassword.length < 12) {
  throw new Error(
    'SEED_SUPER_ADMIN_PASSWORD must be set to at least 12 characters before seeding.\n' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(18).toString(\'base64url\'))"',
  );
}
const SUPER_ADMIN_PASSWORD: string = suppliedPassword;

/** Demo schools are development fixtures and are never seeded in production. */
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'School@2026';
const SEED_DEMO_SCHOOLS =
  process.env.NODE_ENV !== 'production' || process.env.SEED_DEMO_SCHOOLS === 'true';
const PUBLICATION_SCOPE = 'PUBLICATION';

const hash = (plain: string) => bcrypt.hash(plain, 10);

const CLASS_LEVELS = [
  { code: 'PLAY_GROUP', name: 'Play Group', sortOrder: 1, minAgeMonths: 24, maxAgeMonths: 36 },
  { code: 'NURSERY', name: 'Nursery', sortOrder: 2, minAgeMonths: 36, maxAgeMonths: 48 },
  { code: 'JUNIOR_KG', name: 'Junior KG', sortOrder: 3, minAgeMonths: 48, maxAgeMonths: 60 },
  { code: 'SENIOR_KG', name: 'Senior KG', sortOrder: 4, minAgeMonths: 60, maxAgeMonths: 72 },
] as const;

const PLANS = [
  {
    code: 'STARTER',
    name: 'Starter',
    description: 'For a single preschool getting started.',
    maxStudents: 150,
    maxTeachers: 15,
    priceInPaise: 2_500_000,
    features: ['Student management', 'Teacher management', 'Classrooms'],
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    description: 'For established preschools with multiple sections.',
    maxStudents: 1000,
    maxTeachers: 100,
    priceInPaise: 7_500_000,
    features: ['Everything in Starter', 'Priority support', 'Advanced reports'],
  },
] as const;

const DEMO_SCHOOLS = [
  {
    code: 'sunrise',
    name: 'Sunrise Preschool',
    city: 'Pune',
    state: 'Maharashtra',
    primaryColor: '#F59E0B',
    planCode: 'PREMIUM',
    adminEmail: 'admin@sunrise.test',
    teachers: [
      { name: 'Anita Deshmukh', email: 'anita@sunrise.test', phone: '+919820000101' },
      { name: 'Rahul Kulkarni', email: 'rahul@sunrise.test', phone: '+919820000102' },
    ],
    families: [
      {
        parent: { name: 'Meera Joshi', phone: '+919820000201', email: 'meera@sunrise.test' },
        child: { firstName: 'Aarav', lastName: 'Joshi', admissionNo: 'SUN-001', gender: 'MALE' },
      },
      {
        parent: { name: 'Sameer Patil', phone: '+919820000202', email: 'sameer@sunrise.test' },
        child: { firstName: 'Diya', lastName: 'Patil', admissionNo: 'SUN-002', gender: 'FEMALE' },
      },
    ],
  },
  {
    code: 'littlewonders',
    name: 'Little Wonders Kindergarten',
    city: 'Nashik',
    state: 'Maharashtra',
    primaryColor: '#2563EB',
    planCode: 'STARTER',
    adminEmail: 'admin@littlewonders.test',
    teachers: [{ name: 'Priya Nair', email: 'priya@littlewonders.test', phone: '+919820000301' }],
    families: [
      {
        parent: { name: 'Vikram Shah', phone: '+919820000401', email: 'vikram@littlewonders.test' },
        child: { firstName: 'Ishaan', lastName: 'Shah', admissionNo: 'LW-001', gender: 'MALE' },
      },
    ],
  },
] as const;

function yearsAgo(years: number): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date;
}

async function main(): Promise<void> {
  console.warn('Seeding Poetree platform…');

  /* ---------------------------------------------------------------------- */
  /* Publication                                                            */
  /* ---------------------------------------------------------------------- */

  let publication = await prisma.publication.findFirst();
  if (!publication) {
    publication = await prisma.publication.create({
      data: { name: 'Poetree Publication' },
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Class levels and plans                                                 */
  /* ---------------------------------------------------------------------- */

  for (const level of CLASS_LEVELS) {
    await prisma.classLevel.upsert({
      where: { code: level.code },
      update: { name: level.name, sortOrder: level.sortOrder },
      create: level,
    });
  }

  const plans = new Map<string, string>();
  for (const plan of PLANS) {
    const row = await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: { name: plan.name, description: plan.description },
      create: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        maxStudents: plan.maxStudents,
        maxTeachers: plan.maxTeachers,
        priceInPaise: plan.priceInPaise,
        features: plan.features as unknown as Prisma.InputJsonValue,
      },
    });
    plans.set(plan.code, row.id);
  }

  /* ---------------------------------------------------------------------- */
  /* Bootstrap Super Admin                                                  */
  /* ---------------------------------------------------------------------- */

  const superAdmin = await prisma.user.upsert({
    where: { user_scope_email: { scopeKey: PUBLICATION_SCOPE, email: SUPER_ADMIN_EMAIL } },
    update: {},
    create: {
      scopeKey: PUBLICATION_SCOPE,
      schoolId: null,
      name: 'Poetree Super Admin',
      email: SUPER_ADMIN_EMAIL,
      passwordHash: await hash(SUPER_ADMIN_PASSWORD),
      role: 'PUBLICATION_ADMIN',
      status: 'ACTIVE',
    },
  });

  /* ---------------------------------------------------------------------- */
  /* Demo schools                                                           */
  /* ---------------------------------------------------------------------- */

  if (!SEED_DEMO_SCHOOLS) {
    console.warn('  · skipping demo schools (production seed)');
  }

  for (const demo of SEED_DEMO_SCHOOLS ? DEMO_SCHOOLS : []) {
    const existing = await prisma.school.findUnique({ where: { code: demo.code } });
    if (existing) {
      console.warn(`  · ${demo.name} already seeded — skipping`);
      continue;
    }

    const school = await prisma.school.create({
      data: {
        publicationId: publication.id,
        name: demo.name,
        code: demo.code,
        slug: `${demo.code}-preschool`,
        city: demo.city,
        state: demo.state,
        primaryColor: demo.primaryColor,
        status: 'ACTIVE',
      },
    });

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await prisma.schoolSubscription.create({
      data: {
        schoolId: school.id,
        planId: plans.get(demo.planCode)!,
        expiresAt,
        status: 'ACTIVE',
        isCurrent: true,
      },
    });

    await prisma.user.create({
      data: {
        schoolId: school.id,
        scopeKey: school.id,
        name: `${demo.name} Admin`,
        email: demo.adminEmail,
        passwordHash: await hash(DEMO_PASSWORD),
        role: 'SCHOOL_ADMIN',
        status: 'ACTIVE',
      },
    });

    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: '2026-27',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2027-04-30'),
        isCurrent: true,
      },
    });

    const teacherIds: string[] = [];
    for (const teacher of demo.teachers) {
      const user = await prisma.user.create({
        data: {
          schoolId: school.id,
          scopeKey: school.id,
          name: teacher.name,
          email: teacher.email,
          phone: teacher.phone,
          passwordHash: await hash(DEMO_PASSWORD),
          role: 'TEACHER',
          status: 'ACTIVE',
        },
      });
      await prisma.teacherProfile.create({
        data: { userId: user.id, schoolId: school.id, joinedAt: new Date() },
      });
      teacherIds.push(user.id);
    }

    const nursery = await prisma.classLevel.findUniqueOrThrow({ where: { code: 'NURSERY' } });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        classLevelId: nursery.id,
        section: 'A',
        capacity: 25,
      },
    });

    // The teaching team is its own table, so a class can later gain an assistant
    // or a subject teacher without a schema change.
    if (teacherIds[0]) {
      await prisma.classroomTeacher.create({
        data: {
          schoolId: school.id,
          classroomId: classroom.id,
          userId: teacherIds[0],
          role: 'CLASS_TEACHER',
        },
      });
    }

    for (const family of demo.families) {
      const parentUser = await prisma.user.create({
        data: {
          schoolId: school.id,
          scopeKey: school.id,
          name: family.parent.name,
          email: family.parent.email,
          phone: family.parent.phone,
          passwordHash: await hash(DEMO_PASSWORD),
          role: 'PARENT',
          status: 'ACTIVE',
        },
      });

      const parentProfile = await prisma.parentProfile.create({
        data: { userId: parentUser.id, schoolId: school.id, relation: 'GUARDIAN' },
      });

      const student = await prisma.student.create({
        data: {
          schoolId: school.id,
          admissionNo: family.child.admissionNo,
          firstName: family.child.firstName,
          lastName: family.child.lastName,
          dateOfBirth: yearsAgo(4),
          gender: family.child.gender,
          admissionDate: new Date(),
          status: 'ACTIVE',
        },
      });

      // Class and roll number belong to the enrolment, not the child, so next
      // year's promotion will not overwrite this record.
      await prisma.studentEnrolment.create({
        data: {
          schoolId: school.id,
          studentId: student.id,
          academicYearId: academicYear.id,
          classroomId: classroom.id,
          status: 'ACTIVE',
        },
      });

      await prisma.studentGuardian.create({
        data: {
          schoolId: school.id,
          studentId: student.id,
          parentProfileId: parentProfile.id,
          relation: 'GUARDIAN',
          isPrimary: true,
        },
      });
    }

    console.warn(`  · ${demo.name} seeded (${demo.code})`);
  }

  console.warn('\nSeed complete.');
  console.warn('  Super Admin :', SUPER_ADMIN_EMAIL, '(password as supplied via env)');
  if (SEED_DEMO_SCHOOLS) {
    for (const demo of DEMO_SCHOOLS) {
      console.warn(`  ${demo.name} admin :`, demo.adminEmail);
    }
  }
  console.warn('\nSign in and change the password immediately.');
  void superAdmin;
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
