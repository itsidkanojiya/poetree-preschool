import type { Prisma } from '@prisma/client';
import {
  activityContentSchema,
  type ActivityContent,
  type CatalogueActivity,
  type CreateActivityInput,
  type Paginated,
  type UpdateActivityInput,
} from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { slugCode, uniqueCode } from '../lib/code.js';
import { writeAuditLog } from './audit.service.js';
import { problemWith, upconvertStoredContent } from './question.service.js';
import { assertChapterBelongsToBook } from './chapter.service.js';

/**
 * The publisher's activity catalogue.
 *
 * Deliberately unscoped: a `LearningActivity` has no `schoolId` and never
 * should. Poetree writes the letter-tracing activity once and every school it
 * sells to plays the same one — that is what makes this a publisher's product
 * rather than sixty schools each authoring their own alphabet.
 *
 * Which means these are the only write paths in the system that use
 * `prismaUnscoped` on purpose rather than by necessity, and the routes above
 * them are gated to PUBLICATION_ADMIN alone.
 */

/** The content shape each activity type must carry. */
const KIND_FOR_TYPE: Record<string, ActivityContent['kind']> = {
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  MATCHING: 'MATCHING',
  TRACING: 'TRACING',
  COUNTING: 'COUNTING',
  SORTING: 'SORTING',
  COLOURING: 'COLOURING',
  DRAG_DROP: 'DRAG_DROP',
  FLASHCARD: 'FLASHCARD',
  RHYME: 'RHYME',
  STORY: 'STORY',
};

const activityInclude = {
  skill: { select: { id: true, code: true, name: true } },
  classLevel: { select: { id: true, code: true } },
  books: {
    include: { book: { select: { id: true, name: true } } },
    orderBy: { sortOrder: 'asc' },
  },
  chapter: { select: { id: true, name: true } },
  _count: { select: { attempts: true } },
  // Bounded: at most a dozen questions with four options each. Counting them
  // here is what lets the list say whether a child can actually play this.
  questions: { where: { isActive: true }, include: { options: { orderBy: { sortOrder: 'asc' } } } },
} satisfies Prisma.LearningActivityInclude;

type ActivityRow = Prisma.LearningActivityGetPayload<{ include: typeof activityInclude }>;

