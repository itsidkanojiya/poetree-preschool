import type {
  ChapterOption,
  ChapterSummary,
  CreateChapterInput,
  UpdateChapterInput,
} from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { writeAuditLog } from './audit.service.js';

/**
 * Chapters — the sections a book is divided into.
 *
 * Publication-owned like the book above them and the question types below, so
 * everything here reads through the unscoped client and the routes are gated to
 * the Super Admin.
 */

function toSummary(row: {
  id: string;
  bookId: string;
  name: string;
  number: number | null;
  sortOrder: number;
  isActive: boolean;
  activities: Array<{ _count: { questions: number } }>;
}): ChapterSummary {
  return {
    id: row.id,
    bookId: row.bookId,
    name: row.name,
    number: row.number,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    activityCount: row.activities.length,
    // The number that says whether a chapter has actually been written, as
    // opposed to merely named.
    questionCount: row.activities.reduce((sum, a) => sum + a._count.questions, 0),
  };
}

const chapterInclude = {
  activities: { select: { _count: { select: { questions: true } } } },
} as const;

export async function listChapters(bookId: string): Promise<ChapterSummary[]> {
  const book = await prismaUnscoped.book.findUnique({ where: { id: bookId }, select: { id: true } });
  if (!book) throw ApiError.notFound('Book not found');

  const rows = await prismaUnscoped.chapter.findMany({
    where: { bookId },
    include: chapterInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return rows.map(toSummary);
}

/** Every chapter in the catalogue, for a picker that spans books. */
export async function listAllChapters(): Promise<ChapterOption[]> {
  const rows = await prismaUnscoped.chapter.findMany({
    where: { isActive: true },
    select: { id: true, name: true, bookId: true, book: { select: { name: true } } },
    orderBy: [{ book: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    bookId: row.bookId,
    bookName: row.book.name,
  }));
}

export async function createChapter(
  bookId: string,
  input: CreateChapterInput,
  actorUserId: string,
): Promise<ChapterSummary> {
  const book = await prismaUnscoped.book.findUnique({ where: { id: bookId }, select: { id: true } });
  if (!book) throw ApiError.notFound('Book not found');

  const last = await prismaUnscoped.chapter.findFirst({
    where: { bookId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const row = await prismaUnscoped.chapter.create({
    data: {
      bookId,
      name: input.name,
      number: input.number ?? null,
      sortOrder: input.sortOrder ?? (last?.sortOrder ?? 0) + 1,
    },
    include: chapterInclude,
  });

  await writeAuditLog({
    action: 'CHAPTER_CREATED',
    entity: 'Chapter',
    entityId: row.id,
    schoolId: null,
    actorUserId,
    after: { bookId, name: row.name },
  });

  return toSummary(row);
}

export async function updateChapter(
  id: string,
  input: UpdateChapterInput,
  actorUserId: string,
): Promise<ChapterSummary> {
  const existing = await prismaUnscoped.chapter.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) throw ApiError.notFound('Chapter not found');

  const row = await prismaUnscoped.chapter.update({
    where: { id },
    data: {
      name: input.name,
      number: input.number,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
    include: chapterInclude,
  });

  await writeAuditLog({
    action: 'CHAPTER_UPDATED',
    entity: 'Chapter',
    entityId: id,
    schoolId: null,
    actorUserId,
    before: { name: existing.name },
    after: { fields: Object.keys(input) },
  });

  return toSummary(row);
}

/**
 * The order the contents page runs in, as somebody dragged it.
 *
 * The whole list arrives and must match the book's chapters exactly — no
 * strays, none missing. A partial list would leave the unnamed ones with stale
 * positions, which is how a contents page ends up with two chapter threes.
 *
 * `sortOrder` moves for everything. `number` is what is *printed* on the page,
 * and only chapters that already had one get renumbered: a book that opens with
 * an unnumbered "Getting ready" should not sprout a number for it because
 * somebody dragged the chapter below it.
 */
export async function reorderChapters(
  bookId: string,
  chapterIds: string[],
  actorUserId: string,
): Promise<ChapterSummary[]> {
  const existing = await prismaUnscoped.chapter.findMany({
    where: { bookId },
    select: { id: true, number: true },
  });

  const known = new Set(existing.map((row) => row.id));
  const asked = new Set(chapterIds);

  if (asked.size !== chapterIds.length) {
    throw ApiError.badRequest('The same chapter was listed twice');
  }
  if (asked.size !== known.size || chapterIds.some((id) => !known.has(id))) {
    throw ApiError.badRequest('That is not this book’s list of chapters');
  }

  const numbered = new Map(existing.map((row) => [row.id, row.number !== null]));
  let printed = 0;

  await prismaUnscoped.$transaction(
    chapterIds.map((id, index) => {
      if (numbered.get(id)) printed += 1;

      return prismaUnscoped.chapter.update({
        where: { id },
        data: {
          sortOrder: index + 1,
          ...(numbered.get(id) ? { number: printed } : {}),
        },
      });
    }),
  );

  await writeAuditLog({
    action: 'CHAPTERS_REORDERED',
    entity: 'Book',
    entityId: bookId,
    schoolId: null,
    actorUserId,
    after: { order: chapterIds },
  });

  return listChapters(bookId);
}

/**
 * Removing a chapter.
 *
 * Refused while question types are filed under it. Deleting would set their
 * chapter to null and quietly scatter a written chapter's pages back into the
 * book with no way to tell which had been where.
 */
export async function deleteChapter(id: string, actorUserId: string): Promise<void> {
  const existing = await prismaUnscoped.chapter.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { activities: true } } },
  });
  if (!existing) throw ApiError.notFound('Chapter not found');

  if (existing._count.activities > 0) {
    throw ApiError.badRequest(
      `${existing._count.activities} question ${
        existing._count.activities === 1 ? 'type is' : 'types are'
      } in this chapter. Move them first.`,
    );
  }

  await prismaUnscoped.chapter.delete({ where: { id } });

  await writeAuditLog({
    action: 'CHAPTER_UPDATED',
    entity: 'Chapter',
    entityId: id,
    schoolId: null,
    actorUserId,
    before: { removed: existing.name },
  });
}

/**
 * The rule that keeps the two columns honest.
 *
 * A question type carries both `bookId` and `chapterId` — the book because
 * entitlement filters on it for every catalogue read, the chapter because that
 * is where an author files it. Denormalised columns drift, so this is checked
 * on every write: a chapter from a different book is refused rather than
 * silently accepted into a page nobody can find.
 */
export async function assertChapterBelongsToBook(
  chapterId: string | null | undefined,
  bookId: string | null | undefined,
): Promise<void> {
  if (!chapterId) return;

  const chapter = await prismaUnscoped.chapter.findUnique({
    where: { id: chapterId },
    select: { bookId: true },
  });
  if (!chapter) throw ApiError.badRequest('Choose a chapter that exists');

  if (!bookId) throw ApiError.badRequest('Choose the book before the chapter');
  if (chapter.bookId !== bookId) {
    throw ApiError.badRequest('That chapter belongs to a different book');
  }
}
