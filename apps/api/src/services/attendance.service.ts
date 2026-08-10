import type {
  AttendanceDaySummary,
  AttendanceSheet,
  AttendanceStatus,
  CorrectAttendanceInput,
  MarkAttendanceInput,
  StudentAttendanceSummary,
} from '@poetree/shared';
import { ATTENDANCE_STATUSES, CLASS_LEVEL_LABELS, roleHasPermission } from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { getRequestContext, requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { writeAuditLog } from './audit.service.js';
import { assertTeacherOwnsClassroom } from './scope.service.js';
import { guardianUserIdsFor, notifySafe } from './notification.service.js';

/**
 * Tells a guardian their child is not at school today.
 *
 * Only newly absent children are notified. Re-saving a register — which a
 * teacher does whenever they correct one name — must not send a second alert
 * about a child whose status did not change, or parents learn to ignore it.
 *
 * One notification per child, per guardian, naming the child, because a parent
 * with two children needs to know which one.
 */
async function notifyAbsences(
  schoolId: string,
  date: Date,
  records: MarkAttendanceInput['records'],
  before: Record<string, string> | null,
): Promise<void> {
  const newlyAbsent = records.filter(
    (record) => record.status === 'ABSENT' && before?.[record.studentId] !== 'ABSENT',
  );
  if (newlyAbsent.length === 0) return;

  const students = await prisma.student.findMany({
    where: { id: { in: newlyAbsent.map((r) => r.studentId) } },
    select: { id: true, firstName: true, lastName: true },
  });

  const when = date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  for (const student of students) {
    const guardians = await guardianUserIdsFor([student.id]);
    if (guardians.length === 0) continue;

    const name = [student.firstName, student.lastName].filter(Boolean).join(' ');
    notifySafe({
      schoolId,
      userIds: guardians,
      type: 'ATTENDANCE_ABSENT',
      title: `${student.firstName} was marked absent`,
      body: `${name} was not in class on ${when}. Please contact the school if this is unexpected.`,
      entityType: 'Student',
      entityId: student.id,
    });
  }
}

/**
 * Attendance is the highest-frequency screen in the product — a teacher opens it
 * every morning while a room of four-year-olds is arriving. Everything here is
 * shaped around that: one request for the whole register, everyone defaulting to
 * present, and as few decisions as possible.
 */

/** Teachers may edit today and yesterday; older dates need a School Admin. */
const TEACHER_GRACE_DAYS = 1;

const EMPTY_COUNTS: Record<AttendanceStatus, number> = {
  PRESENT: 0,
  ABSENT: 0,
  LATE: 0,
  LEAVE: 0,
  HALF_DAY: 0,
};

/** Strips the time so a register belongs to a calendar day, not an instant. */
function toDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((toDateOnly(a).getTime() - toDateOnly(b).getTime()) / 86_400_000);
}

async function findHoliday(date: Date) {
  return prisma.schoolHoliday.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date } },
    select: { title: true },
  });
}

async function currentAcademicYear() {
  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  if (!year) {
    throw ApiError.badRequest('Set a current academic year before taking attendance.');
  }
  return year;
}

/**
 * Whether the caller may still change this date.
 *
 * A teacher correcting last Tuesday is usually a mistake being covered up; a
 * School Admin doing it is an administrative correction. So the grace window is
 * short and the escalation is explicit.
 */
function canEdit(date: Date): boolean {
  const context = getRequestContext();
  if (!context) return false;

  const age = daysBetween(new Date(), date);
  if (age < 0) return false; // the future is never markable

  if (roleHasPermission(context.role, 'attendance:correct')) return true;
  return age <= TEACHER_GRACE_DAYS;
}

