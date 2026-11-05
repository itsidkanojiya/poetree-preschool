import ExcelJS from 'exceljs';
import type { Response } from 'express';
import type { Prisma } from '@prisma/client';
import type { GlobalExportFilters, GlobalExportQuery, SchoolExportQuery } from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { studentName } from '../lib/names.js';
import { logger } from '../lib/logger.js';
import { holdsTeacher } from './roles.service.js';

/**
 * School records as an Excel file.
 *
 * Written as a stream: rows are read a batch at a time and written into the
 * workbook as they arrive, so a group with thousands of children never sits
 * in memory at once and the first bytes reach the browser before the last
 * row is read — nothing for a proxy to time out on.
 *
 * Every query here goes through the unscoped client with the schools named
 * explicitly, for both doors: a School Admin's is the one school on their
 * session, passed in by the route and never taken from the request; the
 * Super Admin's is the ones they chose, or all. One code path, with the
 * boundary in plain sight in every `where`.
 *
 * Nothing confidential is exported because nothing confidential is selected:
 * every query lists its fields, and none lists a password hash, a code, a
 * token or a session.
 */

/** Rows read per round trip. */
const BATCH = 500;

/** Which schools an export may read. Null: every school (the Super Admin's, unfiltered). */
export interface ExportScope {
  schoolIds: string[] | null;
  /** Adds the School and School ID columns, for an export across schools. */
  withSchool: boolean;
}

interface Column<T> {
  header: string;
  width?: number;
  /** A real date in the cell, shown as a date, rather than text. */
  date?: boolean;
  value: (row: T) => string | number | Date | null | undefined;
}

/** The filters the services read, from either door. */
interface Filters {
  academicYearId?: string;
  academicYearName?: string;
  classLevelId?: string;
  classroomId?: string;
  section?: string;
  status?: string;
  search?: string;
}

function schoolFilter(scope: ExportScope): { schoolId?: { in: string[] } } {
  return scope.schoolIds ? { schoolId: { in: scope.schoolIds } } : {};
}

/** Which enrolment a class filter is about, or null when there is none. */
function enrolmentFilter(f: Filters): Prisma.StudentEnrolmentWhereInput | null {
  const classroom: Prisma.ClassroomWhereInput = {
    ...(f.classLevelId ? { classLevelId: f.classLevelId } : {}),
    ...(f.section ? { section: f.section } : {}),
  };
  const where: Prisma.StudentEnrolmentWhereInput = {
    ...(f.academicYearId ? { academicYearId: f.academicYearId } : {}),
    ...(f.academicYearName ? { academicYear: { name: f.academicYearName } } : {}),
    ...(f.classroomId ? { classroomId: f.classroomId } : {}),
    ...(Object.keys(classroom).length > 0 ? { classroom } : {}),
  };
  return Object.keys(where).length > 0 ? where : null;
}

/** Rows a batch at a time, in a stable order, until there are no more. */
async function* inBatches<T extends { id: string }>(
  read: (page: { take: number; cursor?: { id: string }; skip?: number }) => Promise<T[]>,
): AsyncGenerator<T> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await read({
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows) yield row;
    if (rows.length < BATCH) return;
    cursor = rows[rows.length - 1]!.id;
  }
}

/** "2026-11-06": the day, for a file name. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A name safe in a Content-Disposition header and on any disk. */
function fileName(...parts: string[]): string {
  return `${parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')}.xlsx`;
}

/**
 * Streams rows into a one-sheet workbook on the response. Returns how many
 * rows were written, for the audit entry.
 *
 * A failure before the first byte is an ordinary error response; one after it
 * — the database going away halfway — can only end the download, which the
 * browser reports as a failed file rather than a broken one opening.
 */
