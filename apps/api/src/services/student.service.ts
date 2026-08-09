import type { Prisma } from '@prisma/client';
import type {
  CreateStudentInput,
  ListStudentsQuery,
  Paginated,
  StudentSummary,
  UpdateStudentInput,
} from '@poetree/shared';
import { CLASS_LEVEL_LABELS } from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { paginate, toSkipTake } from '../lib/pagination.js';
import { writeAuditLog } from './audit.service.js';
import { getPlanLimits } from './plan.service.js';

/**
 * A student's class and roll number live on their enrolment for the current
 * academic year, never on the student record itself. That is what lets a child
 * be promoted without overwriting last year's history — see docs/architecture.md.
 */
const studentInclude = {
  enrolments: {
    where: { status: 'ACTIVE' as const },
    orderBy: { enrolledOn: 'desc' as const },
    take: 1,
    include: {
      academicYear: { select: { id: true, name: true, isCurrent: true } },
      classroom: {
        include: { classLevel: { select: { code: true, name: true } } },
      },
    },
  },
  guardians: {
    include: {
      parentProfile: { select: { id: true, user: { select: { name: true, phone: true } } } },
    },
  },
} satisfies Prisma.StudentInclude;

type StudentRow = Prisma.StudentGetPayload<{ include: typeof studentInclude }>;

function toSummary(student: StudentRow): StudentSummary {
  const enrolment = student.enrolments[0] ?? null;

  return {
    id: student.id,
    admissionNo: student.admissionNo,
    firstName: student.firstName,
    lastName: student.lastName,
    fullName: [student.firstName, student.lastName].filter(Boolean).join(' '),
    dateOfBirth: student.dateOfBirth.toISOString(),
    gender: student.gender,
    rollNo: enrolment?.rollNo ?? null,
    avatarUrl: student.avatarUrl,
    bloodGroup: student.bloodGroup,
    status: student.status,
    classroom: enrolment
      ? {
          id: enrolment.classroom.id,
          label: `${CLASS_LEVEL_LABELS[enrolment.classroom.classLevel.code]} — ${enrolment.classroom.section}`,
        }
      : null,
    guardians: student.guardians.map((link) => ({
      parentProfileId: link.parentProfileId,
      name: link.parentProfile.user.name,
      phone: link.parentProfile.user.phone,
      relation: link.relation,
      isPrimary: link.isPrimary,
    })),
    createdAt: student.createdAt.toISOString(),
  };
}

/** The year new admissions are enrolled into. */
async function currentAcademicYearId(): Promise<string | null> {
  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  return year?.id ?? null;
}

export async function listStudents(query: ListStudentsQuery): Promise<Paginated<StudentSummary>> {
  const where: Prisma.StudentWhereInput = {};
  if (query.status) where.status = query.status;
  // Filtering by classroom now goes through the enrolment, not the student.
  if (query.classroomId) {
    where.enrolments = { some: { classroomId: query.classroomId, status: 'ACTIVE' } };
  }
  if (query.search) {
    where.OR = [
      { firstName: { contains: query.search } },
      { lastName: { contains: query.search } },
      { admissionNo: { contains: query.search } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: studentInclude,
      orderBy: [{ firstName: 'asc' }],
      ...toSkipTake(query),
    }),
    prisma.student.count({ where }),
  ]);

  return paginate(rows.map(toSummary), total, query);
}

export async function getStudent(studentId: string): Promise<StudentSummary> {
  const student = await prisma.student.findFirst({
    where: { id: studentId },
    include: studentInclude,
  });
  // Another school's student is reported missing — never "forbidden", which
  // would confirm the id exists somewhere.
  if (!student) throw ApiError.notFound('Student not found');
  return toSummary(student);
}

async function assertGuardiansBelongToSchool(parentProfileIds: string[]): Promise<void> {
  const found = await prisma.parentProfile.findMany({
    where: { id: { in: parentProfileIds } },
    select: { id: true },
  });

  if (found.length !== parentProfileIds.length) {
    const known = new Set(found.map((p) => p.id));
    throw ApiError.badRequest('One or more guardians do not exist at your school', {
      unknown: parentProfileIds.filter((id) => !known.has(id)),
    });
  }
}

async function assertClassroomBelongsToSchool(classroomId: string): Promise<void> {
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId },
    select: { id: true },
  });
  if (!classroom) throw ApiError.badRequest('That classroom does not exist at your school');
}

async function assertStudentSeatAvailable(schoolId: string): Promise<void> {
  const limits = await getPlanLimits(schoolId);
  if (limits?.maxStudents == null) return;

  const current = await prisma.student.count({ where: { status: 'ACTIVE' } });
  if (current >= limits.maxStudents) {
    throw ApiError.planLimitExceeded(
      `Your plan allows ${limits.maxStudents} students. Contact Poetree Publication to upgrade.`,
      { limit: limits.maxStudents, current },
    );
  }
}

