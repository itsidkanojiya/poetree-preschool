import { prisma, prismaUnscoped } from '../db/prisma.js';
import { getRequestContext, requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { assertCanReadStudent, guardianStudentIds } from './scope.service.js';
import { closeHomeworkForActivity } from './homework.service.js';
import { composeContent, upconvertStoredContent } from './question.service.js';
import { logger } from '../lib/logger.js';
import { studentName } from '../lib/names.js';

/**
 * Progress tracking — the bridge between the ERP and the learning activities.
 *
 * This is the module most at risk of producing decorative numbers, so the rule
 * is that every figure must answer a teaching question and be explainable to a
 * parent in one sentence.
 *
 * Deliberately NOT tracked: time-on-app leaderboards, streaks, class rankings.
 * They pressure four-year-olds and teach nobody anything.
 */

/**
 * How many recent attempts a mastery figure is based on.
 *
 * A child who struggled in September and has since learned the letter should
 * read as competent now, so old attempts fall out of the window rather than
 * dragging the number down forever.
 */
const MASTERY_WINDOW = 10;

export interface RecordAttemptInput {
  studentId: string;
  activityId: string;
  correctCount: number;
  totalCount: number;
  timeSpentSeconds?: number;
  resultJson?: unknown;
}

export interface SkillProgressRow {
  skillId: string;
  skillCode: string;
  skillName: string;
  masteryPercent: number;
  correctCount: number;
  totalCount: number;
  attemptsCount: number;
  lastAssessedAt: string | null;
  /** The sentence a teacher or parent actually reads. */
  basis: string;
}

/**
 * Records one go at an activity and refreshes the affected skill rollup.
 *
 * The attempt is the source of truth; the rollup exists only so a progress
 * screen is one indexed read instead of a scan of everything a child has ever
 * done, and it can be rebuilt from attempts at any time.
 */
export async function recordAttempt(input: RecordAttemptInput): Promise<SkillProgressRow> {
  const schoolId = requireSchoolId();

  if (input.totalCount <= 0) {
    throw ApiError.badRequest('An attempt must have at least one question');
  }
  if (input.correctCount < 0 || input.correctCount > input.totalCount) {
    throw ApiError.badRequest('Correct answers cannot exceed the number of questions');
  }

  await assertMayRecordFor(input.studentId);
  const activity = await activeActivity(input.activityId);

  const year = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  if (!year) throw ApiError.badRequest('Set a current academic year first');

  await prisma.activityAttempt.create({
    data: {
      schoolId,
      studentId: input.studentId,
      activityId: input.activityId,
      correctCount: input.correctCount,
      totalCount: input.totalCount,
      timeSpentSeconds: input.timeSpentSeconds ?? 0,
      completedAt: new Date(),
      resultJson: (input.resultJson ?? undefined) as never,
    },
  });
  // Finishing with a score is finishing: the chapter counts it as done.
  await markDone(schoolId, input.studentId, input.activityId);

  // The ERP half: homework that *was* this activity closes itself. Best
  // effort — a child who has finished their work must not see an error because
  // the bookkeeping behind it failed.
  try {
    await closeHomeworkForActivity({
      schoolId,
      studentId: input.studentId,
      activityId: input.activityId,
      correctCount: input.correctCount,
      totalCount: input.totalCount,
    });
  } catch (error) {
    logger.error('Could not close homework for a played activity', {
      studentId: input.studentId,
      activityId: input.activityId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return recomputeSkill(schoolId, input.studentId, activity.skillId, year.id);
}

/**
 * Records that a child may be credited by the caller: the child is at this
 * school, and a parent is crediting their own child. Holding progress:record
 * says they may record; it says nothing about for whom.
 */
async function assertMayRecordFor(studentId: string): Promise<void> {
  // Resolved through the scoped client, so a child at another school cannot be
  // credited with anything.
  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const context = getRequestContext();
  if (context?.role === 'PARENT') {
    const mine = await guardianStudentIds();
    if (!mine.includes(studentId)) throw ApiError.notFound('Student not found');
  }
}

/** An activity a child may be credited with. Publication-owned, so unscoped. */
async function activeActivity(activityId: string): Promise<{ id: string; skillId: string }> {
  const activity = await prismaUnscoped.learningActivity.findFirst({
    where: { id: activityId, isActive: true },
    select: { id: true, skillId: true },
  });
  if (!activity) throw ApiError.badRequest('That activity does not exist');
  return activity;
}

/** Done is done: written once, however often the activity is played again. */
async function markDone(schoolId: string, studentId: string, activityId: string): Promise<void> {
  await prismaUnscoped.activityCompletion.upsert({
    where: { studentId_activityId: { studentId, activityId } },
    create: { schoolId, studentId, activityId },
    update: {},
  });
}

/**
 * Records that a child finished an activity that has no score — a set of
 * flashcards, looked through to the end.
 *
 * Scored activities need not call this: their attempt records it. Nothing here
 * touches the skills figures, which are built from scores alone.
 */
export async function recordCompletion(
  activityId: string,
  studentId: string,
): Promise<{ completed: true }> {
  const schoolId = requireSchoolId();
  await assertMayRecordFor(studentId);
  await activeActivity(activityId);
  await markDone(schoolId, studentId, activityId);
  return { completed: true };
}

/**
 * Recalculates one skill from the child's most recent attempts.
 *
 * Recomputed from attempts rather than incremented, so a rollup can never drift
 * away from the records underneath it.
 */
async function recomputeSkill(
  schoolId: string,
  studentId: string,
  skillId: string,
  academicYearId: string,
): Promise<SkillProgressRow> {
  const attempts = await prisma.activityAttempt.findMany({
    where: { studentId, activity: { skillId } },
    // The id tiebreak matters: two attempts saved in the same millisecond would
    // otherwise leave "the most recent ten" undefined, so the same child could
    // read 80% or 90% on consecutive loads with no new attempt in between.
    // cuid() carries a monotonic prefix, so descending id is descending time.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MASTERY_WINDOW,
    select: { correctCount: true, totalCount: true, createdAt: true },
  });

  const correct = attempts.reduce((sum, a) => sum + a.correctCount, 0);
  const total = attempts.reduce((sum, a) => sum + a.totalCount, 0);
  const mastery = total === 0 ? 0 : Math.round((correct / total) * 100);

  await prisma.studentSkillProgress.upsert({
    where: { studentId_skillId_academicYearId: { studentId, skillId, academicYearId } },
    create: {
      schoolId,
      studentId,
      skillId,
      academicYearId,
      masteryPercent: mastery,
      correctCount: correct,
      totalCount: total,
      attemptsCount: attempts.length,
      lastAssessedAt: attempts[0]?.createdAt ?? new Date(),
    },
    update: {
      masteryPercent: mastery,
      correctCount: correct,
      totalCount: total,
      attemptsCount: attempts.length,
      lastAssessedAt: attempts[0]?.createdAt ?? new Date(),
    },
  });

  const skill = await prismaUnscoped.skill.findFirstOrThrow({
    where: { id: skillId },
    select: { code: true, name: true },
  });

  return {
    skillId,
    skillCode: skill.code,
    skillName: skill.name,
    masteryPercent: mastery,
    correctCount: correct,
    totalCount: total,
    attemptsCount: attempts.length,
    lastAssessedAt: attempts[0]?.createdAt.toISOString() ?? null,
    basis: describe(correct, total, attempts.length),
  };
}

/**
 * The figure never appears without what it is made of.
 *
 * "90%" invites an argument; "90% — 18 of 20 questions across 4 activities"
 * lets a parent and a teacher have the same conversation about the same thing.
 */
function describe(correct: number, total: number, attempts: number): string {
  if (attempts === 0) return 'Not attempted yet';
  return `${correct} of ${total} question${total === 1 ? '' : 's'} across ${attempts} attempt${attempts === 1 ? '' : 's'}`;
}

/** Every skill for one child, including those not yet attempted. */
export async function studentProgress(studentId: string): Promise<SkillProgressRow[]> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();

  // A parent sees their own children and nobody else's. The permission says
  // what they may do; this says whose data they may do it to.
  if (context.role === 'PARENT') {
    const mine = await guardianStudentIds();
    if (!mine.includes(studentId)) throw ApiError.notFound('Student not found');
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const [skills, progress] = await Promise.all([
    prismaUnscoped.skill.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }],
      select: { id: true, code: true, name: true },
    }),
    prisma.studentSkillProgress.findMany({ where: { studentId } }),
  ]);

  const bySkill = new Map(progress.map((p) => [p.skillId, p]));

  // Skills with no attempts are listed rather than omitted: "not started" is
  // information a teacher needs, and a short list would hide the gap.
  return skills.map((skill) => {
    const row = bySkill.get(skill.id);
    return {
      skillId: skill.id,
      skillCode: skill.code,
      skillName: skill.name,
      masteryPercent: row?.masteryPercent ?? 0,
      correctCount: row?.correctCount ?? 0,
      totalCount: row?.totalCount ?? 0,
      attemptsCount: row?.attemptsCount ?? 0,
      lastAssessedAt: row?.lastAssessedAt.toISOString() ?? null,
      basis: describe(row?.correctCount ?? 0, row?.totalCount ?? 0, row?.attemptsCount ?? 0),
    };
  });
}

