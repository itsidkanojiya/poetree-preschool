import type { Prisma } from '@prisma/client';
import type {
  AcademicYearSummary,
  ClassroomSummary,
  CreateAcademicYearInput,
  CreateClassroomInput,
  UpdateClassroomInput,
} from '@poetree/shared';
import { prisma, prismaUnscoped, type TenantTransactionClient } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';

/* -------------------------------------------------------------------------- */
/* Class levels — global reference data, shared by every school                */
/* -------------------------------------------------------------------------- */

export async function listClassLevels(): Promise<
  Array<{ id: string; code: string; name: string; sortOrder: number }>
> {
  // ClassLevel is publication-level reference data with no schoolId, so it is
  // read through the unscoped client by design.
  return prismaUnscoped.classLevel.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, code: true, name: true, sortOrder: true },
  });
}

/* -------------------------------------------------------------------------- */
/* Academic years                                                             */
/* -------------------------------------------------------------------------- */

const academicYearSelect = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  isCurrent: true,
  _count: { select: { classrooms: true } },
} satisfies Prisma.AcademicYearSelect;

type AcademicYearRow = Prisma.AcademicYearGetPayload<{ select: typeof academicYearSelect }>;

function toAcademicYearSummary(row: AcademicYearRow): AcademicYearSummary {
  return {
    id: row.id,
    name: row.name,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    isCurrent: row.isCurrent,
    classroomCount: row._count.classrooms,
  };
}

export async function listAcademicYears(): Promise<AcademicYearSummary[]> {
  const rows = await prisma.academicYear.findMany({
    select: academicYearSelect,
    orderBy: { startDate: 'desc' },
  });
  return rows.map(toAcademicYearSummary);
}

export async function createAcademicYear(
  input: CreateAcademicYearInput,
): Promise<AcademicYearSummary> {
  const schoolId = requireSchoolId();

  const duplicate = await prisma.academicYear.findFirst({
    where: { name: input.name },
    select: { id: true },
  });
  if (duplicate) throw ApiError.conflict(`Academic year "${input.name}" already exists`);

  const created = await prisma.$transaction(async (tx) => {
    if (input.isCurrent) {
      // Exactly one year may be current per school.
      await tx.academicYear.updateMany({ where: { schoolId }, data: { isCurrent: false } });
    }

    return tx.academicYear.create({
      data: {
        schoolId,
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        isCurrent: input.isCurrent,
      },
      select: academicYearSelect,
    });
  });

  return toAcademicYearSummary(created);
}

/* -------------------------------------------------------------------------- */
/* Classrooms                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A classroom's teaching team lives in `ClassroomTeacher`, so a class teacher,
 * an assistant and a subject teacher can coexist. The summary surfaces the class
 * teacher because that is the one the roster screens name.
 *
 * Student count comes from enrolments — children belong to a classroom for one
 * academic year at a time.
 */
const classroomInclude = {
  classLevel: { select: { code: true, name: true } },
  academicYear: { select: { id: true, name: true, isCurrent: true } },
  teachers: {
    where: { role: 'CLASS_TEACHER' as const, endedOn: null },
    take: 1,
    include: { user: { select: { id: true, name: true } } },
  },
  _count: { select: { enrolments: true } },
} satisfies Prisma.ClassroomInclude;

type ClassroomRow = Prisma.ClassroomGetPayload<{ include: typeof classroomInclude }>;

function toClassroomSummary(row: ClassroomRow): ClassroomSummary {
  const classTeacher = row.teachers[0]?.user ?? null;

  return {
    id: row.id,
    section: row.section,
    capacity: row.capacity,
    classLevel: { code: row.classLevel.code, name: row.classLevel.name },
    academicYear: {
      id: row.academicYear.id,
      name: row.academicYear.name,
      isCurrent: row.academicYear.isCurrent,
    },
    classTeacher: classTeacher ? { id: classTeacher.id, name: classTeacher.name } : null,
    studentCount: row._count.enrolments,
  };
}

/**
 * Replaces whichever user currently holds the CLASS_TEACHER slot. Past
 * assignments are closed rather than deleted, so historical records keep naming
 * the teacher who actually taught the class.
 */
