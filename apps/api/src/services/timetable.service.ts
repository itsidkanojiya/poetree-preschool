import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { writeAuditLog } from './audit.service.js';

/**
 * Weekly timetable.
 *
 * The database can stop a classroom being double-booked, because that is one
 * row. It cannot stop the same teacher or the same room being used by two
 * classrooms in the same period, because those are different rows - so those
 * two checks live here, and the conflicting entry is named rather than the save
 * simply failing.
 */

export interface TimetableSlotInput {
  dayOfWeek: number;
  periodId: string;
  subjectId?: string | null;
  teacherId?: string | null;
  roomId?: string | null;
  note?: string | null;
}

async function assertNoConflicts(
  classroomId: string,
  academicYearId: string,
  slots: TimetableSlotInput[],
): Promise<void> {
  const keys = slots.map((s) => ({ dayOfWeek: s.dayOfWeek, periodId: s.periodId }));
  if (keys.length === 0) return;

  // Everything already scheduled in these day/period cells, other than this
  // classroom's own entries which are about to be replaced.
  const clashes = await prisma.timetableEntry.findMany({
    where: {
      academicYearId,
      classroomId: { not: classroomId },
      OR: keys,
    },
    include: {
      classroom: { include: { classLevel: { select: { name: true } } } },
      period: { select: { name: true } },
      teacher: { select: { id: true, name: true } },
      room: { select: { id: true, name: true } },
    },
  });

  for (const slot of slots) {
    const sameCell = clashes.filter(
      (c) => c.dayOfWeek === slot.dayOfWeek && c.periodId === slot.periodId,
    );

    if (slot.teacherId) {
      const busy = sameCell.find((c) => c.teacherId === slot.teacherId);
      if (busy) {
        throw ApiError.conflict(
          `${busy.teacher?.name ?? 'That teacher'} is already teaching ${busy.classroom.classLevel.name} - ${busy.classroom.section} in ${busy.period.name}.`,
          { dayOfWeek: slot.dayOfWeek, periodId: slot.periodId, reason: 'TEACHER_BUSY' },
        );
      }
    }

    if (slot.roomId) {
      const busy = sameCell.find((c) => c.roomId === slot.roomId);
      if (busy) {
        throw ApiError.conflict(
          `${busy.room?.name ?? 'That room'} is already in use by ${busy.classroom.classLevel.name} - ${busy.classroom.section} in ${busy.period.name}.`,
          { dayOfWeek: slot.dayOfWeek, periodId: slot.periodId, reason: 'ROOM_BUSY' },
        );
      }
    }
  }
}

/** Replaces a classroom's whole week, which is how the grid editor saves. */
export async function setTimetable(
  classroomId: string,
  slots: TimetableSlotInput[],
  actorUserId: string,
): Promise<void> {
  const schoolId = requireSchoolId();

  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId },
    select: { id: true, academicYearId: true },
  });
  if (!classroom) throw ApiError.notFound('Classroom not found');

  // Two slots in the same cell would violate the unique key; catch it here with
  // a readable message rather than surfacing a constraint error.
  const seen = new Set<string>();
  for (const slot of slots) {
    const key = `${slot.dayOfWeek}:${slot.periodId}`;
    if (seen.has(key)) {
      throw ApiError.badRequest('The same day and period appears twice in this timetable');
    }
    seen.add(key);
  }

  await assertNoConflicts(classroomId, classroom.academicYearId, slots);

  await prisma.$transaction(async (tx) => {
    await tx.timetableEntry.deleteMany({ where: { classroomId, schoolId } });
    if (slots.length > 0) {
      await tx.timetableEntry.createMany({
        data: slots.map((slot) => ({
          schoolId,
          academicYearId: classroom.academicYearId,
          classroomId,
          dayOfWeek: slot.dayOfWeek,
          periodId: slot.periodId,
          subjectId: slot.subjectId ?? null,
          teacherId: slot.teacherId ?? null,
          roomId: slot.roomId ?? null,
          note: slot.note ?? null,
        })),
      });
    }
  });

  await writeAuditLog({
    action: 'TIMETABLE_UPDATED',
    entity: 'Classroom',
    entityId: classroomId,
    schoolId,
    actorUserId,
    metadata: { slots: slots.length },
  });
}

export async function getTimetable(classroomId: string) {
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId },
    select: { id: true, academicYearId: true },
  });
  if (!classroom) throw ApiError.notFound('Classroom not found');

  const [periods, entries] = await Promise.all([
    prisma.timetablePeriod.findMany({
      where: { academicYearId: classroom.academicYearId },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.timetableEntry.findMany({
      where: { classroomId },
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    classroomId,
    periods: periods.map((p) => ({
      id: p.id,
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      isBreak: p.isBreak,
    })),
    entries: entries.map((e) => ({
      dayOfWeek: e.dayOfWeek,
      periodId: e.periodId,
      subject: e.subject,
      teacher: e.teacher,
      room: e.room,
      note: e.note,
    })),
  };
}

/** A teacher's own week, assembled across every class they take. */
export async function teacherTimetable(teacherId: string) {
  const entries = await prisma.timetableEntry.findMany({
    where: { teacherId },
    include: {
      classroom: { include: { classLevel: { select: { name: true } } } },
      period: { select: { id: true, name: true, startTime: true, endTime: true, sortOrder: true } },
      subject: { select: { name: true } },
      room: { select: { name: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }],
  });

  return entries
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period.sortOrder - b.period.sortOrder)
    .map((e) => ({
      dayOfWeek: e.dayOfWeek,
      period: { name: e.period.name, startTime: e.period.startTime, endTime: e.period.endTime },
      classroomLabel: `${e.classroom.classLevel.name} - ${e.classroom.section}`,
      subject: e.subject?.name ?? null,
      room: e.room?.name ?? null,
    }));
}
