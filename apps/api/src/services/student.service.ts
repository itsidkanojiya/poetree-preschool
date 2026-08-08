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

const studentInclude = {
  classroom: {
    include: {
      classLevel: { select: { code: true, name: true } },
      academicYear: { select: { name: true } },
    },
  },
  guardians: {
    include: {
      parentProfile: {
        select: { id: true, user: { select: { name: true, phone: true } } },
      },
    },
  },
} satisfies Prisma.StudentInclude;

type StudentRow = Prisma.StudentGetPayload<{ include: typeof studentInclude }>;

function toSummary(student: StudentRow): StudentSummary {
  return {
    id: student.id,
    admissionNo: student.admissionNo,
    firstName: student.firstName,
    lastName: student.lastName,
    fullName: [student.firstName, student.lastName].filter(Boolean).join(' '),
    dateOfBirth: student.dateOfBirth.toISOString(),
    gender: student.gender,
    rollNo: student.rollNo,
    avatarUrl: student.avatarUrl,
    bloodGroup: student.bloodGroup,
    status: student.status,
    classroom: student.classroom
      ? {
          id: student.classroom.id,
          label: `${CLASS_LEVEL_LABELS[student.classroom.classLevel.code]} — ${student.classroom.section}`,
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

export async function listStudents(query: ListStudentsQuery): Promise<Paginated<StudentSummary>> {
  const where: Prisma.StudentWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.classroomId) where.classroomId = query.classroomId;
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

/**
 * Guardians and classrooms are resolved through the tenant-scoped client, so an
 * id belonging to another school simply does not resolve and the request fails
 * validation rather than linking across tenants.
 */
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

  const studentId = await prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        schoolId,
        admissionNo: input.admissionNo,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        rollNo: input.rollNo ?? null,
        avatarUrl: input.avatarUrl ?? null,
        bloodGroup: input.bloodGroup ?? null,
        classroomId: input.classroomId ?? null,
        status: 'ACTIVE',
      },
    });

    // Nested writes are not rewritten by the isolation extension, so schoolId is
    // set here explicitly.
    await tx.studentGuardian.createMany({
      data: input.guardians.map((g) => ({
        schoolId,
        studentId: student.id,
        parentProfileId: g.parentProfileId,
        relation: g.relation,
        isPrimary: g.isPrimary,
      })),
    });

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
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Student not found');

  if (input.guardians) {
    await assertGuardiansBelongToSchool(input.guardians.map((g) => g.parentProfileId));
  }
  if (input.classroomId) await assertClassroomBelongsToSchool(input.classroomId);

  const { guardians, ...fields } = input;

  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: studentId, schoolId },
      data: {
        firstName: fields.firstName,
        lastName: fields.lastName,
        dateOfBirth: fields.dateOfBirth,
        gender: fields.gender,
        rollNo: fields.rollNo,
        avatarUrl: fields.avatarUrl,
        bloodGroup: fields.bloodGroup,
        classroomId: fields.classroomId,
        status: fields.status,
      },
    });

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