export interface ClassroomProgressRow {
  studentId: string;
  fullName: string;
  skillsAttempted: number;
  averageMastery: number;
  /** Skills below 50% with at least one attempt — where help is needed. */
  needsAttention: string[];
}

/** The class at a glance, for a teacher deciding what to revisit. */
export async function classroomProgress(classroomId: string): Promise<ClassroomProgressRow[]> {
  const enrolments = await prisma.studentEnrolment.findMany({
    where: { classroomId, status: 'ACTIVE' },
    include: {
      student: { select: { id: true, firstName: true, middleName: true, lastName: true } },
    },
    orderBy: [{ rollNo: 'asc' }],
  });

  if (enrolments.length === 0) return [];

  const progress = await prisma.studentSkillProgress.findMany({
    where: { studentId: { in: enrolments.map((e) => e.studentId) } },
    include: { skill: { select: { name: true } } },
  });

  const byStudent = new Map<string, typeof progress>();
  for (const row of progress) {
    const list = byStudent.get(row.studentId) ?? [];
    list.push(row);
    byStudent.set(row.studentId, list);
  }

  return enrolments.map((enrolment) => {
    const rows = byStudent.get(enrolment.studentId) ?? [];
    const attempted = rows.filter((r) => r.attemptsCount > 0);

    return {
      studentId: enrolment.studentId,
      fullName: studentName(enrolment.student),
      skillsAttempted: attempted.length,
      averageMastery:
        attempted.length === 0
          ? 0
          : Math.round(attempted.reduce((sum, r) => sum + r.masteryPercent, 0) / attempted.length),
      needsAttention: attempted
        .filter((r) => r.masteryPercent < 50)
        .map((r) => r.skill.name)
        .slice(0, 5),
    };
  });
}

