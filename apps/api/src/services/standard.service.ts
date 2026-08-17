import type { CreateStandardInput, StandardSummary, UpdateStandardInput } from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { slugCode, uniqueCode } from '../lib/code.js';
import { writeAuditLog } from './audit.service.js';

/**
 * Standards — the years a preschool teaches.
 *
 * These were four values compiled into an enum, which meant a school calling
 * its first year "Toddler" could not be described at all, and adding one was a
 * migration and a release. They are rows now, and the Super Admin owns them for
 * the same reason it owns the activity catalogue: a standard is what a book and
 * a child's progress both hang off, so sixty schools each inventing their own
 * would make "Nursery" mean sixty things.
 */

function toSummary(row: {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  _count?: { classrooms: number };
}): StandardSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    minAgeMonths: row.minAgeMonths,
    maxAgeMonths: row.maxAgeMonths,
    // What makes it undeletable, and worth saying on the screen rather than
    // only in the error when somebody tries.
    classroomCount: row._count?.classrooms ?? 0,
  };
}

export async function listStandards(includeInactive = false): Promise<StandardSummary[]> {
  const rows = await prismaUnscoped.classLevel.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { classrooms: true } } },
  });
  return rows.map(toSummary);
}

export async function createStandard(
  input: CreateStandardInput,
  actorUserId: string,
): Promise<StandardSummary> {
  const code =
    input.code ??
    (await uniqueCode(
      slugCode(input.name),
      async (candidate) =>
        (await prismaUnscoped.classLevel.count({ where: { code: candidate } })) > 0,
    ));

  const clash = await prismaUnscoped.classLevel.findUnique({
    where: { code },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict(`A standard with the code ${code} already exists`);

  const last = await prismaUnscoped.classLevel.findFirst({
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const row = await prismaUnscoped.classLevel.create({
    data: {
      code,
      name: input.name,
      // Added at the end unless placed: a new standard is usually the oldest
      // year, and guessing wrong is one drag to fix.
      sortOrder: input.sortOrder ?? (last?.sortOrder ?? 0) + 1,
      minAgeMonths: input.minAgeMonths ?? null,
      maxAgeMonths: input.maxAgeMonths ?? null,
    },
    include: { _count: { select: { classrooms: true } } },
  });

  await writeAuditLog({
    action: 'STANDARD_CREATED',
    entity: 'ClassLevel',
    entityId: row.id,
    schoolId: null,
    actorUserId,
    after: { code: row.code, name: row.name },
  });

  return toSummary(row);
}

export async function updateStandard(
  id: string,
  input: UpdateStandardInput,
  actorUserId: string,
): Promise<StandardSummary> {
  const existing = await prismaUnscoped.classLevel.findUnique({
    where: { id },
    include: { _count: { select: { classrooms: true } } },
  });
  if (!existing) throw ApiError.notFound('Standard not found');

  // The code is not editable. It is what the seed, the fee structures and any
  // import file refer to; renaming is what `name` is for, and that is the only
  // one anybody sees.
  const row = await prismaUnscoped.classLevel.update({
    where: { id },
    data: {
      name: input.name,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      minAgeMonths: input.minAgeMonths,
      maxAgeMonths: input.maxAgeMonths,
    },
    include: { _count: { select: { classrooms: true } } },
  });

  await writeAuditLog({
    action: 'STANDARD_UPDATED',
    entity: 'ClassLevel',
    entityId: id,
    schoolId: null,
    actorUserId,
    before: { name: existing.name, isActive: existing.isActive },
    after: { fields: Object.keys(input) },
  });

  return toSummary(row);
}

/**
 * Retiring a standard, which is a flag and never a delete.
 *
 * Classrooms, fee structures, skills and a term of attendance all point at it.
 * Deleting would either cascade a school's history away or leave it pointing at
 * nothing, so a standard in use cannot even be deactivated without the schools
 * that use it being named — an office should hear "three classes are in this
 * year" rather than have their register quietly stop working.
 */
export async function retireStandard(id: string, actorUserId: string): Promise<StandardSummary> {
  const inUse = await prismaUnscoped.classroom.count({ where: { classLevelId: id } });
  if (inUse > 0) {
    throw ApiError.badRequest(
      `${inUse} ${inUse === 1 ? 'classroom is' : 'classrooms are'} still in this standard. ` +
        'Move them first, or leave it live.',
    );
  }

  return updateStandard(id, { isActive: false }, actorUserId);
}
