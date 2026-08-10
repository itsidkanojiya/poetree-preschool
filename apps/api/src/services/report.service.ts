import { CLASS_LEVEL_LABELS } from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';

/**
 * Reports.
 *
 * Every figure here is derived at read time from the records that produced it.
 * Nothing is cached or denormalised, because a fee total that disagrees with
 * the receipts is worse than a slow query — and at preschool scale the queries
 * are not slow.
 */

export interface DateRange {
  from: Date;
  to: Date;
}

/* -------------------------------------------------------------------------- */
/* Attendance                                                                 */
/* -------------------------------------------------------------------------- */

export interface AttendanceRegisterRow {
  date: string;
  classroom: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  halfDay: number;
  total: number;
  percentage: number;
}

/** Day-by-day totals, the register a school keeps for its own records. */
export async function attendanceRegister(
  range: DateRange,
  classroomId?: string,
): Promise<AttendanceRegisterRow[]> {
  const sessions = await prisma.attendanceSession.findMany({
    where: {
      date: { gte: range.from, lte: range.to },
      ...(classroomId ? { classroomId } : {}),
    },
    include: {
      classroom: { include: { classLevel: { select: { code: true } } } },
      records: { select: { status: true } },
    },
    orderBy: [{ date: 'asc' }],
  });

  return sessions.map((session) => {
    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, HALF_DAY: 0 };
    for (const record of session.records) counts[record.status] += 1;

    const total = session.records.length;
    const attended = counts.PRESENT + counts.LATE + counts.HALF_DAY * 0.5;

    return {
      date: session.date.toISOString().slice(0, 10),
      classroom: `${CLASS_LEVEL_LABELS[session.classroom.classLevel.code]} ${session.classroom.section}`,
      present: counts.PRESENT,
      absent: counts.ABSENT,
      late: counts.LATE,
      leave: counts.LEAVE,
      halfDay: counts.HALF_DAY,
      total,
      percentage: total === 0 ? 0 : Math.round((attended / total) * 100),
    };
  });
}

export interface StudentAttendanceRow {
  admissionNo: string;
  student: string;
  classroom: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  halfDay: number;
  daysMarked: number;
  percentage: number;
}

/**
 * Per-child totals.
 *
 * The denominator is days the school actually ran — sessions that exist. Using
 * calendar days would make every percentage wrong the moment a holiday falls
 * inside the range.
 */