/**
 * The catalogue, for an app deciding what to offer a child next.
 *
 * Narrowed to the books this school bought, and to one book when the app asks
 * for one. A question type outside any book reaches nobody — schools are given
 * books, not loose pages.
 *
 * Content is composed from question rows here rather than read off the stored
 * blob, so the app is served the shape it has always parsed while authoring
 * happens against rows. Activities that predate the rows fall back to their
 * stored JSON, lifted to the current shape on the way out.
 */
export async function listActivities(options?: {
  classLevelId?: string;
  bookId?: string;
  /** When given, each activity says whether this child has finished it. */
  studentId?: string;
}) {
  const schoolId = requireSchoolId();
  // Whether a child has finished something is theirs to know, and their
  // family's and teachers' — nobody else's.
  if (options?.studentId) await assertCanReadStudent(options.studentId);

  const entitled = await prismaUnscoped.schoolBook.findMany({
    where: { schoolId, enabled: true },
    select: { bookId: true },
  });
  const bookIds = entitled.map((row) => row.bookId);

  if (options?.bookId && !bookIds.includes(options.bookId)) {
    // Asking for a book this school does not have is not an error worth
    // explaining — it simply has nothing in it for them.
    return [];
  }

  const rows = await prismaUnscoped.learningActivity.findMany({
    where: {
      isActive: true,
      ...(options?.classLevelId ? { classLevelId: options.classLevelId } : {}),
      /**
       * What this child may be offered.
       *
       * A page reaches them if it is in the book they opened, or in one of the
       * books their school bought, or is one of the pages that belong in every
       * book. A page in no book at all still reaches everybody: that is what
       * the seeded catalogue is, and hiding it would empty the app.
       */
      ...(options?.bookId
        ? { OR: [{ books: { some: { bookId: options.bookId } } }, { allBooks: true }] }
        : {
            OR: [
              ...(bookIds.length > 0 ? [{ books: { some: { bookId: { in: bookIds } } } }] : []),
              { allBooks: true },
              { books: { none: {} } },
            ],
          }),
    },
    include: {
      skill: { select: { id: true, code: true, name: true } },
      books: { include: { book: { select: { id: true, name: true } } } },
      chapter: { select: { id: true, name: true } },
    },
    orderBy: [{ code: 'asc' }],
  });

  /**
   * The book the child opened, for pages that belong to every book.
   *
   * Those have no link rows to read a name from, so without this they arrive
   * saying they are in no book at all.
   */
  const asked = options?.bookId
    ? await prismaUnscoped.book.findUnique({
        where: { id: options.bookId },
        select: { id: true, name: true },
      })
    : null;

  const finished = options?.studentId
    ? new Set(
        (
          await prismaUnscoped.activityCompletion.findMany({
            where: {
              studentId: options.studentId,
              activityId: { in: rows.map((row) => row.id) },
            },
            select: { activityId: true },
          })
        ).map((row) => row.activityId),
      )
    : null;

  return Promise.all(
    rows.map(async (row) => {
      /**
       * The book to report this page under.
       *
       * When a book was asked for, it is that one — the child opened it, and a
       * page shared with two other books should not announce itself as one of
       * theirs. Otherwise the first it is linked to, which for the great
       * majority is the only one.
       */
      const book =
        row.books.find((link) => link.bookId === options?.bookId)?.book ??
        (row.allBooks ? asked : null) ??
        row.books[0]?.book ??
        null;

      return {
        ...row,
        book,
        // Films no longer lock a chapter's pages here. Still sent, as never
        // locked, for app versions on phones that read it.
        isLocked: false,
        // Null when no child was named.
        completedByChild: finished ? finished.has(row.id) : null,
        contentJson:
          (await composeContent({ id: row.id, type: row.type })) ??
          upconvertStoredContent(row.contentJson),
      };
    }),
  );
}
