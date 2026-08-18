import type { Prisma } from '@prisma/client';
import {
  activityContentSchema,
  isMultiAnswer,
  isScored,
  type ActivityContent,
  type CreateQuestionInput,
  type QuestionRow,
  type QuestionWithContext,
  type UpdateQuestionInput,
} from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { writeAuditLog } from './audit.service.js';

/**
 * Questions, and turning them back into something the app can play.
 *
 * Authoring happens against rows — a person adds one question at a time, with a
 * picture on each option — but the app is served the same content shape it has
 * always parsed. That way the play engine, the scoring and the attempt records
 * are untouched by any of this.
 */

const questionInclude = {
  options: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ActivityQuestionInclude;

export type QuestionWithOptions = Prisma.ActivityQuestionGetPayload<{
  include: typeof questionInclude;
}>;

/** The path that serves a catalogue picture, never a bare file id. */
export function assetUrl(fileId: string | null): string | null {
  return fileId ? `/api/v1/catalogue/assets/${fileId}` : null;
}

type Strokes = Array<Array<{ x: number; y: number }>>;

function strokesOf(row: QuestionWithOptions): Strokes | null {
  return (row.strokesJson as Strokes | null) ?? null;
}

/**
 * What is wrong with this question, in words an author can act on.
 *
 * A scored question with no right answer is worse than a missing one: a
 * four-year-old taps every square and is told each time that they were wrong.
 */
export function problemWith(row: QuestionWithOptions, type: string): string | null {
  const scored = isScored(type as ActivityContent['kind']);

  if (type === 'TRACING') {
    const strokes = strokesOf(row);
    if (!strokes || strokes.length === 0) return 'No strokes to trace yet';
    return null;
  }

  if (!scored) {
    // Flashcards, rhymes and stories are looked at, not answered.
    return null;
  }

  const multi = isMultiAnswer(type as ActivityContent['kind']);

  if (row.options.length < 2) return 'Needs at least two things to choose between';
  // Six where several answers are wanted, because the point is a set to sift;
  // four otherwise, which is as much as a three-year-old can hold at once.
  if (row.options.length > (multi ? 6 : 4)) {
    return multi
      ? 'More than six choices is too many for this age'
      : 'More than four choices is too many for this age';
  }

  const correct = row.options.filter((option) => option.isCorrect).length;
  if (correct === 0) return 'Nothing is marked as the right answer';
  if (correct > 1 && !multi) return 'More than one answer is marked right';

  return null;
}

function toRow(row: QuestionWithOptions, type: string): QuestionRow {
  return {
    id: row.id,
    activityId: row.activityId,
    sortOrder: row.sortOrder,
    say: row.say,
    promptGlyph: row.promptGlyph,
    promptImageUrl: assetUrl(row.promptFileId),
    strokes: strokesOf(row),
    isActive: row.isActive,
    options: row.options.map((option) => ({
      id: option.id,
      text: option.text,
      glyph: option.glyph,
      imageUrl: assetUrl(option.fileId),
      isCorrect: option.isCorrect,
      sortOrder: option.sortOrder,
    })),
    problem: problemWith(row, type),
  };
}

async function activityOrThrow(activityId: string) {
  const activity = await prismaUnscoped.learningActivity.findUnique({
    where: { id: activityId },
    select: { id: true, type: true, title: true },
  });
  if (!activity) throw ApiError.notFound('Activity not found');
  return activity;
}

export async function listQuestions(activityId: string): Promise<QuestionRow[]> {
  const activity = await activityOrThrow(activityId);

  const rows = await prismaUnscoped.activityQuestion.findMany({
    where: { activityId },
    include: questionInclude,
    orderBy: { sortOrder: 'asc' },
  });

  return rows.map((row) => toRow(row, activity.type));
}

/**
 * Every question in the catalogue, newest page first.
 *
 * The per-activity list is what an author uses while writing one page. This is
 * the other view: everything that exists, so a question can be found without
 * remembering which page it was on.
 */
export async function listAllQuestions(query: {
  classLevelId?: string;
  bookId?: string;
  chapterId?: string;
  activityId?: string;
  type?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: QuestionWithContext[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;

  /**
   * Everything except the search narrows the page a question sits on rather
   * than the question itself, so they all fold into one `activity` clause —
   * two separate ones would silently replace each other.
   */
  const activity: Prisma.LearningActivityWhereInput = {
    ...(query.bookId ? { bookId: query.bookId } : {}),
    ...(query.chapterId ? { chapterId: query.chapterId } : {}),
    ...(query.type ? { type: query.type as never } : {}),
    // By the standard the *book* is for, not the activity's own level: a
    // standard is something a book belongs to, and that is how somebody
    // filtering by "Nursery" is thinking.
    ...(query.classLevelId ? { book: { classLevelId: query.classLevelId } } : {}),
  };

  const where: Prisma.ActivityQuestionWhereInput = {
    ...(query.activityId ? { activityId: query.activityId } : {}),
    ...(Object.keys(activity).length > 0 ? { activity } : {}),
    // The words the app reads aloud, which is the only text a question has.
    ...(query.search ? { say: { contains: query.search } } : {}),
  };

  const [rows, total] = await Promise.all([
    prismaUnscoped.activityQuestion.findMany({
      where,
      include: {
        ...questionInclude,
        activity: {
          select: {
            id: true,
            title: true,
            type: true,
            book: { select: { id: true, name: true } },
            chapter: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ activityId: 'asc' }, { sortOrder: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prismaUnscoped.activityQuestion.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      ...toRow(row, row.activity.type),
      activity: { id: row.activity.id, title: row.activity.title, type: row.activity.type },
      book: row.activity.book,
      chapter: row.activity.chapter,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * One question, with enough about the page it sits on to edit it.
 *
 * The editor needs the activity's type — a tracing question is drawn, a
 * matching one is a list of choices — so the question alone is not enough to
 * put on screen, and asking for it by id should not mean fetching the whole
 * page it belongs to first.
 */
export async function getQuestion(questionId: string): Promise<QuestionWithContext> {
  const row = await prismaUnscoped.activityQuestion.findUnique({
    where: { id: questionId },
    include: {
      ...questionInclude,
      activity: {
        select: {
          id: true,
          title: true,
          type: true,
          book: { select: { id: true, name: true } },
          chapter: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!row) throw ApiError.notFound('Question not found');

  return {
    ...toRow(row, row.activity.type),
    activity: { id: row.activity.id, title: row.activity.title, type: row.activity.type },
    book: row.activity.book,
    chapter: row.activity.chapter,
  };
}

/**
 * Checks that every picture referenced is a catalogue asset.
 *
 * A file id that belongs to a school — a child's photograph, a parent's
 * homework — must never end up inside content served to every school that
 * bought the book.
 */
export async function assertCatalogueAssets(
  fileIds: Array<string | null | undefined>,
): Promise<void> {
  const wanted = [...new Set(fileIds.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return;

  const found = await prismaUnscoped.fileObject.findMany({
    where: { id: { in: wanted }, schoolId: null, deletedAt: null },
    select: { id: true, mimeType: true },
  });

  if (found.length !== wanted.length) {
    throw ApiError.badRequest('Use pictures uploaded to the catalogue, not a school’s files');
  }
  if (found.some((file) => !file.mimeType.startsWith('image/'))) {
    throw ApiError.badRequest('An option can only show a picture');
  }
}

export async function createQuestion(
  activityId: string,
  input: CreateQuestionInput,
  actorUserId: string,
): Promise<QuestionRow> {
  const activity = await activityOrThrow(activityId);

  await assertCatalogueAssets([
    input.promptFileId,
    ...(input.options ?? []).map((option) => option.fileId),
  ]);

  const last = await prismaUnscoped.activityQuestion.findFirst({
    where: { activityId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const created = await prismaUnscoped.activityQuestion.create({
    data: {
      activityId,
      sortOrder: input.sortOrder ?? (last?.sortOrder ?? 0) + 1,
      say: input.say,
      promptGlyph: input.promptGlyph ?? null,
      promptFileId: input.promptFileId ?? null,
      strokesJson: (input.strokes ?? undefined) as Prisma.InputJsonValue | undefined,
      options: {
        create: (input.options ?? []).map((option, index) => ({
          sortOrder: index,
          text: option.text ?? null,
          glyph: option.glyph ?? null,
          fileId: option.fileId ?? null,
          isCorrect: option.isCorrect ?? false,
        })),
      },
    },
    include: questionInclude,
  });

  await writeAuditLog({
    action: 'ACTIVITY_UPDATED',
    entity: 'LearningActivity',
    entityId: activityId,
    schoolId: null,
    actorUserId,
    after: { addedQuestion: created.id, say: created.say },
  });

  return toRow(created, activity.type);
}

export async function updateQuestion(
  questionId: string,
  input: UpdateQuestionInput,
  actorUserId: string,
): Promise<QuestionRow> {
  const existing = await prismaUnscoped.activityQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, activityId: true },
  });
  if (!existing) throw ApiError.notFound('Question not found');

  const activity = await activityOrThrow(existing.activityId);

  await assertCatalogueAssets([
    input.promptFileId,
    ...(input.options ?? []).map((option) => option.fileId),
  ]);

  const updated = await prismaUnscoped.$transaction(async (tx) => {
    await tx.activityQuestion.update({
      where: { id: questionId },
      data: {
        say: input.say,
        promptGlyph: input.promptGlyph,
        promptFileId: input.promptFileId,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        ...(input.strokes === undefined
          ? {}
          : { strokesJson: (input.strokes ?? undefined) as Prisma.InputJsonValue | undefined }),
      },
    });

    // Options are replaced wholesale when they are sent at all. They are a
    // short ordered list a person edits as one thing, and diffing them by id
    // would buy nothing but a way to get the order wrong.
    if (input.options) {
      await tx.questionOption.deleteMany({ where: { questionId } });
      await tx.questionOption.createMany({
        data: input.options.map((option, index) => ({
          questionId,
          sortOrder: index,
          text: option.text ?? null,
          glyph: option.glyph ?? null,
          fileId: option.fileId ?? null,
          isCorrect: option.isCorrect ?? false,
        })),
      });
    }

    return tx.activityQuestion.findUniqueOrThrow({
      where: { id: questionId },
      include: questionInclude,
    });
  });

  await writeAuditLog({
    action: 'ACTIVITY_UPDATED',
    entity: 'LearningActivity',
    entityId: existing.activityId,
    schoolId: null,
    actorUserId,
    after: { editedQuestion: questionId },
  });

  return toRow(updated, activity.type);
}

/**
 * Removing a question outright.
 *
 * Unlike an activity, a question carries no history of its own — attempts are
 * recorded against the activity and its score, not per question — so there is
 * nothing here to preserve by soft-deleting.
 */
export async function deleteQuestion(questionId: string, actorUserId: string): Promise<void> {
  const existing = await prismaUnscoped.activityQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, activityId: true, say: true },
  });
  if (!existing) throw ApiError.notFound('Question not found');

  await prismaUnscoped.activityQuestion.delete({ where: { id: questionId } });

  await writeAuditLog({
    action: 'ACTIVITY_UPDATED',
    entity: 'LearningActivity',
    entityId: existing.activityId,
    schoolId: null,
    actorUserId,
    before: { removedQuestion: existing.say },
  });
}

/* -------------------------------------------------------------------------- */
/* Composing what the app plays                                               */
/* -------------------------------------------------------------------------- */

/**
 * Builds the content shape from question rows.
 *
 * Returns null when there is nothing playable, so the caller can fall back to
 * whatever `contentJson` holds — the seeded activities predate these rows and
 * must keep working until they are migrated.
 *
 * Questions with a problem are left out rather than served broken. A child
 * tapping four squares and being told each one is wrong is worse than a
 * slightly shorter activity.
 */
export async function composeContent(activity: {
  id: string;
  type: string;
}): Promise<ActivityContent | null> {
  const rows = await prismaUnscoped.activityQuestion.findMany({
    where: { activityId: activity.id, isActive: true },
    include: questionInclude,
    orderBy: { sortOrder: 'asc' },
  });

  const usable = rows.filter((row) => problemWith(row, activity.type) === null);
  if (usable.length === 0) return null;

  const kind = activity.type as ActivityContent['kind'];

  const content =
    activity.type === 'TRACING'
      ? {
          kind: 'TRACING' as const,
          items: usable.map((row) => ({
            glyph: row.promptGlyph ?? row.say.slice(0, 16),
            say: row.say,
            strokes: strokesOf(row) ?? [],
          })),
        }
      : isMultiAnswer(kind)
        ? {
            kind: 'MULTIPLE_CHOICE' as const,
            items: usable.map((row) => ({
              prompt: {
                say: row.say,
                ...(row.promptGlyph ? { glyph: row.promptGlyph } : {}),
                ...(row.promptFileId ? { imageUrl: assetUrl(row.promptFileId)! } : {}),
              },
              options: row.options.map((option) => ({
                ...(option.glyph ? { glyph: option.glyph } : {}),
                ...(option.text ? { text: option.text } : {}),
                ...(option.fileId ? { imageUrl: assetUrl(option.fileId)! } : {}),
              })),
              // Every box the author ticked, as indexes.
              answers: row.options
                .map((option, index) => (option.isCorrect ? index : -1))
                .filter((index) => index >= 0),
            })),
          }
        : isScored(kind)
        ? {
            kind,
            items: usable.map((row) => ({
              prompt: {
                say: row.say,
                ...(row.promptGlyph ? { glyph: row.promptGlyph } : {}),
                ...(row.promptFileId ? { imageUrl: assetUrl(row.promptFileId)! } : {}),
              },
              options: row.options.map((option) => ({
                ...(option.glyph ? { glyph: option.glyph } : {}),
                ...(option.text ? { text: option.text } : {}),
                ...(option.fileId ? { imageUrl: assetUrl(option.fileId)! } : {}),
              })),
              // The engine wants an index; the author ticked a box.
              answer: Math.max(
                0,
                row.options.findIndex((option) => option.isCorrect),
              ),
            })),
          }
        : {
            kind,
            items: usable.map((row) => ({
              ...(row.promptGlyph ? { glyph: row.promptGlyph } : {}),
              ...(row.promptFileId ? { imageUrl: assetUrl(row.promptFileId)! } : {}),
              title: row.say.slice(0, 80),
              say: row.say,
            })),
          };

  // Validated on the way out as well as in. Composing is the step most likely
  // to produce something the app cannot read, and it would do so silently.
  const parsed = activityContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/**
 * Old content, brought up to the current shape.
 *
 * The seeded activities store options as bare strings, which stopped being
 * valid when a picture became possible. Rather than rewrite them on disk, they
 * are lifted as they are served — one place, and it disappears when the last of
 * them has been migrated to rows.
 */
export function upconvertStoredContent(contentJson: unknown): ActivityContent | null {
  if (!contentJson || typeof contentJson !== 'object') return null;

  const raw = contentJson as { kind?: string; items?: unknown[] };
  if (!Array.isArray(raw.items)) return null;

  const items = raw.items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const entry = item as { options?: unknown[] };
    if (!Array.isArray(entry.options)) return item;

    return {
      ...entry,
      options: entry.options.map((option) =>
        typeof option === 'string' ? { glyph: option } : option,
      ),
    };
  });

  const parsed = activityContentSchema.safeParse({ ...raw, items });
  return parsed.success ? parsed.data : null;
}
