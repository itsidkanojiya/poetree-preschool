import { Prisma } from '@prisma/client';
import {
  DEVELOPMENT_AREA_PRESETS,
  GRADE_SCALE_PRESETS,
  type AddReportAreaPresetInput,
  type CreateReportAreaInput,
  type CreateTermInput,
  type GradeLevelSummary,
  type ReportAreaSummary,
  type ReportCardListItem,
  type ReportCardView,
  type ReportCounts,
  type ReportGrid,
  type ReportGridChild,
  type ResultsClassroomRow,
  type SaveGradeScaleInput,
  type SaveReportCardInput,
  type TermSummary,
  type UpdateReportAreaInput,
  type UpdateTermInput,
} from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { getRequestContext, requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { studentName } from '../lib/names.js';
import { writeAuditLog } from './audit.service.js';
import { guardianUserIdsFor, notifySafe } from './notification.service.js';
import { assertCanReadStudent, assertTeacherOwnsClassroom } from './scope.service.js';
import { createDocument, toBuffer } from '../lib/pdf.js';
import { schoolBranding, signatureOf } from './printAssets.service.js';
import { drawReportCard } from './reportCard.pdf.js';

/**
 * Term report cards.
 *
 * Three parts, three people. The office sets up the grading scale, the terms
 * and what each class level is graded on. The class teacher grades their
 * children and hands the class over. The office checks, then publishes — and
 * only then does a family see anything, from a frozen copy that a later rename
 * of a grade or an area can never rewrite.
 */

const OFFICE = new Set(['SCHOOL_ADMIN', 'ORG_ADMIN']);

function role(): string {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();
  return context.role;
}

const isOffice = () => OFFICE.has(role());

function classroomLabel(classroom: { section: string; classLevel: { name: string } }): string {
  return `${classroom.classLevel.name} — ${classroom.section}`;
}

function duplicate(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// ---------------------------------------------------------------------------
// Grading scale
// ---------------------------------------------------------------------------

function toLevel(row: {
  id: string;
  label: string;
  description: string | null;
  sortOrder: number;
}): GradeLevelSummary {
  return { id: row.id, label: row.label, description: row.description, sortOrder: row.sortOrder };
}

/**
 * The school's scale, best first. A school that has never set one gets the
 * plain-words scale, written the first time anyone asks — so a teacher can
 * start grading on day one without waiting for the office.
 */
export async function getScale(): Promise<GradeLevelSummary[]> {
  const rows = await prisma.gradeLevel.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (rows.length > 0) return rows.map(toLevel);

  const any = await prisma.gradeLevel.count();
  if (any > 0) return [];

  const schoolId = requireSchoolId();
  try {
    await prisma.gradeLevel.createMany({
      data: GRADE_SCALE_PRESETS.words.map((level, index) => ({
        schoolId,
        label: level.label,
        description: level.description,
        sortOrder: index,
      })),
    });
  } catch (error) {
    // Two first visits at once: the other one wrote it.
    if (!duplicate(error)) throw error;
  }
  return getScale();
}

/**
 * Replaces the scale. Grades kept by id are renamed in place, new ones
 * created, and the rest retired — never deleted, because a published card
 * still names them.
 */
export async function saveScale(input: SaveGradeScaleInput): Promise<GradeLevelSummary[]> {
  const schoolId = requireSchoolId();
  const labels = input.levels.map((level) => level.label.toLowerCase());
  if (new Set(labels).size !== labels.length) {
    throw ApiError.badRequest('Two grades cannot have the same name');
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.gradeLevel.findMany();
      const keep = new Set(input.levels.map((level) => level.id).filter(Boolean));

      // Retire first, and move retired names aside, so a renamed grade can
      // take a name another grade is giving up.
      for (const row of existing) {
        if (!keep.has(row.id) && row.isActive) {
          await tx.gradeLevel.update({ where: { id: row.id }, data: { isActive: false } });
        }
      }

      for (const [index, level] of input.levels.entries()) {
        const description = level.description ?? null;
        if (level.id) {
          const found = existing.find((row) => row.id === level.id);
          if (!found) throw ApiError.badRequest('One of those grades is not on this scale');
          await tx.gradeLevel.update({
            where: { id: level.id },
            data: { label: level.label, description, sortOrder: index, isActive: true },
          });
          continue;
        }
        const retired = existing.find(
          (row) => row.label.toLowerCase() === level.label.toLowerCase() && !keep.has(row.id),
        );
        if (retired) {
          await tx.gradeLevel.update({
            where: { id: retired.id },
            data: { label: level.label, description, sortOrder: index, isActive: true },
          });
        } else {
          await tx.gradeLevel.create({
            data: { schoolId, label: level.label, description, sortOrder: index },
          });
        }
      }
    });
  } catch (error) {
    if (duplicate(error)) throw ApiError.conflict('Two grades cannot have the same name');
    throw error;
  }
  return getScale();
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

type TermRow = Prisma.TermGetPayload<{ include: { academicYear: { select: { name: true } } } }>;

function toTerm(row: TermRow): TermSummary {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    academicYearName: row.academicYear.name,
    name: row.name,
    sortOrder: row.sortOrder,
    startsOn: row.startsOn?.toISOString() ?? null,
    endsOn: row.endsOn?.toISOString() ?? null,
    isActive: row.isActive,
  };
}