async function streamWorkbook<T>(
  res: Response,
  file: string,
  sheetName: string,
  columns: Array<Column<T>>,
  rows: AsyncIterable<T>,
): Promise<number> {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
  res.setHeader('Cache-Control', 'no-store');

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
    // Shared strings are held in memory until the end; inline strings are not.
    useSharedStrings: false,
  });
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.header,
    width: column.width ?? Math.max(12, column.header.length + 4),
    ...(column.date ? { style: { numFmt: 'dd mmm yyyy' } } : {}),
  }));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16307C' } };
  header.commit();

  let count = 0;
  try {
    for await (const row of rows) {
      sheet.addRow(columns.map((column) => column.value(row) ?? null)).commit();
      count += 1;
    }
    sheet.commit();
    await workbook.commit();
  } catch (error) {
    logger.error('An export stopped part-way', {
      file,
      rows: count,
      error: error instanceof Error ? error.message : String(error),
    });
    res.destroy(error instanceof Error ? error : undefined);
    throw error;
  }
  return count;
}

/* -------------------------------------------------------------------------- */
/* Students                                                                   */
/* -------------------------------------------------------------------------- */

function studentQuery(scope: ExportScope, f: Filters) {
  const enrolment = enrolmentFilter(f);
  const where: Prisma.StudentWhereInput = {
    ...schoolFilter(scope),
    deletedAt: null,
    ...(f.status ? { status: f.status as Prisma.StudentWhereInput['status'] } : {}),
    ...(enrolment ? { enrolments: { some: enrolment } } : {}),
    ...(f.search
      ? {
          OR: [
            { firstName: { contains: f.search } },
            { lastName: { contains: f.search } },
            { admissionNo: { contains: f.search } },
          ],
        }
      : {}),
  };

  const select = {
    id: true,
    admissionNo: true,
    firstName: true,
    middleName: true,
    lastName: true,
    dateOfBirth: true,
    gender: true,
    bloodGroup: true,
    status: true,
    admissionDate: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    postalCode: true,
    emergencyContactName: true,
    emergencyContactPhone: true,
    school: { select: { name: true, code: true } },
    // The class the filter asked about, or the latest one.
    enrolments: {
      ...(enrolment ? { where: enrolment } : {}),
      orderBy: { enrolledOn: 'desc' as const },
      take: 1,
      select: {
        rollNo: true,
        status: true,
        academicYear: { select: { name: true } },
        classroom: { select: { section: true, classLevel: { select: { name: true } } } },
      },
    },
    // Parents the school has not removed, the primary one first.
    guardians: {
      where: { parentProfile: { removedAt: null, user: { deletedAt: null } } },
      orderBy: { isPrimary: 'desc' as const },
      select: {
        relation: true,
        parentProfile: { select: { user: { select: { name: true, phone: true, email: true } } } },
      },
    },
  } satisfies Prisma.StudentSelect;

  return { where, select };
}

type StudentRow = Prisma.StudentGetPayload<{
  select: ReturnType<typeof studentQuery>['select'];
}>;

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

function studentColumns(scope: ExportScope): Array<Column<StudentRow>> {
  return [
    ...schoolColumns<StudentRow>(scope),
    { header: 'Admission no.', value: (r) => r.admissionNo },
    { header: 'Name', width: 28, value: (r) => studentName(r) },
    { header: 'First name', value: (r) => r.firstName },
    { header: 'Father’s name', value: (r) => r.middleName },
    { header: 'Surname', value: (r) => r.lastName },
    { header: 'Date of birth', date: true, value: (r) => r.dateOfBirth },
    { header: 'Gender', value: (r) => titleCase(r.gender) },
    { header: 'Blood group', value: (r) => r.bloodGroup },
    { header: 'Status', value: (r) => titleCase(r.status) },
    { header: 'Admitted on', date: true, value: (r) => r.admissionDate },
    { header: 'Academic year', value: (r) => r.enrolments[0]?.academicYear.name },
    { header: 'Standard', value: (r) => r.enrolments[0]?.classroom.classLevel.name },
    { header: 'Section', value: (r) => r.enrolments[0]?.classroom.section },
    { header: 'Roll no.', value: (r) => r.enrolments[0]?.rollNo },
    {
      header: 'Enrolment',
      value: (r) => (r.enrolments[0] ? titleCase(r.enrolments[0].status) : null),
    },
    {
      header: 'Parents',
      width: 34,
      value: (r) =>
        r.guardians
          .map((g) => `${g.parentProfile.user.name} (${titleCase(g.relation)})`)
          .join('; '),
    },
    {
      header: 'Parent phones',
      width: 26,
      value: (r) =>
        r.guardians
          .map((g) => g.parentProfile.user.phone)
          .filter(Boolean)
          .join('; '),
    },
    {
      header: 'Parent emails',
      width: 30,
      value: (r) =>
        r.guardians
          .map((g) => g.parentProfile.user.email)
          .filter(Boolean)
          .join('; '),
    },
    {
      header: 'Address',
      width: 34,
      value: (r) => [r.addressLine1, r.addressLine2].filter(Boolean).join(', ') || null,
    },
    { header: 'City', value: (r) => r.city },
    { header: 'Postal code', value: (r) => r.postalCode },
    { header: 'Emergency contact', width: 22, value: (r) => r.emergencyContactName },
    { header: 'Emergency phone', width: 18, value: (r) => r.emergencyContactPhone },
  ];
}