function toSummary(row: ActivityRow): CatalogueActivity {
  /**
   * Counted from the question rows, which are where the content now lives.
   *
   * This read the stored `contentJson` blob, and went on reading it after the
   * questions were lifted into rows — so the moment the content contract grew
   * pictures, every choice activity in the catalogue was labelled "the app
   * cannot read this, it is invisible to every child" while children were
   * playing it perfectly well. A screen that cries wolf about six things is
   * worse than one that says nothing.
   *
   * The blob is still the answer for anything not yet lifted.
   */
  const usable = row.questions.filter((question) => problemWith(question, row.type) === null);
  const stored = activityContentSchema.safeParse(upconvertStoredContent(row.contentJson));

  const itemCount = row.questions.length > 0 ? usable.length : stored.success ? stored.data.items.length : 0;

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    type: row.type,
    isActive: row.isActive,
    skill: row.skill,
    // Every book it is a page of. `book` stays alongside as the first of them,
    // because a great deal of this product asks "which book is this in" and
    // most pages are still in exactly one.
    books: row.books.map((link) => link.book),
    book: row.books[0]?.book ?? null,
    allBooks: row.allBooks,
    chapter: row.chapter,
    classLevelId: row.classLevelId,
    classLevelCode: row.classLevel?.code ?? null,
    // What an editor needs at a glance: how many questions a child will meet.
    itemCount,
    /**
     * An activity nothing can play is not a small problem: the app refuses to
     * offer it, so it is invisible to every child until somebody notices.
     * Saying so in the list is how they notice.
     */
    isPlayable: itemCount > 0,
    attemptCount: row._count.attempts,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Checks authored content against the contract the app renders.
 *
 * Done here, on the way in, so a malformed activity is caught by the person
 * writing it rather than by a four-year-old who taps it and sees a blank
 * screen.
 */
function parseContent(type: string, contentJson: unknown): Prisma.InputJsonValue {
  const parsed = activityContentSchema.safeParse(contentJson);

  if (!parsed.success) {
    throw ApiError.badRequest(
      'The activity content does not match what the app can play',
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const expected = KIND_FOR_TYPE[type];
  if (parsed.data.kind !== expected) {
    throw ApiError.badRequest(
      `A ${type} activity must carry ${expected} content, not ${parsed.data.kind}`,
    );
  }

  return parsed.data as unknown as Prisma.InputJsonValue;
}

export async function listActivities(query: {
  page?: number;
  pageSize?: number;
  skillId?: string;
  bookId?: string;
  chapterId?: string;
  classLevelId?: string;
  type?: string;
  search?: string;
  includeInactive?: boolean;
}): Promise<Paginated<CatalogueActivity>> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;

  const where: Prisma.LearningActivityWhereInput = {
    ...(query.skillId ? { skillId: query.skillId } : {}),
    // A page counts as in this book if it is linked to it, or if it is one of
    // the pages that belong in every book.
    ...(query.bookId
      ? { OR: [{ books: { some: { bookId: query.bookId } } }, { allBooks: true }] }
      : {}),
    ...(query.chapterId ? { chapterId: query.chapterId } : {}),
    ...(query.classLevelId ? { classLevelId: query.classLevelId } : {}),
    ...(query.type ? { type: query.type as never } : {}),
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.search ? { title: { contains: query.search } } : {}),
  };

  const [rows, total] = await Promise.all([
    prismaUnscoped.learningActivity.findMany({
      where,
      include: activityInclude,
      orderBy: [{ skillId: 'asc' }, { code: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prismaUnscoped.learningActivity.count({ where }),
  ]);

  return {
    items: rows.map(toSummary),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** One activity, with its content — the editing view. */
export async function getActivity(
  id: string,
): Promise<CatalogueActivity & { content: unknown }> {
  const row = await prismaUnscoped.learningActivity.findUnique({
    where: { id },
    include: activityInclude,
  });
  if (!row) throw ApiError.notFound('Activity not found');

  return { ...toSummary(row), content: row.contentJson };
}

export async function createActivity(
  input: CreateActivityInput,
  actorUserId: string,
): Promise<CatalogueActivity> {
  // Absent for anything authored in the portal: its questions are rows.
  const content = input.content === undefined ? null : parseContent(input.type, input.content);
  // A chapter belongs to one book, so filing at creation only makes sense for
  // a page going into exactly one.
  if (input.chapterId) {
    const only = input.bookIds?.length === 1 ? input.bookIds[0]! : null;
    await assertChapterBelongsToBook(input.chapterId, only);
  }

  const skill = await prismaUnscoped.skill.findUnique({ where: { id: input.skillId } });
  if (!skill) throw ApiError.badRequest('Choose a skill that exists');

  const code =
    input.code ??
    (await uniqueCode(
      slugCode(input.title),
      async (candidate) =>
        (await prismaUnscoped.learningActivity.count({ where: { code: candidate } })) > 0,
    ));

  const clash = await prismaUnscoped.learningActivity.findUnique({
    where: { code },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict(`An activity with the code ${code} already exists`);

  const row = await prismaUnscoped.learningActivity.create({
    data: {
      code,
      title: input.title,
      type: input.type as never,
      skillId: input.skillId,
      chapterId: input.chapterId ?? null,
      classLevelId: input.classLevelId ?? null,
      allBooks: input.allBooks ?? false,
      ...(content === null ? {} : { contentJson: content }),
      isActive: input.isActive ?? true,
      books: {
        create: (input.bookIds ?? []).map((bookId, index) => ({
          bookId,
          sortOrder: index,
        })),
      },
    },
    include: activityInclude,
  });

  await writeAuditLog({
    action: 'ACTIVITY_CREATED',
    entity: 'LearningActivity',
    entityId: row.id,
    schoolId: null,
    actorUserId,
    after: { code: row.code, title: row.title, type: row.type },
  });

  return toSummary(row);
}

export async function updateActivity(
  id: string,
  input: UpdateActivityInput,
  actorUserId: string,
): Promise<CatalogueActivity> {
  const existing = await prismaUnscoped.learningActivity.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      type: true,
      title: true,
      isActive: true,
      books: { select: { bookId: true } },
    },
  });
  if (!existing) throw ApiError.notFound('Activity not found');

  /**
   * A chapter belongs to one book, so it only means anything for a page that
   * lives in one. Checked against the books it will have after this save, not
   * the ones it had before — otherwise moving a page and filing it in one go
   * is refused for a state that is about to stop being true.
   */
  const bookIds = input.bookIds ?? existing.books.map((link) => link.bookId);

  if (input.chapterId !== undefined && input.chapterId !== null) {
    if (bookIds.length !== 1) {
      throw ApiError.badRequest(
        'Only a page that lives in exactly one book can be filed in a chapter',
      );
    }
    await assertChapterBelongsToBook(input.chapterId, bookIds[0]!);
  }

  // The type is fixed once children have played it: changing it would leave
  // every past attempt scored against a different kind of question.
  const content =
    input.content === undefined ? undefined : parseContent(existing.type, input.content);

  const row = await prismaUnscoped.learningActivity.update({
    where: { id },
    data: {
      title: input.title,
      skillId: input.skillId,
      chapterId: input.chapterId,
      classLevelId: input.classLevelId,
      isActive: input.isActive,
      allBooks: input.allBooks,
      ...(content === undefined ? {} : { contentJson: content }),
      // Sent whole and replaced whole. A page removed from a book is only
      // expressible as the absence of it, so a partial list would be unable to
      // say "take this out of Phonics".
      ...(input.bookIds === undefined
        ? {}
        : {
            books: {
              deleteMany: {},
              create: input.bookIds.map((bookId, index) => ({ bookId, sortOrder: index })),
            },
          }),
    },
    include: activityInclude,
  });

  await writeAuditLog({
    action: 'ACTIVITY_UPDATED',
    entity: 'LearningActivity',
    entityId: id,
    schoolId: null,
    actorUserId,
    before: { title: existing.title, isActive: existing.isActive },
    after: { fields: Object.keys(input) },
  });

  return toSummary(row);
}

/**
 * Retiring an activity, which is a flag and never a delete.
 *
 * `ActivityAttempt` rows point at it, and those are the evidence behind every
 * mastery figure a parent has been shown. Deleting the activity would either
 * cascade the evidence away or leave a child's progress pointing at nothing.
 */
export async function setActive(
  id: string,
  isActive: boolean,
  actorUserId: string,
): Promise<CatalogueActivity> {
  return updateActivity(id, { isActive }, actorUserId);
}

/** The skills an activity can be filed under, for the pickers. */
export async function listSkills() {
  return prismaUnscoped.skill.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, classLevelId: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
}
