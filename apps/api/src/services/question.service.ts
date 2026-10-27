import { Prisma } from '@prisma/client';
import {
  activityContentSchema,
  isMultiAnswer,
  isScored,
  type ActivityContent,
  type CreateQuestionInput,
  type QuestionRow,
  type QuestionSettings,
  type QuestionSettingsRow,
  type QuestionWithContext,
  type UpdateQuestionInput,
} from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { isFreeOrderGlyph, strokesForGlyph } from '../content/glyphStrokes.js';
import {
  defaultShown,
  gapChoices,
  parseGapRow,
  pieces,
  verseLines,
} from '../content/activityKinds.js';
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

/**
 * The path a child traces for this question.
 *
 * The built-in shape for the letter or number comes first, and a hand-drawn one
 * is only a fallback. An "a" is the same "a" in every activity, every book and
 * every school — there is nothing for an author to decide, and every path drawn
 * by hand was another chance to draw a B without its bumps, which is what the
 * shipped content did.
 *
 * The fallback is not dead weight: a school writing a Hindi or Gujarati letter
 * has no built-in shape, and their own path is the only path there is.
 */
function strokesOf(row: QuestionWithOptions): Strokes | null {
  return strokesForGlyph(row.promptGlyph) ?? (row.strokesJson as Strokes | null) ?? null;
}

/** What a question keeps beyond its options, as stored. */
interface StoredSettings {
  target?: number | null;
  shown?: number | null;
  groups?: Array<{ label: string; glyph?: string | null; fileId?: string | null }> | null;
  row?: string | null;
  extras?: string | null;
  targets?: string | null;
  grid?: string | null;
  lines?: string | null;
}

function settingsOf(row: { settingsJson: Prisma.JsonValue | null }): StoredSettings {
  const raw = row.settingsJson;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as StoredSettings) : {};
}

/**
 * Settings as given, with the empty ones left out — so a question that has
 * none stores nothing, and a stored blob never carries a type's leftovers as
 * empty strings.
 */
function storedSettings(input: QuestionSettings | null | undefined): StoredSettings | null {
  if (!input) return null;
  const kept = Object.fromEntries(
    Object.entries(input).filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    ),
  ) as StoredSettings;
  if (kept.groups) {
    kept.groups = kept.groups.map((group) => ({
      label: group.label,
      ...(group.glyph ? { glyph: group.glyph } : {}),
      ...(group.fileId ? { fileId: group.fileId } : {}),
    }));
  }
  return Object.keys(kept).length > 0 ? kept : null;
}

function settingsRow(settings: StoredSettings): QuestionSettingsRow {
  return {
    target: settings.target ?? null,
    shown: settings.shown ?? null,
    groups: (settings.groups ?? []).map((group) => ({
      label: group.label,
      glyph: group.glyph ?? null,
      imageUrl: assetUrl(group.fileId ?? null),
    })),
    row: settings.row ?? null,
    extras: settings.extras ?? null,
    targets: settings.targets ?? null,
    grid: settings.grid ?? null,
    lines: settings.lines ?? null,
  };
}