function studentRows(scope: ExportScope, f: Filters): AsyncIterable<StudentRow> {
  const { where, select } = studentQuery(scope, f);
  return inBatches((page) =>
    prismaUnscoped.student.findMany({
      where,
      select,
      orderBy: [{ schoolId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...page,
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Teachers                                                                   */
/* -------------------------------------------------------------------------- */

const teacherSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  school: { select: { name: true, code: true } },
  teacherProfile: { select: { employeeCode: true, qualification: true, joinedAt: true } },
  parentProfile: { select: { removedAt: true } },
  classroomAssignments: {
    where: { classroom: { academicYear: { isCurrent: true } } },
    select: { classroom: { select: { section: true, classLevel: { select: { name: true } } } } },
  },
} satisfies Prisma.UserSelect;

type TeacherRow = Prisma.UserGetPayload<{ select: typeof teacherSelect }>;

function teacherWhere(scope: ExportScope, f: Filters): Prisma.UserWhereInput {
  // Teachers of a class: the classes they are put on that match.
  const classroom: Prisma.ClassroomWhereInput = {
    ...(f.classroomId ? { id: f.classroomId } : {}),
    ...(f.classLevelId ? { classLevelId: f.classLevelId } : {}),
    ...(f.section ? { section: f.section } : {}),
    ...(f.academicYearId ? { academicYearId: f.academicYearId } : {}),
    ...(f.academicYearName ? { academicYear: { name: f.academicYearName } } : {}),
  };
  return {
    ...schoolFilter(scope),
    ...holdsTeacher,
    deletedAt: null,
    ...(f.status ? { status: f.status as Prisma.UserWhereInput['status'] } : {}),
    ...(Object.keys(classroom).length > 0 ? { classroomAssignments: { some: { classroom } } } : {}),
    ...(f.search
      ? {
          OR: [
            { name: { contains: f.search } },
            { email: { contains: f.search } },
            { phone: { contains: f.search } },
          ],
        }
      : {}),
  };
}

function teacherColumns(scope: ExportScope): Array<Column<TeacherRow>> {
  return [
    ...schoolColumns<TeacherRow>(scope),
    { header: 'Name', width: 26, value: (r) => r.name },
    { header: 'Email', width: 30, value: (r) => r.email },
    { header: 'Phone', width: 18, value: (r) => r.phone },
    { header: 'Status', value: (r) => titleCase(r.status) },
    { header: 'Employee code', value: (r) => r.teacherProfile?.employeeCode },
    { header: 'Qualification', width: 26, value: (r) => r.teacherProfile?.qualification },
    { header: 'Joined', date: true, value: (r) => r.teacherProfile?.joinedAt },
    {
      header: 'Classes this year',
      width: 30,
      value: (r) =>
        r.classroomAssignments
          .map((a) => `${a.classroom.classLevel.name} ${a.classroom.section}`)
          .join('; '),
    },
    {
      header: 'Also a parent',
      value: (r) => (r.parentProfile && !r.parentProfile.removedAt ? 'Yes' : 'No'),
    },
    { header: 'Added on', date: true, value: (r) => r.createdAt },
    { header: 'Last signed in', date: true, value: (r) => r.lastLoginAt },
  ];
}

function teacherRows(scope: ExportScope, f: Filters): AsyncIterable<TeacherRow> {
  const where = teacherWhere(scope, f);
  return inBatches((page) =>
    prismaUnscoped.user.findMany({
      where,
      select: teacherSelect,
      orderBy: [{ schoolId: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      ...page,
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Parents                                                                    */
/* -------------------------------------------------------------------------- */

const parentSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  school: { select: { name: true, code: true } },
  teacherProfile: { select: { removedAt: true } },
  parentProfile: {
    select: {
      relation: true,
      occupation: true,
      address: true,
      children: {
        where: { student: { deletedAt: null } },
        select: {
          student: {
            select: {
              firstName: true,
              middleName: true,
              lastName: true,
              admissionNo: true,
              enrolments: {
                where: { status: 'ACTIVE' as const },
                orderBy: { enrolledOn: 'desc' as const },
                take: 1,
                select: {
                  classroom: { select: { section: true, classLevel: { select: { name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

type ParentRow = Prisma.UserGetPayload<{ select: typeof parentSelect }>;

function parentWhere(scope: ExportScope, f: Filters): Prisma.UserWhereInput {
  // Parents of a class: those with a child enrolled in a class that matches.
  const enrolment = enrolmentFilter(f);
  return {
    ...schoolFilter(scope),
    deletedAt: null,
    parentProfile: {
      is: {
        removedAt: null,
        ...(enrolment
          ? {
              children: {
                some: { student: { deletedAt: null, enrolments: { some: enrolment } } },
              },
            }
          : {}),
      },
    },
    ...(f.status ? { status: f.status as Prisma.UserWhereInput['status'] } : {}),
    ...(f.search
      ? {
          OR: [
            { name: { contains: f.search } },
            { email: { contains: f.search } },
            { phone: { contains: f.search } },
          ],
        }
      : {}),
  };
}

function parentColumns(scope: ExportScope): Array<Column<ParentRow>> {
  return [
    ...schoolColumns<ParentRow>(scope),
    { header: 'Name', width: 26, value: (r) => r.name },
    { header: 'Phone', width: 18, value: (r) => r.phone },
    { header: 'Email', width: 30, value: (r) => r.email },
    { header: 'Status', value: (r) => titleCase(r.status) },
    {
      header: 'Relation',
      value: (r) => (r.parentProfile ? titleCase(r.parentProfile.relation) : null),
    },
    { header: 'Occupation', width: 20, value: (r) => r.parentProfile?.occupation },
    { header: 'Address', width: 34, value: (r) => r.parentProfile?.address },
    {
      header: 'Children',
      width: 44,
      value: (r) =>
        (r.parentProfile?.children ?? [])
          .map(({ student }) => {
            const classroom = student.enrolments[0]?.classroom;
            const placed = classroom ? `, ${classroom.classLevel.name} ${classroom.section}` : '';
            return `${studentName(student)} (${student.admissionNo}${placed})`;
          })
          .join('; '),
    },
    {
      header: 'Also a teacher',
      value: (r) => (r.teacherProfile && !r.teacherProfile.removedAt ? 'Yes' : 'No'),
    },
    { header: 'Added on', date: true, value: (r) => r.createdAt },
    { header: 'Last signed in', date: true, value: (r) => r.lastLoginAt },
  ];
}

function parentRows(scope: ExportScope, f: Filters): AsyncIterable<ParentRow> {
  const where = parentWhere(scope, f);
  return inBatches((page) =>
    prismaUnscoped.user.findMany({
      where,
      select: parentSelect,
      orderBy: [{ schoolId: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      ...page,
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Classes (a School Admin's)                                                 */
/* -------------------------------------------------------------------------- */

const classSelect = {
  id: true,
  section: true,
  capacity: true,
  academicYear: { select: { name: true } },
  classLevel: { select: { name: true } },
  teachers: { select: { user: { select: { name: true, deletedAt: true } } } },
  _count: { select: { enrolments: { where: { status: 'ACTIVE' as const } } } },
} satisfies Prisma.ClassroomSelect;

type ClassRow = Prisma.ClassroomGetPayload<{ select: typeof classSelect }>;

function classRows(scope: ExportScope, f: Filters): AsyncIterable<ClassRow> {
  const where: Prisma.ClassroomWhereInput = {
    ...schoolFilter(scope),
    // A year chosen, or this one.
    ...(f.academicYearId
      ? { academicYearId: f.academicYearId }
      : { academicYear: { isCurrent: true } }),
    ...(f.classLevelId ? { classLevelId: f.classLevelId } : {}),
    ...(f.classroomId ? { id: f.classroomId } : {}),
  };
  return inBatches((page) =>
    prismaUnscoped.classroom.findMany({
      where,
      select: classSelect,
      orderBy: [{ classLevel: { sortOrder: 'asc' } }, { section: 'asc' }, { id: 'asc' }],
      ...page,
    }),
  );
}

const classColumns: Array<Column<ClassRow>> = [
  { header: 'Academic year', value: (r) => r.academicYear.name },
  { header: 'Standard', value: (r) => r.classLevel.name },
  { header: 'Section', value: (r) => r.section },
  { header: 'Capacity', value: (r) => r.capacity },
  { header: 'Children enrolled', value: (r) => r._count.enrolments },
  {
    header: 'Teachers',
    width: 34,
    value: (r) =>
      r.teachers
        .filter((t) => !t.user.deletedAt)
        .map((t) => t.user.name)
        .join('; '),
  },
];

/* -------------------------------------------------------------------------- */
/* Schools (the Super Admin's)                                                */
/* -------------------------------------------------------------------------- */

const schoolSelect = {
  id: true,
  name: true,
  code: true,
  status: true,
  city: true,
  phone: true,
  createdAt: true,
  organisation: { select: { name: true } },
  subscriptions: {
    orderBy: { startsAt: 'desc' as const },
    take: 1,
    select: { status: true, plan: { select: { name: true } } },
  },
  _count: {
    select: {
      students: { where: { deletedAt: null, status: 'ACTIVE' as const } },
      teacherProfiles: { where: { removedAt: null, user: { deletedAt: null } } },
      parentProfiles: { where: { removedAt: null, user: { deletedAt: null } } },
    },
  },
} satisfies Prisma.SchoolSelect;

type SchoolRow = Prisma.SchoolGetPayload<{ select: typeof schoolSelect }>;

const schoolRowColumns: Array<Column<SchoolRow>> = [
  { header: 'School', width: 30, value: (r) => r.name },
  { header: 'School ID', value: (r) => r.code },
  { header: 'Status', value: (r) => titleCase(r.status) },
  { header: 'Group', width: 24, value: (r) => r.organisation?.name },
  { header: 'City', value: (r) => r.city },
  { header: 'Phone', width: 18, value: (r) => r.phone },
  { header: 'Plan', width: 20, value: (r) => r.subscriptions[0]?.plan.name },
  {
    header: 'Plan status',
    value: (r) => (r.subscriptions[0] ? titleCase(r.subscriptions[0].status) : null),
  },
  { header: 'Active children', value: (r) => r._count.students },
  { header: 'Teachers', value: (r) => r._count.teacherProfiles },
  { header: 'Parents', value: (r) => r._count.parentProfiles },
  { header: 'Added on', date: true, value: (r) => r.createdAt },
];

function schoolRows(scope: ExportScope, f: Filters): AsyncIterable<SchoolRow> {
  const where: Prisma.SchoolWhereInput = {
    ...(scope.schoolIds ? { id: { in: scope.schoolIds } } : {}),
    ...(f.status ? { status: f.status as Prisma.SchoolWhereInput['status'] } : {}),
  };
  return inBatches((page) =>
    prismaUnscoped.school.findMany({
      where,
      select: schoolSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      ...page,
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* The two doors                                                              */
/* -------------------------------------------------------------------------- */

/** The School and School ID columns, on an export across schools only. */
function schoolColumns<T extends { school: { name: string; code: string } | null }>(
  scope: ExportScope,
): Array<Column<T>> {
  if (!scope.withSchool) return [];
  return [
    { header: 'School', width: 28, value: (r) => r.school?.name },
    { header: 'School ID', value: (r) => r.school?.code },
  ];
}

const SHEET_NAMES = {
  students: 'Students',
  teachers: 'Teachers',
  parents: 'Parents',
  classes: 'Classes',
  schools: 'Schools',
} as const;

async function run(
  res: Response,
  type: keyof typeof SHEET_NAMES,
  scope: ExportScope,
  filters: Filters,
  label: string,
): Promise<number> {
  const file = fileName(label, type, today());
  const sheet = SHEET_NAMES[type];
  switch (type) {
    case 'students':
      return streamWorkbook(res, file, sheet, studentColumns(scope), studentRows(scope, filters));
    case 'teachers':
      return streamWorkbook(res, file, sheet, teacherColumns(scope), teacherRows(scope, filters));
    case 'parents':
      return streamWorkbook(res, file, sheet, parentColumns(scope), parentRows(scope, filters));
    case 'classes':
      return streamWorkbook(res, file, sheet, classColumns, classRows(scope, filters));
    case 'schools':
      return streamWorkbook(res, file, sheet, schoolRowColumns, schoolRows(scope, filters));
  }
}

/** A School Admin's export: their own school, whatever the filters say. */
export async function exportForSchool(
  res: Response,
  schoolId: string,
  query: SchoolExportQuery,
): Promise<number> {
  const school = await prismaUnscoped.school.findUniqueOrThrow({
    where: { id: schoolId },
    select: { code: true },
  });
  return run(
    res,
    query.type,
    { schoolIds: [schoolId], withSchool: false },
    {
      academicYearId: query.academicYearId,
      classLevelId: query.classLevelId,
      classroomId: query.classroomId,
      status: query.status,
      search: query.search,
    },
    school.code,
  );
}

/** The Super Admin's export: the schools chosen, or every school. */
export async function exportAcrossSchools(
  res: Response,
  query: GlobalExportQuery,
): Promise<number> {
  const chosen = query.schoolIds.length > 0 ? query.schoolIds : null;
  const label =
    chosen === null
      ? 'all-schools'
      : chosen.length === 1
        ? ((
            await prismaUnscoped.school.findUnique({
              where: { id: chosen[0]! },
              select: { code: true },
            })
          )?.code ?? 'school')
        : `${chosen.length}-schools`;

  return run(
    res,
    query.type,
    { schoolIds: chosen, withSchool: true },
    {
      academicYearName: query.academicYear,
      classLevelId: query.classLevelId,
      section: query.section,
      status: query.status,
    },
    label,
  );
}

/** What the Super Admin's export screen offers to filter by. */
export async function globalExportFilters(): Promise<GlobalExportFilters> {
  const [schools, standards, years, sections] = await Promise.all([
    prismaUnscoped.school.findMany({
      select: { id: true, name: true, code: true, status: true },
      orderBy: { name: 'asc' },
    }),
    prismaUnscoped.classLevel.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prismaUnscoped.academicYear.findMany({
      distinct: ['name'],
      select: { name: true },
      orderBy: { name: 'desc' },
    }),
    prismaUnscoped.classroom.findMany({
      distinct: ['section'],
      select: { section: true },
      orderBy: { section: 'asc' },
    }),
  ]);

  return {
    schools,
    standards,
    academicYears: years.map((year) => year.name),
    sections: sections.map((row) => row.section),
  };
}
