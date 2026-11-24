import { prisma } from '../db/prisma.js';
import { birthdayThisYear } from '../lib/birthdays.js';
import { addDays, schoolToday } from '../lib/feeSchedule.js';
import { studentName } from '../lib/names.js';
import { pendingRegistrationCount } from './registration.service.js';
import { holdsParent, holdsTeacher } from './roles.service.js';

/**
 * The school's front page, in one request: how big the school is, the year's
 * fees collected against what was billed, the money month by month, today's
 * register, class sizes, what is waiting on the office, birthdays and the
 * latest announcements. Dates are the school's (IST).
 */

/** What the office has waiting — also the sidebar's counts. */
export async function attention(): Promise<{
  registrations: number;
  payments: number;
  overdue: number;
}> {
  const today = schoolToday(new Date());
  const [registrations, payments, overdue] = await Promise.all([
    pendingRegistrationCount(),
    prisma.paymentProof.count({ where: { status: 'WAITING' } }),
    prisma.feeInvoice.count({
      where: {
        status: { in: ['ISSUED', 'PARTIAL'] },
        dueDate: { lt: new Date(`${today}T00:00:00Z`) },
      },
    }),
  ]);
  return { registrations, payments, overdue };
}

/** The last twelve months, oldest first, as YYYY-MM. */
function lastTwelveMonths(today: string): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return Array.from({ length: 12 }, (_, i) => {
    const back = 11 - i;
    const total = year * 12 + (month - 1) - back;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  });
}

const PRESENT = new Set(['PRESENT', 'LATE', 'HALF_DAY']);

export async function overview() {
  const now = new Date();
  const today = schoolToday(now);
  const todayDate = new Date(`${today}T00:00:00Z`);
  const months = lastTwelveMonths(today);
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);

  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });

  const [
    students,
    newThisMonth,
    teachers,
    parents,
    classrooms,
    invoices,
    payments,
    sessions,
    enrolments,
    children,
    announcements,
    waiting,
  ] = await Promise.all([
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.student.count({ where: { status: 'ACTIVE', createdAt: { gte: monthStart } } }),
    prisma.user.count({ where: { ...holdsTeacher, status: 'ACTIVE' } }),
    prisma.user.count({ where: { ...holdsParent, status: 'ACTIVE' } }),
    prisma.classroom.count(year ? { where: { academicYearId: year.id } } : undefined),
    year
      ? prisma.feeInvoice.findMany({
          where: { academicYearId: year.id, status: { not: 'CANCELLED' } },
          select: { netInPaise: true, paidInPaise: true },
        })
      : Promise.resolve([]),
    prisma.payment.findMany({
      where: { paidOn: { gte: new Date(`${months[0]}-01T00:00:00Z`) } },
      select: { amountInPaise: true, paidOn: true },
    }),
    prisma.attendanceSession.findMany({
      where: { date: todayDate },
      select: { records: { select: { status: true } } },
    }),
    year
      ? prisma.studentEnrolment.findMany({
          where: { academicYearId: year.id, status: 'ACTIVE', student: { status: 'ACTIVE' } },
          select: {
            studentId: true,
            classroom: {
              select: {
                id: true,
                section: true,
                classLevel: { select: { name: true, sortOrder: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.student.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, firstName: true, middleName: true, lastName: true, dateOfBirth: true },
    }),
    prisma.notice.findMany({
      where: { status: 'PUBLISHED', publishAt: { lte: now } },
      orderBy: { publishAt: 'desc' },
      take: 3,
      select: { id: true, title: true, publishAt: true },
    }),
    attention(),
  ]);

  // Fees, this academic year.
  const billedInPaise = invoices.reduce((sum, i) => sum + i.netInPaise, 0);
  const collectedInPaise = invoices.reduce((sum, i) => sum + i.paidInPaise, 0);

  // Money received, month by month. A refund is a negative payment, so it
  // comes off the month it was made in.
  const byMonth = new Map(months.map((m) => [m, 0]));
  for (const payment of payments) {
    const key = payment.paidOn.toISOString().slice(0, 7);
    if (byMonth.has(key)) byMonth.set(key, byMonth.get(key)! + payment.amountInPaise);
  }

  // Today's register.
  const statuses = sessions.flatMap((s) => s.records.map((r) => r.status));
  const present = statuses.filter((s) => PRESENT.has(s)).length;

  // Children per class, in the order the school's standards run.
  const classes = new Map<
    string,
    { classroomId: string; label: string; order: number; section: string; count: number }
  >();
  for (const enrolment of enrolments) {
    const room = enrolment.classroom;
    const row = classes.get(room.id) ?? {
      classroomId: room.id,
      label: `${room.classLevel.name} ${room.section}`,
      order: room.classLevel.sortOrder,
      section: room.section,
      count: 0,
    };
    row.count += 1;
    classes.set(room.id, row);
  }
  const classOf = new Map(
    enrolments.map((e) => [e.studentId, `${e.classroom.classLevel.name} ${e.classroom.section}`]),
  );

  // Birthdays today and in the six days after.
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const birthdays = children
    .map((child) => {
      const born = child.dateOfBirth.toISOString().slice(0, 10);
      // The coming birthday may fall in next year, in the last days of December.
      const next = week.find((day) => birthdayThisYear(born, Number(day.slice(0, 4))) === day);
      return next
        ? {
            id: child.id,
            name: studentName(child),
            classroom: classOf.get(child.id) ?? null,
            date: next.slice(5),
            turning: Number(next.slice(0, 4)) - Number(born.slice(0, 4)),
            today: next === today,
            sortKey: next,
          }
        : null;
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.name.localeCompare(b.name))
    .map(({ sortKey: _sortKey, ...rest }) => rest);

  return {
    students,
    newThisMonth,
    teachers,
    parents,
    classrooms,
    fees: {
      billedInPaise,
      collectedInPaise,
      outstandingInPaise: Math.max(billedInPaise - collectedInPaise, 0),
    },
    feesByMonth: months.map((month) => ({ month, collectedInPaise: byMonth.get(month)! })),
    attendanceToday: {
      present,
      absent: statuses.length - present,
      marked: statuses.length,
      enrolled: enrolments.length,
    },
    classSizes: [...classes.values()]
      .sort((a, b) => a.order - b.order || a.section.localeCompare(b.section))
      .map(({ classroomId, label, count }) => ({ classroomId, label, count })),
    attention: waiting,
    birthdays: {
      today: birthdays.filter((b) => b.today).map(({ today: _t, ...b }) => b),
      soon: birthdays.filter((b) => !b.today).map(({ today: _t, ...b }) => b),
    },
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      publishAt: a.publishAt.toISOString(),
    })),
  };
}