export async function getAttendanceSheet(classroomId: string, rawDate: Date): Promise<AttendanceSheet> {
  await assertTeacherOwnsClassroom(classroomId);
  const date = toDateOnly(rawDate);

  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId },
    include: { classLevel: { select: { code: true } } },
  });
  if (!classroom) throw ApiError.notFound('Classroom not found');

  const [holiday, enrolments, session] = await Promise.all([
    findHoliday(date),
    prisma.studentEnrolment.findMany({
      where: { classroomId, status: 'ACTIVE' },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, admissionNo: true, avatarUrl: true },
        },
      },
      orderBy: [{ rollNo: 'asc' }],
    }),
    prisma.attendanceSession.findFirst({
      where: { classroomId, date },
      include: {
        markedBy: { select: { name: true } },
        records: true,
      },
    }),
  ]);

  const byStudent = new Map(session?.records.map((record) => [record.studentId, record]) ?? []);
  const counts = { ...EMPTY_COUNTS };

  const rows = enrolments.map((enrolment) => {
    const record = byStudent.get(enrolment.studentId);
    // Unmarked children default to present — the teacher taps only the absentees.
    const status: AttendanceStatus = record?.status ?? 'PRESENT';
    counts[status] += 1;

    return {
      studentId: enrolment.studentId,
      fullName: [enrolment.student.firstName, enrolment.student.lastName]
        .filter(Boolean)
        .join(' '),
      admissionNo: enrolment.student.admissionNo,
      rollNo: enrolment.rollNo,
      avatarUrl: enrolment.student.avatarUrl,
      status,
      remark: record?.remark ?? null,
      recordId: record?.id ?? null,
    };
  });

  return {
    classroomId,
    classroomLabel: `${CLASS_LEVEL_LABELS[classroom.classLevel.code]} — ${classroom.section}`,
    date: date.toISOString().slice(0, 10),
    isHoliday: Boolean(holiday),
    holidayTitle: holiday?.title ?? null,
    alreadyMarked: Boolean(session),
    markedByName: session?.markedBy?.name ?? null,
    markedAt: session?.markedAt.toISOString() ?? null,
    editable: !holiday && canEdit(date),
    note: session?.note ?? null,
    rows,
    counts,
  };
}

/**
 * Creates or replaces the register for one classroom on one day.
 *
 * Idempotent by design: the unique constraint on (classroomId, date) means a
 * retry from a flaky mobile connection updates the same session rather than
 * creating a second one.
 */
export async function markAttendance(
  input: MarkAttendanceInput,
  actorUserId: string,
): Promise<AttendanceSheet> {
  const schoolId = requireSchoolId();
  await assertTeacherOwnsClassroom(input.classroomId);

  const date = toDateOnly(input.date);

  if (daysBetween(new Date(), date) < 0) {
    throw ApiError.badRequest('Attendance cannot be taken for a future date.');
  }
  if (!canEdit(date)) {
    throw ApiError.forbidden(
      'That date is outside the editing window. Ask a school administrator to correct it.',
    );
  }

  const holiday = await findHoliday(date);
  if (holiday) {
    throw ApiError.badRequest(`${holiday.title} is a holiday — attendance is not taken.`);
  }

  const academicYear = await currentAcademicYear();

  // Only children actually enrolled in this classroom may appear on its register.
  const enrolled = await prisma.studentEnrolment.findMany({
    where: { classroomId: input.classroomId, status: 'ACTIVE' },
    select: { studentId: true },
  });
  const enrolledIds = new Set(enrolled.map((e) => e.studentId));
  const strangers = input.records.filter((r) => !enrolledIds.has(r.studentId));

  if (strangers.length > 0) {
    throw ApiError.badRequest('Some children are not enrolled in this classroom', {
      studentIds: strangers.map((s) => s.studentId),
    });
  }

  const existing = await prisma.attendanceSession.findFirst({
    where: { classroomId: input.classroomId, date },
    include: { records: { select: { studentId: true, status: true } } },
  });

  const before = existing
    ? Object.fromEntries(existing.records.map((r) => [r.studentId, r.status]))
    : null;

  await prisma.$transaction(async (tx) => {
    const session = existing
      ? await tx.attendanceSession.update({
          where: { id: existing.id },
          data: { markedById: actorUserId, markedAt: new Date(), note: input.note ?? null },
        })
      : await tx.attendanceSession.create({
          data: {
            schoolId,
            academicYearId: academicYear.id,
            classroomId: input.classroomId,
            date,
            markedById: actorUserId,
            note: input.note ?? null,
          },
        });

    // Replace the register wholesale — the client always sends the full sheet,
    // so this keeps the stored state exactly what the teacher saw.
    await tx.attendanceRecord.deleteMany({ where: { sessionId: session.id, schoolId } });
    await tx.attendanceRecord.createMany({
      data: input.records.map((record) => ({
        schoolId,
        sessionId: session.id,
        studentId: record.studentId,
        status: record.status,
        remark: record.remark ?? null,
        updatedById: actorUserId,
      })),
    });
  });

  await writeAuditLog({
    action: existing ? 'ATTENDANCE_CORRECTED' : 'ATTENDANCE_MARKED',
    entity: 'AttendanceSession',
    entityId: input.classroomId,
    schoolId,
    actorUserId,
    before: before ?? undefined,
    after: Object.fromEntries(input.records.map((r) => [r.studentId, r.status])),
    metadata: { date: date.toISOString().slice(0, 10) },
  });

  await notifyAbsences(schoolId, date, input.records, before);

  return getAttendanceSheet(input.classroomId, date);
}

