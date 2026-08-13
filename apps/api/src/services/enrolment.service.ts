import type {
  EnrolmentSummary,
  ListEnrolmentsQuery,
  Paginated,
  PromoteStudentsInput,
  PromotionResult,
  TransferSectionInput,
  WithdrawStudentInput,
} from '@poetree/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { paginate, toSkipTake } from '../lib/pagination.js';
import { writeAuditLog } from './audit.service.js';
import { nextDocumentNumber } from './sequence.service.js';

/**
 * The enrolment lifecycle: admission number issue, promotion, section transfer,
 * withdrawal and return.
 *
 * The rule that shapes everything: a year's record is never edited to become the
 * next year's. Promotion closes one enrolment and opens another, so the register
 * a child sat in last March still points at last March's classroom.
 */

const enrolmentInclude = {
  student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
  academicYear: { select: { id: true, name: true } },
  classroom: { include: { classLevel: { select: { code: true, name: true } } } },
} satisfies Prisma.StudentEnrolmentInclude;

type EnrolmentRow = Prisma.StudentEnrolmentGetPayload<{ include: typeof enrolmentInclude }>;

function label(classroom: EnrolmentRow['classroom']): string {
  return `${classroom.classLevel.name} — ${classroom.section}`;
}

function toSummary(row: EnrolmentRow): EnrolmentSummary {
  return {
    id: row.id,
    studentId: row.studentId,
    fullName: [row.student.firstName, row.student.lastName].filter(Boolean).join(' '),
    admissionNo: row.student.admissionNo,
    rollNo: row.rollNo,
    status: row.status,
    classroom: { id: row.classroom.id, label: label(row.classroom) },
    academicYear: { id: row.academicYear.id, name: row.academicYear.name },
    enrolledOn: row.enrolledOn.toISOString(),
    exitedOn: row.exitedOn?.toISOString() ?? null,
    exitReason: row.exitReason,
  };
}

/** Next admission number for the school, e.g. ADM-0007. Gapless and unique. */
export async function issueAdmissionNumber(schoolId: string): Promise<string> {
  return prisma.$transaction((tx) =>
    nextDocumentNumber(tx, {
      schoolId,
      kind: 'ADMISSION',
      academicYearId: null,
      defaultPrefix: 'ADM-',
    }),
  );
}

export async function listEnrolments(
  query: ListEnrolmentsQuery,
): Promise<Paginated<EnrolmentSummary>> {
  const where: Prisma.StudentEnrolmentWhereInput = {};
  if (query.classroomId) where.classroomId = query.classroomId;
  if (query.academicYearId) where.academicYearId = query.academicYearId;
  if (query.status) where.status = query.status;

  const [rows, total] = await Promise.all([
    prisma.studentEnrolment.findMany({
      where,
      include: enrolmentInclude,
      orderBy: [{ enrolledOn: 'desc' }],
      ...toSkipTake(query),
    }),
    prisma.studentEnrolment.count({ where }),
  ]);

  return paginate(rows.map(toSummary), total, query);
}

/** Every enrolment a child has ever had — the "student history" of the brief. */
export async function studentEnrolmentHistory(studentId: string): Promise<EnrolmentSummary[]> {
  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const rows = await prisma.studentEnrolment.findMany({
    where: { studentId },
    include: enrolmentInclude,
    orderBy: { enrolledOn: 'desc' },
  });

  return rows.map(toSummary);
}

/**
 * Move a cohort into next year's classroom.
 *
 * Children who cannot be promoted are reported rather than silently skipped —
 * an admin needs to know that two of thirty did not move, and why.
 */
