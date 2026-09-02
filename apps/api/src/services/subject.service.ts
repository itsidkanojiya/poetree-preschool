import type { CreateSubjectInput, SubjectSummary, UpdateSubjectInput } from '@poetree/shared';
import { prisma, prismaUnscoped } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { slugCode, uniqueCode } from '../lib/code.js';
import { writeAuditLog } from './audit.service.js';

/**
 * The activity areas a school puts on its timetable.
 *
 * Two sources, deliberately: the school's own, through the scoped client, plus
 * publication defaults which carry a NULL schoolId and are invisible to it.
 * Every school inherits the defaults without owning a copy — and there are none
 * today, which is why a school with no subjects of its own had a timetable it
 * could not fill.
 *
 * Only its own are editable. A default belongs to the publisher, and offering a
 * school an Edit that always fails is worse than not offering one.
 */
export async function listSubjects(): Promise<SubjectSummary[]> {
  const schoolId = requireSchoolId();

  const [own, defaults] = await Promise.all([
    prisma.subject.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, sortOrder: true, isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prismaUnscoped.subject.findMany({
      where: { schoolId: null, isActive: true },
      select: { id: true, code: true, name: true, sortOrder: true, isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  // How many periods would lose their subject, counted for the school asking
  // rather than across every school that shares a default.
  const counts = await prismaUnscoped.timetableEntry.groupBy({
    by: ['subjectId'],
    where: {
      schoolId,
      subjectId: { in: [...own, ...defaults].map((row) => row.id) },
    },
    _count: { _all: true },
  });
  const used = new Map(counts.map((row) => [row.subjectId, row._count._all]));

  return [
    ...own.map((row) => ({ ...row, isOwn: true, timetableCount: used.get(row.id) ?? 0 })),
    ...defaults.map((row) => ({ ...row, isOwn: false, timetableCount: used.get(row.id) ?? 0 })),
  ].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
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

  return { ...row, isOwn: true, timetableCount: 0 };
}

export async function updateSubject(
  id: string,
  input: UpdateSubjectInput,
  actorUserId: string,
): Promise<SubjectSummary> {
  const schoolId = requireSchoolId();

  // Scoped: a publication default is not visible here, so a school editing one
  // gets "not found" rather than editing everybody's.
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

  const count = await prismaUnscoped.timetableEntry.count({
    where: { schoolId, subjectId: id },
  });

  return { ...row, isOwn: true, timetableCount: count };
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
