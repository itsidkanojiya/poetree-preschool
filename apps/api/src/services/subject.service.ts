import type { CreateSubjectInput, SubjectSummary, UpdateSubjectInput } from '@poetree/shared';
import { prisma, prismaUnscoped } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { slugCode, uniqueCode } from '../lib/code.js';
import { writeAuditLog } from './audit.service.js';

/**
 * The subjects this school puts on its timetable.
 *
 * The school's own, and only its own. There was a merge here that also returned
 * publication-owned rows shared with every school, and it was wrong for what
 * these are: one preschool's "Circle time" is another's "Assembly", and a
 * shared list either imposes one school's words on the rest or fills the picker
 * with thirty names nobody uses. A subject is the school's own word for what a
 * period is about, so the school writes all of them.
 *
 * They belong to the school rather than to a class, because the same subject
 * runs in several classes — Letters is on the Nursery grid and the Junior KG
 * grid, and it is the same subject. Both counts are returned so it is clear
 * which subjects are actually in use, and where, before anybody removes one.
 */
export async function listSubjects(): Promise<SubjectSummary[]> {
  const schoolId = requireSchoolId();

  const own = await prisma.subject.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, sortOrder: true, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (own.length === 0) return [];

  const entries = await prismaUnscoped.timetableEntry.findMany({
    where: { schoolId, subjectId: { in: own.map((row) => row.id) } },
    select: { subjectId: true, classroomId: true },
  });

  const periods = new Map<string, number>();
  const classrooms = new Map<string, Set<string>>();

  for (const entry of entries) {
    const id = entry.subjectId;
    if (id === null) continue;

    periods.set(id, (periods.get(id) ?? 0) + 1);

    const seen = classrooms.get(id) ?? new Set<string>();
    seen.add(entry.classroomId);
    classrooms.set(id, seen);
  }

  return own.map((row) => ({
    ...row,
    timetableCount: periods.get(row.id) ?? 0,
    classroomCount: classrooms.get(row.id)?.size ?? 0,
  }));
}

export async function createSubject(
  input: CreateSubjectInput,
  actorUserId: string,
): Promise<SubjectSummary> {
  const schoolId = requireSchoolId();

  const last = await prisma.subject.findFirst({
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  /**
   * Derived, like every other code here. Unique per school rather than
   * globally, so two schools may both have CIRCLE_TIME — which is the point of
   * these belonging to the school.
   */
  const code = await uniqueCode(
    slugCode(input.name),
    async (candidate) =>
      (await prismaUnscoped.subject.count({ where: { schoolId, code: candidate } })) > 0,
  );

  const row = await prisma.subject.create({
    data: {
      code,
      name: input.name,
      sortOrder: input.sortOrder ?? (last?.sortOrder ?? 0) + 1,
    },
    select: { id: true, code: true, name: true, sortOrder: true, isActive: true },
  });

  await writeAuditLog({
    action: 'SUBJECT_CREATED',
    entity: 'Subject',
    entityId: row.id,
    schoolId,
    actorUserId,
    after: { name: row.name },
  });

  return { ...row, timetableCount: 0, classroomCount: 0 };
}

export async function updateSubject(
  id: string,
  input: UpdateSubjectInput,
  actorUserId: string,
): Promise<SubjectSummary> {
  const schoolId = requireSchoolId();

  // Scoped, so a subject belonging to the school next door is simply not here
  // and the answer is "not found" rather than a 403 that would confirm it
  // exists.
  const existing = await prisma.subject.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) throw ApiError.notFound('Subject not found');

  const row = await prisma.subject.update({
    where: { id },
    data: { name: input.name, sortOrder: input.sortOrder, isActive: input.isActive },
    select: { id: true, code: true, name: true, sortOrder: true, isActive: true },
  });

  await writeAuditLog({
    action: 'SUBJECT_UPDATED',
    entity: 'Subject',
    entityId: id,
    schoolId,
    actorUserId,
    before: { name: existing.name },
    after: { fields: Object.keys(input) },
  });

  const entries = await prismaUnscoped.timetableEntry.findMany({
    where: { schoolId, subjectId: id },
    select: { classroomId: true },
  });

  return {
    ...row,
    timetableCount: entries.length,
    classroomCount: new Set(entries.map((entry) => entry.classroomId)).size,
  };
}

/**
 * Retiring a subject, which is a flag and never a delete.
 *
 * `TimetableEntry.subjectId` is `onDelete: SetNull`, so deleting would empty
 * every period it was on — a week quietly losing its subjects, discovered by a
 * parent looking at a timetable of blank cells. Retiring takes it out of the
 * pickers and leaves the timetable exactly as it was.
 */
export async function retireSubject(id: string, actorUserId: string): Promise<void> {
  await updateSubject(id, { isActive: false }, actorUserId);
}