async function setClassTeacher(
  tx: TenantTransactionClient,
  schoolId: string,
  classroomId: string,
  userId: string | null,
): Promise<void> {
  await tx.classroomTeacher.updateMany({
    where: { schoolId, classroomId, role: 'CLASS_TEACHER', endedOn: null },
    data: { endedOn: new Date() },
  });

  if (!userId) return;

  // Not an upsert: the compound unique includes a nullable `subjectId`, and SQL
  // never matches NULL to NULL, so a unique lookup cannot target the class
  // teacher row. Find it explicitly instead.
  const existing = await tx.classroomTeacher.findFirst({
    where: { schoolId, classroomId, userId, subjectId: null },
    select: { id: true },
  });

  if (existing) {
    await tx.classroomTeacher.update({
      where: { id: existing.id },
      data: { role: 'CLASS_TEACHER', endedOn: null },
    });
    return;
  }

  await tx.classroomTeacher.create({
    data: { schoolId, classroomId, userId, role: 'CLASS_TEACHER' },
  });
}

export async function listClassrooms(academicYearId?: string): Promise<ClassroomSummary[]> {
  const rows = await prisma.classroom.findMany({
    where: academicYearId ? { academicYearId } : {},
    include: classroomInclude,
    orderBy: [{ classLevel: { sortOrder: 'asc' } }, { section: 'asc' }],
  });
  return rows.map(toClassroomSummary);
}

export async function getClassroom(classroomId: string): Promise<ClassroomSummary> {
  const row = await prisma.classroom.findFirst({
    where: { id: classroomId },
    include: classroomInclude,
  });
  if (!row) throw ApiError.notFound('Classroom not found');
  return toClassroomSummary(row);
}

async function resolveClassLevelId(code: CreateClassroomInput['classLevelCode']): Promise<string> {
  const level = await prismaUnscoped.classLevel.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!level) {
    throw ApiError.internal('Class levels are missing. Run the database seed.');
  }
  return level.id;
}

async function assertTeacherBelongsToSchool(teacherId: string): Promise<void> {
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, role: 'TEACHER' },
    select: { id: true },
  });
  if (!teacher) throw ApiError.badRequest('That teacher does not exist at your school');
}

export async function createClassroom(input: CreateClassroomInput): Promise<ClassroomSummary> {
  const schoolId = requireSchoolId();

  const academicYear = await prisma.academicYear.findFirst({
    where: { id: input.academicYearId },
    select: { id: true },
  });
  if (!academicYear) throw ApiError.badRequest('That academic year does not exist at your school');

  if (input.classTeacherId) await assertTeacherBelongsToSchool(input.classTeacherId);

  const classLevelId = await resolveClassLevelId(input.classLevelCode);

  const duplicate = await prisma.classroom.findFirst({
    where: { academicYearId: input.academicYearId, classLevelId, section: input.section },
    select: { id: true },
  });
  if (duplicate) {
    throw ApiError.conflict(`Section "${input.section}" already exists for that class and year`);
  }

  const createdId = await prisma.$transaction(async (tx) => {
    const classroom = await tx.classroom.create({
      data: {
        schoolId,
        academicYearId: input.academicYearId,
        classLevelId,
        section: input.section,
        capacity: input.capacity ?? null,
      },
    });

    await setClassTeacher(tx, schoolId, classroom.id, input.classTeacherId ?? null);
    return classroom.id;
  });

  return getClassroom(createdId);
}

export async function updateClassroom(
  classroomId: string,
  input: UpdateClassroomInput,
): Promise<ClassroomSummary> {
  const existing = await prisma.classroom.findFirst({
    where: { id: classroomId },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Classroom not found');

  if (input.classTeacherId) await assertTeacherBelongsToSchool(input.classTeacherId);

  const classLevelId = input.classLevelCode
    ? await resolveClassLevelId(input.classLevelCode)
    : undefined;

  const schoolId = requireSchoolId();

  await prisma.$transaction(async (tx) => {
    await tx.classroom.update({
      where: { id: classroomId, schoolId },
      data: {
        section: input.section,
        capacity: input.capacity,
        classLevelId,
      },
    });

    if (input.classTeacherId !== undefined) {
      await setClassTeacher(tx, schoolId, classroomId, input.classTeacherId ?? null);
    }
  });

  return getClassroom(classroomId);
}