export async function promoteStudents(
  input: PromoteStudentsInput,
  actorUserId: string,
): Promise<PromotionResult> {
  const schoolId = requireSchoolId();

  if (input.fromClassroomId === input.toClassroomId) {
    throw ApiError.badRequest('Promote into a different classroom than the one you are promoting from.');
  }

  const target = await prisma.classroom.findFirst({
    where: { id: input.toClassroomId },
    include: { classLevel: { select: { code: true, name: true } } },
  });
  if (!target) throw ApiError.badRequest('The target classroom does not exist at your school');

  const source = await prisma.classroom.findFirst({
    where: { id: input.fromClassroomId },
    select: { id: true, academicYearId: true },
  });
  if (!source) throw ApiError.badRequest('The source classroom does not exist at your school');

  if (target.academicYearId === source.academicYearId) {
    throw ApiError.badRequest(
      'Both classrooms are in the same academic year. Use a section transfer instead of promotion.',
    );
  }

  const candidates = await prisma.studentEnrolment.findMany({
    where: {
      classroomId: input.fromClassroomId,
      status: 'ACTIVE',
      ...(input.studentIds ? { studentId: { in: input.studentIds } } : {}),
    },
    include: { student: { select: { id: true, firstName: true, lastName: true } } },
  });

  if (candidates.length === 0) {
    throw ApiError.badRequest('No active children found in that classroom');
  }

  // A child already enrolled in the target year must not be promoted twice —
  // the unique constraint would reject it, so filter first and report why.
  const alreadyThere = await prisma.studentEnrolment.findMany({
    where: {
      academicYearId: target.academicYearId,
      studentId: { in: candidates.map((c) => c.studentId) },
    },
    select: { studentId: true },
  });
  const blocked = new Set(alreadyThere.map((row) => row.studentId));

  const movable = candidates.filter((c) => !blocked.has(c.studentId));
  const skipped = candidates
    .filter((c) => blocked.has(c.studentId))
    .map((c) => ({
      studentId: c.studentId,
      fullName: [c.student.firstName, c.student.lastName].filter(Boolean).join(' '),
      reason: 'Already enrolled in the target academic year',
    }));

  if (movable.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.studentEnrolment.updateMany({
        where: { id: { in: movable.map((m) => m.id) }, schoolId },
        data: { status: 'PROMOTED', exitedOn: new Date() },
      });

      await tx.studentEnrolment.createMany({
        data: movable.map((m) => ({
          schoolId,
          studentId: m.studentId,
          academicYearId: target.academicYearId,
          classroomId: target.id,
          // Roll numbers are re-issued by the receiving class, not carried over.
          rollNo: null,
          status: 'ACTIVE' as const,
        })),
      });
    });
  }

  await writeAuditLog({
    action: 'STUDENTS_PROMOTED',
    entity: 'StudentEnrolment',
    entityId: input.toClassroomId,
    schoolId,
    actorUserId,
    metadata: {
      fromClassroomId: input.fromClassroomId,
      toClassroomId: input.toClassroomId,
      promoted: movable.length,
      skipped: skipped.length,
    },
  });

  return { promoted: movable.length, skipped, toClassroomLabel: label(target as EnrolmentRow['classroom']) };
}

/**
 * A child leaving. The Student row is never deleted — attendance, fees and
 * history must stay reportable, and they may come back next year.
 */
export async function withdrawStudent(
  studentId: string,
  input: WithdrawStudentInput,
  actorUserId: string,
): Promise<EnrolmentSummary> {
  const schoolId = requireSchoolId();

  const enrolment = await prisma.studentEnrolment.findFirst({
    where: { studentId, status: 'ACTIVE' },
    include: enrolmentInclude,
  });
  if (!enrolment) throw ApiError.notFound('No active enrolment found for that child');

  await prisma.$transaction(async (tx) => {
    await tx.studentEnrolment.update({
      where: { id: enrolment.id },
      data: {
        status: input.status,
        exitedOn: input.exitedOn ?? new Date(),
        exitReason: input.reason,
      },
    });

    await tx.student.update({
      where: { id: studentId, schoolId },
      data: { status: input.status === 'TRANSFERRED' ? 'WITHDRAWN' : 'WITHDRAWN' },
    });
  });

  await writeAuditLog({
    action: 'STUDENT_WITHDRAWN',
    entity: 'Student',
    entityId: studentId,
    schoolId,
    actorUserId,
    before: { status: enrolment.status },
    after: { status: input.status, reason: input.reason },
  });

  const updated = await prisma.studentEnrolment.findFirstOrThrow({
    where: { id: enrolment.id },
    include: enrolmentInclude,
  });
  return toSummary(updated);
}

/** Section change inside the same year: edit the enrolment, do not open a new one. */
export async function transferSection(
  studentId: string,
  input: TransferSectionInput,
  actorUserId: string,
): Promise<EnrolmentSummary> {
  const schoolId = requireSchoolId();

  const enrolment = await prisma.studentEnrolment.findFirst({
    where: { studentId, status: 'ACTIVE' },
    include: enrolmentInclude,
  });
  if (!enrolment) throw ApiError.notFound('No active enrolment found for that child');

  const target = await prisma.classroom.findFirst({
    where: { id: input.toClassroomId },
    select: { id: true, academicYearId: true },
  });
  if (!target) throw ApiError.badRequest('That classroom does not exist at your school');

  if (target.academicYearId !== enrolment.academicYearId) {
    throw ApiError.badRequest(
      'That classroom belongs to a different academic year. Use promotion instead of a transfer.',
    );
  }

  await prisma.studentEnrolment.update({
    where: { id: enrolment.id },
    data: { classroomId: input.toClassroomId, rollNo: input.rollNo ?? null },
  });

  await writeAuditLog({
    action: 'ENROLMENT_UPDATED',
    entity: 'StudentEnrolment',
    entityId: enrolment.id,
    schoolId,
    actorUserId,
    before: { classroomId: enrolment.classroomId, rollNo: enrolment.rollNo },
    after: { classroomId: input.toClassroomId, rollNo: input.rollNo ?? null },
  });

  const updated = await prisma.studentEnrolment.findFirstOrThrow({
    where: { id: enrolment.id },
    include: enrolmentInclude,
  });
  return toSummary(updated);
}