export async function createStudent(
  input: CreateStudentInput,
  actorUserId: string,
): Promise<StudentSummary> {
  const schoolId = requireSchoolId();

  await assertStudentSeatAvailable(schoolId);
  await assertGuardiansBelongToSchool(input.guardians.map((g) => g.parentProfileId));
  if (input.classroomId) await assertClassroomBelongsToSchool(input.classroomId);

  const duplicate = await prisma.student.findFirst({
    where: { admissionNo: input.admissionNo },
    select: { id: true },
  });
  if (duplicate) {
    throw ApiError.conflict(`Admission number "${input.admissionNo}" is already in use`, {
      field: 'admissionNo',
    });
  }

  // A classroom means an enrolment, and an enrolment needs a year to belong to.
  const academicYearId = input.classroomId ? await currentAcademicYearId() : null;
  if (input.classroomId && !academicYearId) {
    throw ApiError.badRequest(
      'Set a current academic year before assigning a child to a classroom.',
    );
  }

  const studentId = await prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        schoolId,
        admissionNo: input.admissionNo,
        admissionDate: new Date(),
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        avatarUrl: input.avatarUrl ?? null,
        bloodGroup: input.bloodGroup ?? null,
        status: 'ACTIVE',
      },
    });

    // Nested writes are not rewritten by the isolation extension, so schoolId is
    // set explicitly here.
    await tx.studentGuardian.createMany({
      data: input.guardians.map((g) => ({
        schoolId,
        studentId: student.id,
        parentProfileId: g.parentProfileId,
        relation: g.relation,
        isPrimary: g.isPrimary,
      })),
    });

    if (input.classroomId && academicYearId) {
      await tx.studentEnrolment.create({
        data: {
          schoolId,
          studentId: student.id,
          academicYearId,
          classroomId: input.classroomId,
          rollNo: input.rollNo ?? null,
          status: 'ACTIVE',
        },
      });
    }

    return student.id;
  });

  await writeAuditLog({
    action: 'STUDENT_CREATED',
    entity: 'Student',
    entityId: studentId,
    schoolId,
    actorUserId,
    metadata: { admissionNo: input.admissionNo },
  });

  return getStudent(studentId);
}

export async function updateStudent(
  studentId: string,
  input: UpdateStudentInput,
  actorUserId: string,
): Promise<StudentSummary> {
  const schoolId = requireSchoolId();

  const existing = await prisma.student.findFirst({
    where: { id: studentId },
    include: { enrolments: { where: { status: 'ACTIVE' }, take: 1 } },
  });
  if (!existing) throw ApiError.notFound('Student not found');

  if (input.guardians) {
    await assertGuardiansBelongToSchool(input.guardians.map((g) => g.parentProfileId));
  }
  if (input.classroomId) await assertClassroomBelongsToSchool(input.classroomId);

  const { guardians, classroomId, rollNo, ...fields } = input;
  const enrolment = existing.enrolments[0] ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: studentId, schoolId },
      data: {
        firstName: fields.firstName,
        lastName: fields.lastName,
        dateOfBirth: fields.dateOfBirth,
        gender: fields.gender,
        avatarUrl: fields.avatarUrl,
        bloodGroup: fields.bloodGroup,
        status: fields.status,
      },
    });

    // Moving a child between sections mid-year updates the existing enrolment;
    // it does not open a second one. Only promotion does that.
    if (classroomId !== undefined || rollNo !== undefined) {
      if (enrolment) {
        await tx.studentEnrolment.update({
          where: { id: enrolment.id },
          data: {
            classroomId: classroomId ?? undefined,
            rollNo: rollNo ?? undefined,
          },
        });
      } else if (classroomId) {
        const academicYearId = await tx.academicYear
          .findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } })
          .then((year) => year?.id ?? null);

        if (!academicYearId) {
          throw ApiError.badRequest(
            'Set a current academic year before assigning a child to a classroom.',
          );
        }

        await tx.studentEnrolment.create({
          data: {
            schoolId,
            studentId,
            academicYearId,
            classroomId,
            rollNo: rollNo ?? null,
            status: 'ACTIVE',
          },
        });
      }
    }

    if (guardians) {
      await tx.studentGuardian.deleteMany({ where: { studentId, schoolId } });
      await tx.studentGuardian.createMany({
        data: guardians.map((g) => ({
          schoolId,
          studentId,
          parentProfileId: g.parentProfileId,
          relation: g.relation,
          isPrimary: g.isPrimary,
        })),
      });
    }
  });

  await writeAuditLog({
    action: 'STUDENT_UPDATED',
    entity: 'Student',
    entityId: studentId,
    schoolId,
    actorUserId,
    metadata: { fields: Object.keys(input) },
  });

  return getStudent(studentId);
}