export async function studentAttendance(
  range: DateRange,
  classroomId?: string,
): Promise<StudentAttendanceRow[]> {
  const enrolments = await prisma.studentEnrolment.findMany({
    where: { status: 'ACTIVE', ...(classroomId ? { classroomId } : {}) },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
      classroom: { include: { classLevel: { select: { code: true } } } },
    },
    orderBy: [{ rollNo: 'asc' }],
  });

  if (enrolments.length === 0) return [];

  const records = await prisma.attendanceRecord.findMany({
    where: {
      studentId: { in: enrolments.map((e) => e.studentId) },
      session: { date: { gte: range.from, lte: range.to } },
    },
    select: { studentId: true, status: true },
  });

  const tallies = new Map<string, Record<string, number>>();
  for (const record of records) {
    const tally = tallies.get(record.studentId) ?? {
      PRESENT: 0,
      ABSENT: 0,
      LATE: 0,
      LEAVE: 0,
      HALF_DAY: 0,
    };
    tally[record.status] = (tally[record.status] ?? 0) + 1;
    tallies.set(record.studentId, tally);
  }

  return enrolments.map((enrolment) => {
    const t = tallies.get(enrolment.studentId) ?? {
      PRESENT: 0,
      ABSENT: 0,
      LATE: 0,
      LEAVE: 0,
      HALF_DAY: 0,
    };
    const daysMarked = Object.values(t).reduce((a, b) => a + b, 0);
    const attended = (t.PRESENT ?? 0) + (t.LATE ?? 0) + (t.HALF_DAY ?? 0) * 0.5;

    return {
      admissionNo: enrolment.student.admissionNo,
      student: [enrolment.student.firstName, enrolment.student.lastName]
        .filter(Boolean)
        .join(' '),
      classroom: `${CLASS_LEVEL_LABELS[enrolment.classroom.classLevel.code]} ${enrolment.classroom.section}`,
      present: t.PRESENT ?? 0,
      absent: t.ABSENT ?? 0,
      late: t.LATE ?? 0,
      leave: t.LEAVE ?? 0,
      halfDay: t.HALF_DAY ?? 0,
      daysMarked,
      percentage: daysMarked === 0 ? 0 : Math.round((attended / daysMarked) * 100),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Fees                                                                       */
/* -------------------------------------------------------------------------- */

export interface CollectionRow {
  receiptNo: string;
  paidOn: string;
  student: string;
  admissionNo: string;
  method: string;
  amountInPaise: number;
  reference: string | null;
  recordedBy: string;
}

/**
 * What was actually collected, receipt by receipt.
 *
 * Refunds appear as negative rows rather than being netted away, so the total
 * reconciles against the cash box and every reversal stays visible.
 */
export async function feeCollection(range: DateRange): Promise<CollectionRow[]> {
  const payments = await prisma.payment.findMany({
    where: { paidOn: { gte: range.from, lte: range.to } },
    include: {
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
      recordedBy: { select: { name: true } },
    },
    orderBy: [{ paidOn: 'asc' }, { receiptNo: 'asc' }],
  });

  return payments.map((payment) => ({
    receiptNo: payment.receiptNo,
    paidOn: payment.paidOn.toISOString().slice(0, 10),
    student: [payment.student.firstName, payment.student.lastName].filter(Boolean).join(' '),
    admissionNo: payment.student.admissionNo,
    method: payment.method,
    amountInPaise: payment.amountInPaise,
    reference: payment.reference,
    recordedBy: payment.recordedBy.name,
  }));
}

export interface DuesRow {
  admissionNo: string;
  student: string;
  classroom: string;
  invoiceNo: string;
  period: string;
  dueDate: string;
  netInPaise: number;
  paidInPaise: number;
  outstandingInPaise: number;
  daysOverdue: number;
}

/** Outstanding invoices, oldest first — the chase list. */
export async function outstandingDues(): Promise<DuesRow[]> {
  const invoices = await prisma.feeInvoice.findMany({
    where: { status: { in: ['ISSUED', 'PARTIAL'] } },
    include: {
      student: {
        select: {
          firstName: true,
          lastName: true,
          admissionNo: true,
          enrolments: {
            where: { status: 'ACTIVE' },
            take: 1,
            include: { classroom: { include: { classLevel: { select: { code: true } } } } },
          },
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  const today = new Date();

  return invoices
    .map((invoice) => {
      const outstanding = invoice.netInPaise - invoice.paidInPaise;
      const enrolment = invoice.student.enrolments[0];
      const overdueMs = today.getTime() - invoice.dueDate.getTime();

      return {
        admissionNo: invoice.student.admissionNo,
        student: [invoice.student.firstName, invoice.student.lastName].filter(Boolean).join(' '),
        classroom: enrolment
          ? `${CLASS_LEVEL_LABELS[enrolment.classroom.classLevel.code]} ${enrolment.classroom.section}`
          : '',
        invoiceNo: invoice.invoiceNo,
        period: invoice.periodLabel,
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        netInPaise: invoice.netInPaise,
        paidInPaise: invoice.paidInPaise,
        outstandingInPaise: outstanding,
        // Derived here rather than stored, so it cannot go stale.
        daysOverdue: overdueMs > 0 ? Math.floor(overdueMs / 86_400_000) : 0,
      };
    })
    .filter((row) => row.outstandingInPaise > 0);
}

/* -------------------------------------------------------------------------- */
/* Homework                                                                   */
/* -------------------------------------------------------------------------- */

export interface HomeworkCompletionRow {
  title: string;
  classroom: string;
  dueDate: string;
  assigned: number;
  completed: number;
  pending: number;
  completionPercent: number;
}

export async function homeworkCompletion(range: DateRange): Promise<HomeworkCompletionRow[]> {
  const homework = await prisma.homework.findMany({
    where: { status: 'PUBLISHED', dueDate: { gte: range.from, lte: range.to } },
    include: {
      classroom: { include: { classLevel: { select: { code: true } } } },
      submissions: { select: { status: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  return homework.map((item) => {
    const assigned = item.submissions.length;
    const completed = item.submissions.filter(
      (s) => s.status === 'COMPLETED' || s.status === 'SUBMITTED',
    ).length;

    return {
      title: item.title,
      classroom: `${CLASS_LEVEL_LABELS[item.classroom.classLevel.code]} ${item.classroom.section}`,
      dueDate: item.dueDate.toISOString().slice(0, 10),
      assigned,
      completed,
      pending: assigned - completed,
      completionPercent: assigned === 0 ? 0 : Math.round((completed / assigned) * 100),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

export async function schoolSummary(range: DateRange) {
  const [students, teachers, classrooms, sessions, collected, dues] = await Promise.all([
    prisma.studentEnrolment.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
    prisma.classroom.count(),
    prisma.attendanceSession.count({ where: { date: { gte: range.from, lte: range.to } } }),
    prisma.payment.aggregate({
      where: { paidOn: { gte: range.from, lte: range.to } },
      _sum: { amountInPaise: true },
    }),
    prisma.feeInvoice.aggregate({
      where: { status: { in: ['ISSUED', 'PARTIAL'] } },
      _sum: { netInPaise: true, paidInPaise: true },
    }),
  ]);

  const billed = dues._sum.netInPaise ?? 0;
  const paid = dues._sum.paidInPaise ?? 0;

  return {
    students,
    teachers,
    classrooms,
    registersTaken: sessions,
    collectedInPaise: collected._sum.amountInPaise ?? 0,
    outstandingInPaise: billed - paid,
  };
}

/** A range is required, bounded, and cannot run backwards. */
export function parseRange(from?: string, to?: string): DateRange {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86_400_000);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw ApiError.badRequest('Dates must be in YYYY-MM-DD form');
  }
  if (start > end) {
    throw ApiError.badRequest('The start date must be before the end date');
  }
  // A school with years of history should not be able to ask for all of it in
  // one request by accident.
  if (end.getTime() - start.getTime() > 400 * 86_400_000) {
    throw ApiError.badRequest('Reports cover at most 400 days at a time');
  }

  return { from: start, to: end };
}