/** Single-child correction, for fixing one row without resubmitting the register. */
export async function correctAttendanceRecord(
  recordId: string,
  input: CorrectAttendanceInput,
  actorUserId: string,
): Promise<void> {
  const schoolId = requireSchoolId();

  const record = await prisma.attendanceRecord.findFirst({
    where: { id: recordId },
    include: { session: { select: { classroomId: true, date: true } } },
  });
  if (!record) throw ApiError.notFound('Attendance record not found');

  await assertTeacherOwnsClassroom(record.session.classroomId);

  if (!canEdit(record.session.date)) {
    throw ApiError.forbidden(
      'That date is outside the editing window. Ask a school administrator to correct it.',
    );
  }

  await prisma.attendanceRecord.update({
    where: { id: recordId },
    data: { status: input.status, remark: input.remark ?? null, updatedById: actorUserId },
  });

  await writeAuditLog({
    action: 'ATTENDANCE_CORRECTED',
    entity: 'AttendanceRecord',
    entityId: recordId,
    schoolId,
    actorUserId,
    before: { status: record.status, remark: record.remark },
    after: { status: input.status, remark: input.remark ?? null },
    metadata: { date: record.session.date.toISOString().slice(0, 10) },
  });
}

function percentage(present: number, late: number, halfDay: number, total: number): number {
  if (total === 0) return 0;
  // A half day counts as half a day's attendance; late still means the child came.
  return Math.round(((present + late + halfDay * 0.5) / total) * 100);
}

/** Day-by-day totals for one classroom, for the monthly register view. */
export async function classroomDailySummary(
  classroomId: string,
  from: Date,
  to: Date,
): Promise<AttendanceDaySummary[]> {
  await assertTeacherOwnsClassroom(classroomId);

  const sessions = await prisma.attendanceSession.findMany({
    where: { classroomId, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
    include: { records: { select: { status: true } } },
    orderBy: { date: 'asc' },
  });

  return sessions.map((session) => {
    const counts = { ...EMPTY_COUNTS };
    for (const record of session.records) counts[record.status] += 1;
    const total = session.records.length;

    return {
      date: session.date.toISOString().slice(0, 10),
      present: counts.PRESENT,
      absent: counts.ABSENT,
      late: counts.LATE,
      leave: counts.LEAVE,
      halfDay: counts.HALF_DAY,
      total,
      percentage: percentage(counts.PRESENT, counts.LATE, counts.HALF_DAY, total),
    };
  });
}

/**
 * Per-child totals over a range.
 *
 * The denominator is days the school actually ran — sessions that exist. Counting
 * calendar days would make every percentage wrong the moment a holiday falls in
 * the range.
 */
export async function studentAttendanceSummary(
  classroomId: string,
  from: Date,
  to: Date,
): Promise<StudentAttendanceSummary[]> {
  await assertTeacherOwnsClassroom(classroomId);

  const enrolments = await prisma.studentEnrolment.findMany({
    where: { classroomId, status: 'ACTIVE' },
    include: { student: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: [{ rollNo: 'asc' }],
  });

  const records = await prisma.attendanceRecord.findMany({
    where: {
      studentId: { in: enrolments.map((e) => e.studentId) },
      session: { classroomId, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
    },
    select: { studentId: true, status: true },
  });

  const tallies = new Map<string, Record<AttendanceStatus, number>>();
  for (const record of records) {
    const tally = tallies.get(record.studentId) ?? { ...EMPTY_COUNTS };
    tally[record.status] += 1;
    tallies.set(record.studentId, tally);
  }

  return enrolments.map((enrolment) => {
    const tally = tallies.get(enrolment.studentId) ?? { ...EMPTY_COUNTS };
    const markedDays = ATTENDANCE_STATUSES.reduce((sum, status) => sum + tally[status], 0);

    return {
      studentId: enrolment.studentId,
      fullName: [enrolment.student.firstName, enrolment.student.lastName]
        .filter(Boolean)
        .join(' '),
      present: tally.PRESENT,
      absent: tally.ABSENT,
      late: tally.LATE,
      leave: tally.LEAVE,
      halfDay: tally.HALF_DAY,
      markedDays,
      percentage: percentage(tally.PRESENT, tally.LATE, tally.HALF_DAY, markedDays),
    };
  });
}
