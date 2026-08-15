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
import { writeAuditLog } from './audit.service.js';
import { problemWith, upconvertStoredContent } from './question.service.js';

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
  TRACING: 'TRACING',
  MATCHING: 'MATCHING',
  COUNTING: 'COUNTING',
  SORTING: 'SORTING',
  COLOURING: 'COLOURING',
  FLASHCARD: 'FLASHCARD',
  RHYME: 'RHYME',
  STORY: 'STORY',
};

const activityInclude = {
  skill: { select: { id: true, code: true, name: true } },
  classLevel: { select: { id: true, code: true } },
  book: { select: { id: true, name: true } },
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
    book: row.book,
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
  classLevelId?: string;
  type?: string;
  search?: string;
  includeInactive?: boolean;
}): Promise<Paginated<CatalogueActivity>> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;

  const where: Prisma.LearningActivityWhereInput = {
    ...(query.skillId ? { skillId: query.skillId } : {}),
    ...(query.bookId ? { bookId: query.bookId } : {}),
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
  const content = parseContent(input.type, input.content);

  const skill = await prismaUnscoped.skill.findUnique({ where: { id: input.skillId } });
  if (!skill) throw ApiError.badRequest('Choose a skill that exists');

  const clash = await prismaUnscoped.learningActivity.findUnique({
    where: { code: input.code },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict(`An activity with the code ${input.code} already exists`);

  const row = await prismaUnscoped.learningActivity.create({
    data: {
      code: input.code,
      title: input.title,
      type: input.type as never,
      skillId: input.skillId,
      bookId: input.bookId ?? null,
      classLevelId: input.classLevelId ?? null,
      contentJson: content,
      isActive: input.isActive ?? true,
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
    select: { id: true, code: true, type: true, title: true, isActive: true },
  });
  if (!existing) throw ApiError.notFound('Activity not found');

  // The type is fixed once children have played it: changing it would leave
  // every past attempt scored against a different kind of question.
  const content =
    input.content === undefined ? undefined : parseContent(existing.type, input.content);

  const row = await prismaUnscoped.learningActivity.update({
    where: { id },
    data: {
      title: input.title,
      skillId: input.skillId,
      bookId: input.bookId,
      classLevelId: input.classLevelId,
      isActive: input.isActive,
      ...(content === undefined ? {} : { contentJson: content }),
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