/** Every picture a question refers to: its own, its options', its partners', its baskets'. */
function picturesIn(
  input: CreateQuestionInput | UpdateQuestionInput,
): Array<string | null | undefined> {
  return [
    input.promptFileId,
    ...(input.options ?? []).flatMap((option) => [option.fileId, option.matchFileId]),
    ...(input.settings?.groups ?? []).map((group) => group.fileId),
  ];
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
    // A letter or number is enough on its own now — the path comes with it.
    const strokes = strokesOf(row);
    if (!strokes || strokes.length === 0) {
      return row.promptGlyph
        ? `There is no built-in path for “${row.promptGlyph}”`
        : 'Choose the letter or number to trace';
    }
    return null;
  }

  if (!scored) {
    // Flashcards, rhymes and stories are looked at, not answered.
    return null;
  }

  const settings = settingsOf(row);
  switch (type) {
    case 'MATCH_PAIRS':
      return pairsProblem(row);
    case 'SORT_GROUPS':
      return sortProblem(row, settings);
    case 'COUNT_OUT':
      return countProblem(row, settings);
    case 'FILL_GAP':
      return gapProblem(settings);
    case 'LETTER_HUNT':
      return huntProblem(settings);
    default:
      break;
  }

  const multi = isMultiAnswer(type as ActivityContent['kind']);

  if (row.options.length < 2) return 'Needs at least two things to choose between';
  if (type === 'ODD_ONE_OUT' && row.options.length < 3) {
    return 'Needs at least three, so one can be different';
  }
  // Eight where several answers are wanted, because the point is a set to
  // sift; four otherwise, which is as much as a three-year-old can hold.
  if (row.options.length > (multi ? 8 : 4)) {
    return multi
      ? 'More than eight choices is too many for this age'
      : 'More than four choices is too many for this age';
  }

  const correct = row.options.filter((option) => option.isCorrect).length;
  if (correct === 0) return 'Nothing is marked as the right answer';
  if (correct > 1 && !multi) return 'More than one answer is marked right';

  return null;
}

/** Match the Pairs: every pair needs something on both sides. */
function pairsProblem(row: QuestionWithOptions): string | null {
  if (row.options.length < 2) return 'Needs at least two pairs to match';
  if (row.options.length > 5) return 'Five pairs at most — more is too many to hold at once';
  const shadowless = row.options.findIndex((pair) => pair.matchShadow && !pair.fileId);
  if (shadowless >= 0)
    return `Pair ${shadowless + 1} needs a picture on the left to make a shadow of`;
  const empty = row.options.findIndex(
    (pair) => !(pair.matchShadow || pair.matchText || pair.matchGlyph || pair.matchFileId),
  );
  if (empty >= 0) return `Pair ${empty + 1} has nothing on the right to match`;
  return null;
}

/** Sort into Groups: two or three baskets, and every card in one of them. */
function sortProblem(row: QuestionWithOptions, settings: StoredSettings): string | null {
  const groups = settings.groups ?? [];
  if (groups.length < 2) return 'Needs two or three baskets to sort into';
  if (row.options.length < 2) return 'Needs at least two cards to sort';
  if (row.options.length > 9) return 'Nine cards at most';
  const lost = row.options.findIndex(
    (card) => card.groupIndex === null || card.groupIndex < 0 || card.groupIndex >= groups.length,
  );
  if (lost >= 0) return `Card ${lost + 1} is not in a basket`;
  return null;
}

/** Count and Colour: a number, a picture, and enough of them to colour. */
function countProblem(row: QuestionWithOptions, settings: StoredSettings): string | null {
  if (!settings.target) return 'Say how many to colour';
  if (!row.promptFileId && !row.promptGlyph) return 'Choose the picture to colour';
  const shown = settings.shown ?? defaultShown(settings.target);
  if (shown < settings.target) return 'Show at least as many pictures as there are to colour';
  return null;
}

/** Fill the Gap: a row with one to three gaps, and a wrong tile beside them. */
function gapProblem(settings: StoredSettings): string | null {
  const cells = parseGapRow(settings.row);
  if (cells.length < 2) return 'Type the row with the gaps in brackets, like 1 2 [3] 4';
  if (cells.length > 10) return 'Ten in a row at most';
  const gaps = cells.filter((cell) => cell.gap).length;
  if (gaps === 0) return 'Put at least one gap in brackets, like [3]';
  if (gaps > 3) return 'Three gaps at most';
  const answers = new Set(cells.filter((cell) => cell.gap).map((cell) => cell.value)).size;
  if (gapChoices(cells, settings.extras).length <= answers) {
    return 'Add a wrong tile to choose from';
  }
  return null;
}