async function currentYearId(): Promise<string> {
  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  if (!year) throw ApiError.badRequest('Set up the current academic year first');
  return year.id;
}

/** The terms of a year — the current one unless another is named. */
export async function listTerms(academicYearId?: string): Promise<TermSummary[]> {
  const yearId = academicYearId ?? (await currentYearId());
  const rows = await prisma.term.findMany({
    where: { academicYearId: yearId },
    include: { academicYear: { select: { name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toTerm);
}

export async function createTerm(input: CreateTermInput): Promise<TermSummary> {
  const schoolId = requireSchoolId();
  const academicYearId = input.academicYearId ?? (await currentYearId());
  const year = await prisma.academicYear.findFirst({ where: { id: academicYearId } });
  if (!year) throw ApiError.notFound('Academic year not found');

  const count = await prisma.term.count({ where: { academicYearId } });
  try {
    const row = await prisma.term.create({
      data: {
        schoolId,
        academicYearId,
        name: input.name,
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
        sortOrder: count,
      },
      include: { academicYear: { select: { name: true } } },
    });
    return toTerm(row);
  } catch (error) {
    if (duplicate(error)) throw ApiError.conflict(`There is already a term called “${input.name}”`);
    throw error;
  }
}

export async function updateTerm(id: string, input: UpdateTermInput): Promise<TermSummary> {
  const found = await prisma.term.findFirst({ where: { id } });
  if (!found) throw ApiError.notFound('Term not found');
  try {
    const row = await prisma.term.update({
      where: { id },
      data: input,
      include: { academicYear: { select: { name: true } } },
    });
    return toTerm(row);
  } catch (error) {
    if (duplicate(error)) throw ApiError.conflict('There is already a term with that name');
    throw error;
  }
}

// ---------------------------------------------------------------------------
// What each class level is graded on
// ---------------------------------------------------------------------------

function toArea(row: {
  id: string;
  classLevelId: string;
  group: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}): ReportAreaSummary {
  return {
    id: row.id,
    classLevelId: row.classLevelId,
    group: row.group,
    name: row.name,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export async function listAreas(classLevelId?: string): Promise<ReportAreaSummary[]> {
  const rows = await prisma.reportArea.findMany({
    where: classLevelId ? { classLevelId } : {},
    orderBy: [{ classLevelId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toArea);
}

async function assertClassLevel(classLevelId: string): Promise<void> {
  const level = await prisma.classLevel.findFirst({ where: { id: classLevelId } });
  if (!level) throw ApiError.notFound('Class level not found');
}

/** After everything already in the group, so a new line goes at the end. */
async function nextSort(classLevelId: string, group: string): Promise<number> {
  const groupBase = group === 'Subjects' ? 0 : group === 'Development' ? 100 : 200;
  const last = await prisma.reportArea.findFirst({
    where: { classLevelId, group },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return last ? last.sortOrder + 1 : groupBase;
}

export async function createArea(input: CreateReportAreaInput): Promise<ReportAreaSummary> {
  const schoolId = requireSchoolId();
  await assertClassLevel(input.classLevelId);
  try {
    const row = await prisma.reportArea.create({
      data: {
        schoolId,
        classLevelId: input.classLevelId,
        group: input.group,
        name: input.name,
        sortOrder: await nextSort(input.classLevelId, input.group),
      },
    });
    return toArea(row);
  } catch (error) {
    if (duplicate(error)) throw ApiError.conflict(`“${input.name}” is already on this report card`);
    throw error;
  }
}

export async function updateArea(
  id: string,
  input: UpdateReportAreaInput,
): Promise<ReportAreaSummary> {
  const found = await prisma.reportArea.findFirst({ where: { id } });
  if (!found) throw ApiError.notFound('Not found');
  try {
    return toArea(await prisma.reportArea.update({ where: { id }, data: input }));
  } catch (error) {
    if (duplicate(error)) throw ApiError.conflict('That is already on this report card');
    throw error;
  }
}

/**
 * Adds a ready-made set: the book subjects of the catalogue, or the usual
 * developmental areas. Anything already there is left as it is.
 */
export async function addAreaPreset(input: AddReportAreaPresetInput): Promise<ReportAreaSummary[]> {
  const schoolId = requireSchoolId();
  await assertClassLevel(input.classLevelId);

  const group = input.preset === 'subjects' ? 'Subjects' : 'Development';
  const names =
    input.preset === 'subjects'
      ? (
          await prisma.bookSubject.findMany({
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: { name: true },
          })
        ).map((subject) => subject.name)
      : [...DEVELOPMENT_AREA_PRESETS];

  const existing = await prisma.reportArea.findMany({
    where: { classLevelId: input.classLevelId, group },
    select: { name: true },
  });
  const have = new Set(existing.map((row) => row.name.toLowerCase()));
  let sortOrder = await nextSort(input.classLevelId, group);

  const add = names.filter((name) => !have.has(name.toLowerCase()));
  if (add.length > 0) {
    await prisma.reportArea.createMany({
      data: add.map((name) => ({
        schoolId,
        classLevelId: input.classLevelId,
        group,
        name,
        sortOrder: sortOrder++,
      })),
      skipDuplicates: true,
    });
  }
  return listAreas(input.classLevelId);
}

// ---------------------------------------------------------------------------
// Filling in
// ---------------------------------------------------------------------------

async function loadClassroom(classroomId: string) {
  await assertTeacherOwnsClassroom(classroomId);
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId },
    include: { classLevel: { select: { id: true, name: true } } },
  });
  if (!classroom) throw ApiError.notFound('Classroom not found');
  return classroom;
}

async function loadTerm(termId: string, academicYearId: string): Promise<TermRow> {
  const term = await prisma.term.findFirst({
    where: { id: termId },
    include: { academicYear: { select: { name: true } } },
  });
  if (!term) throw ApiError.notFound('Term not found');
  if (term.academicYearId !== academicYearId) {
    throw ApiError.badRequest('That term is from a different academic year');
  }
  return term;
}

function count(statuses: Array<ReportGridChild['status']>): ReportCounts {
  return {
    notStarted: statuses.filter((s) => s === 'NOT_STARTED').length,
    draft: statuses.filter((s) => s === 'DRAFT').length,
    submitted: statuses.filter((s) => s === 'SUBMITTED').length,
    published: statuses.filter((s) => s === 'PUBLISHED').length,
  };
}

/** Everything the grid needs: the children, what they are graded on, their grades. */
export async function reportGrid(classroomId: string, termId: string): Promise<ReportGrid> {
  const classroom = await loadClassroom(classroomId);
  const term = await loadTerm(termId, classroom.academicYearId);

  const [enrolments, areas, scale, cards] = await Promise.all([
    prisma.studentEnrolment.findMany({
      where: { classroomId, status: 'ACTIVE' },
      select: {
        rollNo: true,
        student: { select: { id: true, firstName: true, middleName: true, lastName: true } },
      },
    }),
    prisma.reportArea.findMany({
      where: { classLevelId: classroom.classLevelId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    getScale(),
    prisma.reportCard.findMany({
      where: { termId, classroomId },
      include: { grades: { select: { areaId: true, gradeLevelId: true } } },
    }),
  ]);

  const byStudent = new Map(cards.map((card) => [card.studentId, card]));
  const children: ReportGridChild[] = enrolments
    .map(({ student, rollNo }) => {
      const card = byStudent.get(student.id);
      const grades: Record<string, string | null> = {};
      for (const grade of card?.grades ?? []) grades[grade.areaId] = grade.gradeLevelId;
      return {
        studentId: student.id,
        fullName: studentName(student),
        rollNo,
        reportCardId: card?.id ?? null,
        status: card?.status ?? ('NOT_STARTED' as const),
        remarks: card?.remarks ?? null,
        grades,
        graded: Object.values(grades).filter(Boolean).length,
      };
    })
    .sort(
      (a, b) =>
        (Number(a.rollNo) || Number.MAX_SAFE_INTEGER) -
          (Number(b.rollNo) || Number.MAX_SAFE_INTEGER) || a.fullName.localeCompare(b.fullName),
    );

  return {
    classroom: {
      id: classroom.id,
      label: classroomLabel(classroom),
      classLevelId: classroom.classLevelId,
    },
    term: toTerm(term),
    areas: areas.map(toArea),
    scale,
    children,
    counts: count(children.map((child) => child.status)),
  };
}

/**
 * Saves one child's grades and remarks.
 *
 * A teacher may change a card only while it is a draft — once handed to the
 * office it is the office's. The office may change anything not yet sent to
 * the family.
 */
export async function saveReportCard(
  input: SaveReportCardInput,
  actorUserId: string,
): Promise<ReportGridChild> {
  const schoolId = requireSchoolId();
  const enrolment = await prisma.studentEnrolment.findFirst({
    where: { studentId: input.studentId, status: 'ACTIVE' },
    select: { classroomId: true },
  });
  if (!enrolment) throw ApiError.notFound('Student not found');

  const classroom = await loadClassroom(enrolment.classroomId);
  await loadTerm(input.termId, classroom.academicYearId);

  const existing = await prisma.reportCard.findFirst({
    where: { termId: input.termId, studentId: input.studentId },
  });
  if (existing?.status === 'PUBLISHED') {
    throw ApiError.conflict('This report card has been published. Unpublish it to make changes.');
  }
  if (existing?.status === 'SUBMITTED' && !isOffice()) {
    throw ApiError.conflict('This report card is with the office now');
  }

  // Every area must be on this class level's card, every grade on this scale.
  const areaIds = [...new Set(input.grades.map((g) => g.areaId))];
  const levelIds = [
    ...new Set(input.grades.map((g) => g.gradeLevelId).filter(Boolean)),
  ] as string[];
  const [areas, levels] = await Promise.all([
    prisma.reportArea.count({
      where: { id: { in: areaIds }, classLevelId: classroom.classLevelId },
    }),
    prisma.gradeLevel.count({ where: { id: { in: levelIds }, isActive: true } }),
  ]);
  if (areas !== areaIds.length)
    throw ApiError.badRequest('That is not on this class’s report card');
  if (levels !== levelIds.length) throw ApiError.badRequest('That grade is not on the scale');

  const card = await prisma.$transaction(async (tx) => {
    const saved = await tx.reportCard.upsert({
      where: { termId_studentId: { termId: input.termId, studentId: input.studentId } },
      create: {
        schoolId,
        termId: input.termId,
        studentId: input.studentId,
        classroomId: classroom.id,
        remarks: input.remarks ?? null,
        enteredById: actorUserId,
      },
      update: {
        classroomId: classroom.id,
        ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
        enteredById: actorUserId,
      },
    });
    for (const grade of input.grades) {
      await tx.reportCardGrade.upsert({
        where: { reportCardId_areaId: { reportCardId: saved.id, areaId: grade.areaId } },
        create: {
          schoolId,
          reportCardId: saved.id,
          areaId: grade.areaId,
          gradeLevelId: grade.gradeLevelId,
        },
        update: { gradeLevelId: grade.gradeLevelId },
      });
    }
    return tx.reportCard.findUniqueOrThrow({
      where: { id: saved.id },
      include: {
        grades: { select: { areaId: true, gradeLevelId: true } },
        student: { select: { firstName: true, middleName: true, lastName: true } },
      },
    });
  });

  const rollNo = await prisma.studentEnrolment.findFirst({
    where: { studentId: input.studentId, status: 'ACTIVE' },
    select: { rollNo: true },
  });
  const grades: Record<string, string | null> = {};
  for (const grade of card.grades) grades[grade.areaId] = grade.gradeLevelId;
  return {
    studentId: card.studentId,
    fullName: studentName(card.student),
    rollNo: rollNo?.rollNo ?? null,
    reportCardId: card.id,
    status: card.status,
    remarks: card.remarks,
    grades,
    graded: Object.values(grades).filter(Boolean).length,
  };
}

/** The teacher hands the class's cards to the office. */
export async function submitClass(classroomId: string, termId: string): Promise<ReportGrid> {
  const classroom = await loadClassroom(classroomId);
  await loadTerm(termId, classroom.academicYearId);
  const updated = await prisma.reportCard.updateMany({
    where: { classroomId, termId, status: 'DRAFT' },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  });
  if (updated.count === 0) {
    throw ApiError.badRequest('There are no report cards in this class to hand over yet');
  }
  return reportGrid(classroomId, termId);
}

/** The office hands the class back to the teacher to change something. */
export async function returnClass(classroomId: string, termId: string): Promise<ReportGrid> {
  const classroom = await loadClassroom(classroomId);
  await loadTerm(termId, classroom.academicYearId);
  await prisma.reportCard.updateMany({
    where: { classroomId, termId, status: 'SUBMITTED' },
    data: { status: 'DRAFT', submittedAt: null },
  });
  return reportGrid(classroomId, termId);
}

interface Snapshot extends Omit<ReportCardView, 'id' | 'status' | 'publishedAt'> {
  classTeacherUserId: string | null;
}

/** The card as it stands, built from the live rows. */
async function buildSnapshot(reportCardId: string): Promise<Snapshot> {
  const card = await prisma.reportCard.findFirstOrThrow({
    where: { id: reportCardId },
    include: {
      term: { include: { academicYear: { select: { name: true } } } },
      classroom: { include: { classLevel: { select: { name: true } } } },
      student: true,
      grades: { include: { gradeLevel: { select: { label: true } } } },
    },
  });

  const [areas, scale, enrolment, teacher, school] = await Promise.all([
    prisma.reportArea.findMany({
      where: { classLevelId: card.classroom.classLevelId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    getScale(),
    prisma.studentEnrolment.findFirst({
      where: { studentId: card.studentId, classroomId: card.classroomId },
      select: { rollNo: true },
    }),
    prisma.classroomTeacher.findFirst({
      where: { classroomId: card.classroomId, endedOn: null, role: 'CLASS_TEACHER' },
      select: { userId: true, user: { select: { name: true } } },
    }),
    prisma.school.findUniqueOrThrow({
      where: { id: requireSchoolId() },
      select: { principalName: true },
    }),
  ]);

  const gradeOf = new Map(card.grades.map((g) => [g.areaId, g.gradeLevel?.label ?? null]));
  const groups: Snapshot['groups'] = [];
  for (const area of areas) {
    let group = groups.find((g) => g.group === area.group);
    if (!group) {
      group = { group: area.group, rows: [] };
      groups.push(group);
    }
    group.rows.push({ area: area.name, grade: gradeOf.get(area.id) ?? null });
  }

  return {
    term: card.term.name,
    academicYear: card.term.academicYear.name,
    student: {
      id: card.student.id,
      fullName: studentName(card.student),
      admissionNo: card.student.admissionNo,
      rollNo: enrolment?.rollNo ?? null,
      dateOfBirth: card.student.dateOfBirth.toISOString(),
    },
    classroom: classroomLabel(card.classroom),
    groups,
    scale: scale.map((level) => ({ label: level.label, description: level.description })),
    remarks: card.remarks,
    classTeacher: teacher?.user.name ?? null,
    classTeacherUserId: teacher?.userId ?? null,
    principal: school.principalName,
  };
}

/**
 * Sends cards to families: the whole class, or the children named. Each card
 * is frozen as it is now, and each family told.
 */
export async function publish(
  classroomId: string,
  termId: string,
  studentIds: string[] | undefined,
  actorUserId: string,
): Promise<ReportGrid> {
  const schoolId = requireSchoolId();
  const classroom = await loadClassroom(classroomId);
  const term = await loadTerm(termId, classroom.academicYearId);

  const cards = await prisma.reportCard.findMany({
    where: {
      classroomId,
      termId,
      status: { in: ['DRAFT', 'SUBMITTED'] },
      ...(studentIds ? { studentId: { in: studentIds } } : {}),
    },
    select: { id: true, studentId: true, student: { select: { firstName: true } } },
  });
  if (cards.length === 0) throw ApiError.badRequest('There is nothing here to publish');

  const now = new Date();
  for (const card of cards) {
    const snapshot = await buildSnapshot(card.id);
    await prisma.reportCard.update({
      where: { id: card.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: now,
        publishedById: actorUserId,
        snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }

  await writeAuditLog({
    action: 'RESULTS_PUBLISHED',
    entity: 'Classroom',
    entityId: classroomId,
    schoolId,
    actorUserId,
    metadata: { termId, cards: cards.length },
  });

  for (const card of cards) {
    const guardians = await guardianUserIdsFor([card.studentId]);
    if (guardians.length === 0) continue;
    notifySafe({
      schoolId,
      userIds: guardians,
      type: 'RESULT_PUBLISHED',
      title: 'Report card',
      body: `${card.student.firstName}’s ${term.name} report card is ready`,
      entityType: 'ReportCard',
      entityId: card.id,
    });
  }

  return reportGrid(classroomId, termId);
}

/** Takes a published card back to correct it. The family loses it until republished. */
export async function unpublish(reportCardId: string, actorUserId: string): Promise<void> {
  const schoolId = requireSchoolId();
  const card = await prisma.reportCard.findFirst({ where: { id: reportCardId } });
  if (!card) throw ApiError.notFound('Report card not found');
  if (card.status !== 'PUBLISHED') return;

  await prisma.reportCard.update({
    where: { id: reportCardId },
    data: { status: 'SUBMITTED', publishedAt: null, snapshotJson: Prisma.DbNull },
  });
  await writeAuditLog({
    action: 'RESULTS_UNPUBLISHED',
    entity: 'ReportCard',
    entityId: reportCardId,
    schoolId,
    actorUserId,
  });
}

/** Each class's progress through a term, for the office. */
export async function overview(termId: string): Promise<ResultsClassroomRow[]> {
  const term = await prisma.term.findFirst({ where: { id: termId } });
  if (!term) throw ApiError.notFound('Term not found');

  const classrooms = await prisma.classroom.findMany({
    where: { academicYearId: term.academicYearId },
    include: {
      classLevel: { select: { name: true, sortOrder: true } },
      _count: { select: { enrolments: { where: { status: 'ACTIVE' } } } },
    },
    orderBy: [{ classLevel: { sortOrder: 'asc' } }, { section: 'asc' }],
  });
  const cards = await prisma.reportCard.groupBy({
    by: ['classroomId', 'status'],
    where: { termId },
    _count: { _all: true },
  });

  return classrooms.map((classroom) => {
    const of = (status: string) =>
      cards.find((c) => c.classroomId === classroom.id && c.status === status)?._count._all ?? 0;
    const draft = of('DRAFT');
    const submitted = of('SUBMITTED');
    const published = of('PUBLISHED');
    const children = classroom._count.enrolments;
    return {
      classroomId: classroom.id,
      label: classroomLabel(classroom),
      children,
      notStarted: Math.max(0, children - draft - submitted - published),
      draft,
      submitted,
      published,
    };
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** The card as a reader sees it: the frozen copy once published, live before. */
export async function viewOf(
  reportCardId: string,
): Promise<ReportCardView & { classTeacherUserId: string | null }> {
  const card = await prisma.reportCard.findFirst({ where: { id: reportCardId } });
  if (!card) throw ApiError.notFound('Report card not found');
  const snapshot =
    card.status === 'PUBLISHED' && card.snapshotJson
      ? (card.snapshotJson as unknown as Snapshot)
      : await buildSnapshot(card.id);
  return {
    ...snapshot,
    id: card.id,
    status: card.status,
    publishedAt: card.publishedAt?.toISOString() ?? null,
  };
}

/**
 * May the caller read this card? The office, any. A teacher, their own
 * classes'. A family, their own child's — and only once published.
 */
export async function assertCanReadCard(reportCardId: string): Promise<void> {
  const card = await prisma.reportCard.findFirst({
    where: { id: reportCardId },
    select: { studentId: true, classroomId: true, status: true },
  });
  if (!card) throw ApiError.notFound('Report card not found');
  const who = role();
  if (OFFICE.has(who)) return;
  if (who === 'TEACHER') {
    await assertTeacherOwnsClassroom(card.classroomId);
    return;
  }
  await assertCanReadStudent(card.studentId);
  if (card.status !== 'PUBLISHED') throw ApiError.notFound('Report card not found');
}

/** A child's published cards, newest first. */
export async function reportCardsForChild(studentId: string): Promise<ReportCardListItem[]> {
  await assertCanReadStudent(studentId);
  const cards = await prisma.reportCard.findMany({
    where: { studentId, status: 'PUBLISHED' },
    include: { term: { include: { academicYear: { select: { name: true, startDate: true } } } } },
  });
  return cards
    .sort(
      (a, b) =>
        b.term.academicYear.startDate.getTime() - a.term.academicYear.startDate.getTime() ||
        b.term.sortOrder - a.term.sortOrder,
    )
    .map((card) => ({
      id: card.id,
      termId: card.termId,
      term: card.term.name,
      academicYear: card.term.academicYear.name,
      publishedAt: (card.publishedAt ?? card.updatedAt).toISOString(),
    }));
}

/** One child's card for a term, as the app draws it. */
export async function reportCardForChild(
  studentId: string,
  termId: string,
): Promise<ReportCardView> {
  await assertCanReadStudent(studentId);
  const card = await prisma.reportCard.findFirst({
    where: { studentId, termId },
    select: { id: true },
  });
  if (!card) throw ApiError.notFound('Report card not found');
  await assertCanReadCard(card.id);
  const { classTeacherUserId: _, ...view } = await viewOf(card.id);
  return view;
}

/** The ids of a class's cards for a term, in register order, for printing. */
export async function classCardIds(classroomId: string, termId: string): Promise<string[]> {
  const grid = await reportGrid(classroomId, termId);
  return grid.children.map((child) => child.reportCardId).filter((id): id is string => !!id);
}

// ---------------------------------------------------------------------------
// PDFs
// ---------------------------------------------------------------------------

async function renderCards(ids: string[], title: string): Promise<Buffer> {
  const school = await schoolBranding();
  const doc = createDocument(title, { size: 'A4', margin: 0 });
  for (const [index, id] of ids.entries()) {
    if (index > 0) doc.addPage({ size: 'A4', margin: 0 });
    const view = await viewOf(id);
    drawReportCard(doc, {
      view,
      school,
      classTeacherSignature: await signatureOf(view.classTeacherUserId),
    });
  }
  return toBuffer(doc);
}

function slug(value: string): string {
  return value
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** One child's card. */
export async function reportCardPdf(
  reportCardId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  await assertCanReadCard(reportCardId);
  const view = await viewOf(reportCardId);
  return {
    buffer: await renderCards([reportCardId], `Report card — ${view.student.fullName}`),
    filename: `report-card-${slug(view.student.fullName)}-${slug(view.term)}.pdf`,
  };
}

/** A whole class's cards in one file, one child per page. */
export async function classPdf(
  classroomId: string,
  termId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const grid = await reportGrid(classroomId, termId);
  const ids = grid.children.map((child) => child.reportCardId).filter((id): id is string => !!id);
  if (ids.length === 0) {
    throw ApiError.badRequest('No report cards have been filled in for this class yet');
  }
  return {
    buffer: await renderCards(ids, `Report cards — ${grid.classroom.label}`),
    filename: `report-cards-${slug(grid.classroom.label)}-${slug(grid.term.name)}.pdf`,
  };
}

export { classroomLabel };