/** Find the Letter: something to find, and at least one of it in the grid. */
function huntProblem(settings: StoredSettings): string | null {
  const targets = pieces(settings.targets);
  const cells = pieces(settings.grid);
  if (targets.length === 0) return 'Say which letters or numbers to find';
  if (targets.length > 4) return 'Four different ones to find at most';
  if (cells.length < 2) return 'Type what is in the grid';
  if (cells.length > 30) return 'Thirty in the grid at most';
  if ([...targets, ...cells].some((value) => value.length > 8)) {
    return 'Put spaces between the letters or numbers';
  }
  if (!cells.some((cell) => targets.includes(cell))) {
    return 'Nothing in the grid is what the child has to find';
  }
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
      groupIndex: option.groupIndex,
      matchText: option.matchText,
      matchGlyph: option.matchGlyph,
      matchImageUrl: assetUrl(option.matchFileId),
      matchShadow: option.matchShadow,
    })),
    settings: settingsRow(settingsOf(row)),
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
    ...(query.bookId
      ? { OR: [{ books: { some: { bookId: query.bookId } } }, { allBooks: true }] }
      : {}),
    ...(query.chapterId ? { chapterId: query.chapterId } : {}),
    ...(query.type ? { type: query.type as never } : {}),
    // By the standard the *book* is for, not the activity's own level: a
    // standard is something a book belongs to, and that is how somebody
    // filtering by "Nursery" is thinking.
    ...(query.classLevelId
      ? { books: { some: { book: { classLevelId: query.classLevelId } } } }
      : {}),
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
            books: { include: { book: { select: { id: true, name: true } } } },
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
      // The first book it is a page of, which for most is the only one.
      book: row.activity.books[0]?.book ?? null,
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
          books: { include: { book: { select: { id: true, name: true } } } },
          chapter: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!row) throw ApiError.notFound('Question not found');

  return {
    ...toRow(row, row.activity.type),
    activity: { id: row.activity.id, title: row.activity.title, type: row.activity.type },
    book: row.activity.books[0]?.book ?? null,
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

  await assertCatalogueAssets(picturesIn(input));

  const settings = storedSettings(input.settings);

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
      ...(settings ? { settingsJson: settings as Prisma.InputJsonValue } : {}),
      options: {
        create: (input.options ?? []).map((option, index) => optionData(option, index)),
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

  await assertCatalogueAssets(picturesIn(input));

  const settings = input.settings === undefined ? undefined : storedSettings(input.settings);

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
        // Sent: replaced, or cleared when empty. Not sent: left as it was.
        ...(settings === undefined
          ? {}
          : {
              settingsJson: settings === null ? Prisma.DbNull : (settings as Prisma.InputJsonValue),
            }),
      },
    });

    // Options are replaced wholesale when they are sent at all. They are a
    // short ordered list a person edits as one thing, and diffing them by id
    // would buy nothing but a way to get the order wrong.
    if (input.options) {
      await tx.questionOption.deleteMany({ where: { questionId } });
      await tx.questionOption.createMany({
        data: input.options.map((option, index) => ({ questionId, ...optionData(option, index) })),
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

/** An option as stored, from what the editor sent. */
function optionData(option: NonNullable<CreateQuestionInput['options']>[number], index: number) {
  return {
    sortOrder: index,
    text: option.text ?? null,
    glyph: option.glyph ?? null,
    fileId: option.fileId ?? null,
    isCorrect: option.isCorrect ?? false,
    groupIndex: option.groupIndex ?? null,
    matchText: option.matchText ?? null,
    matchGlyph: option.matchGlyph ?? null,
    matchFileId: option.matchFileId ?? null,
    matchShadow: option.matchShadow ?? false,
  };
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
    composeBookKind(activity.type, usable) ??
    (activity.type === 'TRACING'
      ? {
          kind: 'TRACING' as const,
          items: usable.map((row) => ({
            glyph: row.promptGlyph ?? row.say.slice(0, 16),
            say: row.say,
            strokes: strokesOf(row) ?? [],
            ...(isFreeOrderGlyph(row.promptGlyph) ? { ordered: false } : {}),
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
              items: usable.map((row) => {
                const lines = verseLines(settingsOf(row).lines);
                return {
                  ...(row.promptGlyph ? { glyph: row.promptGlyph } : {}),
                  ...(row.promptFileId ? { imageUrl: assetUrl(row.promptFileId)! } : {}),
                  title: row.say.slice(0, 80),
                  say: row.say,
                  ...(lines.length > 0 ? { lines } : {}),
                };
              }),
            });

  // Validated on the way out as well as in. Composing is the step most likely
  // to produce something the app cannot read, and it would do so silently.
  const parsed = activityContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/** What a question asks, with the picture or letter shown above it. */
function promptOf(row: QuestionWithOptions) {
  return {
    say: row.say,
    ...(row.promptGlyph ? { glyph: row.promptGlyph } : {}),
    ...(row.promptFileId ? { imageUrl: assetUrl(row.promptFileId)! } : {}),
  };
}

/** One picture, emoji or word, with only the parts it has. */
function mediaOf(media: { glyph: string | null; text: string | null; fileId: string | null }) {
  return {
    ...(media.glyph ? { glyph: media.glyph } : {}),
    ...(media.text ? { text: media.text } : {}),
    ...(media.fileId ? { imageUrl: assetUrl(media.fileId)! } : {}),
  };
}

/**
 * The content of the types made from the Pre-Primary books, or null for every
 * other type. Questions reaching here have already been checked by
 * `problemWith`, so each has what its type needs.
 */
function composeBookKind(type: string, rows: QuestionWithOptions[]): unknown {
  switch (type) {
    case 'MATCH_PAIRS':
      return {
        kind: type,
        items: rows.map((row) => ({
          prompt: promptOf(row),
          pairs: row.options.map((pair) => ({
            left: mediaOf(pair),
            // A shadow is the left picture drawn black; no second file.
            right: pair.matchShadow
              ? { imageUrl: assetUrl(pair.fileId)!, silhouette: true }
              : mediaOf({ glyph: pair.matchGlyph, text: pair.matchText, fileId: pair.matchFileId }),
          })),
        })),
      };
    case 'SORT_GROUPS':
      return {
        kind: type,
        items: rows.map((row) => ({
          prompt: promptOf(row),
          groups: (settingsOf(row).groups ?? []).map((group) => ({
            label: group.label,
            ...(group.glyph ? { glyph: group.glyph } : {}),
            ...(group.fileId ? { imageUrl: assetUrl(group.fileId)! } : {}),
          })),
          cards: row.options.map((card) => ({ ...mediaOf(card), group: card.groupIndex ?? 0 })),
        })),
      };
    case 'COUNT_OUT':
      return {
        kind: type,
        items: rows.map((row) => {
          const settings = settingsOf(row);
          const target = settings.target ?? 1;
          return {
            prompt: { say: row.say },
            target,
            shown: settings.shown ?? defaultShown(target),
            picture: mediaOf({ glyph: row.promptGlyph, text: null, fileId: row.promptFileId }),
          };
        }),
      };
    case 'FILL_GAP':
      return {
        kind: type,
        items: rows.map((row) => {
          const settings = settingsOf(row);
          const cells = parseGapRow(settings.row);
          return { prompt: promptOf(row), cells, choices: gapChoices(cells, settings.extras) };
        }),
      };
    case 'LETTER_HUNT':
      return {
        kind: type,
        items: rows.map((row) => {
          const settings = settingsOf(row);
          return {
            prompt: { say: row.say },
            cells: pieces(settings.grid),
            targets: [...new Set(pieces(settings.targets))],
          };
        }),
      };
    default:
      return null;
  }
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
