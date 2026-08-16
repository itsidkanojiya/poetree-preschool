import type { Prisma } from '@prisma/client';
import type {
  BookForChild,
  BookSummary,
  CreateBookInput,
  SchoolBookRow,
  SetSchoolBooksInput,
  UpdateBookInput,
} from '@poetree/shared';
import { youTubeVideoId } from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { getRequestContext, requireSchoolId } from '../context/requestContext.js';
import { assertCanReadStudent } from './scope.service.js';
import { assertCatalogueAssets } from './question.service.js';
import { ApiError } from '../lib/apiError.js';
import { writeAuditLog } from './audit.service.js';

/**
 * Books, and which school has which.
 *
 * Publication-owned like the rest of the catalogue, so everything here reads
 * through `prismaUnscoped` on purpose and the routes above it are gated to
 * PUBLICATION_ADMIN — except `booksForSchool`, which is what a school's own app
 * asks and is therefore scoped by the caller's school.
 */

const bookInclude = {
  classLevel: { select: { id: true, name: true } },
  _count: { select: { activities: true, schools: true } },
} satisfies Prisma.BookInclude;

type BookRow = Prisma.BookGetPayload<{ include: typeof bookInclude }>;

/** The link as pasted, plus the id a player actually needs. */
function toAnimation(url: string | null) {
  if (!url) return null;
  const videoId = youTubeVideoId(url);
  return videoId ? { videoId, url } : null;
}

function toSummary(row: BookRow, enabledSchools: number): BookSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    classLevel: row.classLevel,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    coverUrl: row.coverFileId ? `/api/v1/catalogue/assets/${row.coverFileId}` : null,
    animation: toAnimation(row.animationUrl),
    activityCount: row._count.activities,
    schoolCount: enabledSchools,
  };
}

export async function listBooks(classLevelId?: string): Promise<BookSummary[]> {
  const rows = await prismaUnscoped.book.findMany({
    where: classLevelId ? { classLevelId } : {},
    include: bookInclude,
    orderBy: [{ classLevel: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  // Schools with it switched *on*, which is the number that means something —
  // `_count.schools` counts the rows including the disabled ones.
  const enabled = await prismaUnscoped.schoolBook.groupBy({
    by: ['bookId'],
    where: { enabled: true, bookId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const enabledFor = new Map(enabled.map((row) => [row.bookId, row._count._all]));

  return rows.map((row) => toSummary(row, enabledFor.get(row.id) ?? 0));
}

export async function createBook(
  input: CreateBookInput,
  actorUserId: string,
): Promise<BookSummary> {
  // The same rule as question artwork: a cover is served to every school that
  // bought the book, so a school's own file — a child's photograph, a parent's
  // homework — must never become one.
  await assertCatalogueAssets([input.coverFileId]);

  const level = await prismaUnscoped.classLevel.findUnique({
    where: { id: input.classLevelId },
    select: { id: true },
  });
  if (!level) throw ApiError.badRequest('Choose a standard that exists');

  const clash = await prismaUnscoped.book.findUnique({
    where: { code: input.code },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict(`A book with the code ${input.code} already exists`);

  const last = await prismaUnscoped.book.findFirst({
    where: { classLevelId: input.classLevelId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const row = await prismaUnscoped.book.create({
    data: {
      code: input.code,
      name: input.name,
      classLevelId: input.classLevelId,
      sortOrder: input.sortOrder ?? (last?.sortOrder ?? 0) + 1,
      coverFileId: input.coverFileId ?? null,
      animationUrl: input.animationUrl ?? null,
      isActive: input.isActive ?? true,
    },
    include: bookInclude,
  });

  /**
   * Every existing school gets a row, switched **off**.
   *
   * A book appearing by itself at a school that did not buy it is the failure
   * that matters here — the Super Admin turning one on is a deliberate act, and
   * a silent one is a support call about content a school is not paying for.
   */
  const schools = await prismaUnscoped.school.findMany({ select: { id: true } });
  if (schools.length > 0) {
    await prismaUnscoped.schoolBook.createMany({
      data: schools.map((school) => ({ schoolId: school.id, bookId: row.id, enabled: false })),
      skipDuplicates: true,
    });
  }

  await writeAuditLog({
    action: 'BOOK_CREATED',
    entity: 'Book',
    entityId: row.id,
    schoolId: null,
    actorUserId,
    after: { code: row.code, name: row.name },
  });

  return toSummary(row, 0);
}

export async function updateBook(
  id: string,
  input: UpdateBookInput,
  actorUserId: string,
): Promise<BookSummary> {
  const existing = await prismaUnscoped.book.findUnique({ where: { id }, select: { name: true } });
  if (!existing) throw ApiError.notFound('Book not found');

  await assertCatalogueAssets([input.coverFileId]);

  await prismaUnscoped.book.update({
    where: { id },
    data: {
      name: input.name,
      classLevelId: input.classLevelId,
      sortOrder: input.sortOrder,
      coverFileId: input.coverFileId,
      animationUrl: input.animationUrl,
      isActive: input.isActive,
    },
  });

  await writeAuditLog({
    action: 'BOOK_UPDATED',
    entity: 'Book',
    entityId: id,
    schoolId: null,
    actorUserId,
    before: { name: existing.name },
    after: { fields: Object.keys(input) },
  });

  const rows = await listBooks();
  return rows.find((row) => row.id === id)!;
}

/* -------------------------------------------------------------------------- */
/* Entitlement                                                                */
/* -------------------------------------------------------------------------- */

/** Every book, with whether this school has it — the Super Admin's toggle list. */
export async function booksForSchoolAdmin(schoolId: string): Promise<SchoolBookRow[]> {
  const school = await prismaUnscoped.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) throw ApiError.notFound('School not found');

  const [books, entitlements] = await Promise.all([
    prismaUnscoped.book.findMany({
      where: { isActive: true },
      include: {
        classLevel: { select: { id: true, name: true } },
        _count: { select: { activities: true } },
      },
      orderBy: [{ classLevel: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    }),
    prismaUnscoped.schoolBook.findMany({ where: { schoolId }, select: { bookId: true, enabled: true } }),
  ]);

  const enabledFor = new Map(entitlements.map((row) => [row.bookId, row.enabled]));

  return books.map((book) => ({
    bookId: book.id,
    name: book.name,
    code: book.code,
    classLevel: book.classLevel,
    enabled: enabledFor.get(book.id) ?? false,
    // Turning on a book with nothing in it gives a family an empty shelf, so
    // the screen can say so before it happens.
    hasContent: book._count.activities > 0,
  }));
}

export async function setSchoolBooks(
  schoolId: string,
  input: SetSchoolBooksInput,
  actorUserId: string,
): Promise<SchoolBookRow[]> {
  const school = await prismaUnscoped.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) throw ApiError.notFound('School not found');

  const bookIds = input.books.map((row) => row.bookId);
  const known = await prismaUnscoped.book.findMany({
    where: { id: { in: bookIds } },
    select: { id: true },
  });
  if (known.length !== new Set(bookIds).size) {
    throw ApiError.badRequest('One of those books does not exist');
  }

  for (const row of input.books) {
    await prismaUnscoped.schoolBook.upsert({
      where: { schoolId_bookId: { schoolId, bookId: row.bookId } },
      create: { schoolId, bookId: row.bookId, enabled: row.enabled },
      update: { enabled: row.enabled },
    });
  }

  await writeAuditLog({
    action: 'SCHOOL_BOOKS_CHANGED',
    entity: 'School',
    entityId: schoolId,
    schoolId,
    actorUserId,
    after: { enabled: input.books.filter((b) => b.enabled).length, of: input.books.length },
  });

  return booksForSchoolAdmin(schoolId);
}

/**
 * The books this school actually has, for its own users.
 *
 * Scoped by the caller's school rather than taking one as an argument: a
 * teacher asking "what can my class play" must not be able to ask on behalf of
 * a school they do not belong to.
 */
export async function booksForMySchool(): Promise<BookSummary[]> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();
  const schoolId = requireSchoolId();

  const entitlements = await prismaUnscoped.schoolBook.findMany({
    where: { schoolId, enabled: true },
    select: { bookId: true },
  });
  if (entitlements.length === 0) return [];

  const rows = await prismaUnscoped.book.findMany({
    where: { id: { in: entitlements.map((row) => row.bookId) }, isActive: true },
    include: bookInclude,
    orderBy: [{ classLevel: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
  });

  return rows.map((row) => toSummary(row, 0));
}

/** True when this school may open that book. Used before serving its content. */
export async function schoolHasBook(bookId: string): Promise<boolean> {
  const schoolId = requireSchoolId();
  const row = await prismaUnscoped.schoolBook.findUnique({
    where: { schoolId_bookId: { schoolId, bookId } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

/** Called when a school is created, so the toggle list is not empty. */
export async function seedEntitlementsForSchool(
  tx: Prisma.TransactionClient,
  schoolId: string,
): Promise<void> {
  const books = await tx.book.findMany({ select: { id: true } });
  if (books.length === 0) return;

  await tx.schoolBook.createMany({
    // Enabled for a brand new school: the Super Admin has just sold them
    // something, and an empty shelf on day one is the worse first impression.
    // Turning a book off afterwards is the deliberate act.
    data: books.map((book) => ({ schoolId, bookId: book.id, enabled: true })),
    skipDuplicates: true,
  });
}


/* -------------------------------------------------------------------------- */
/* The animation, and what it unlocks                                         */
/* -------------------------------------------------------------------------- */

/**
 * The books this child may open, and whether each is unlocked yet.
 *
 * A book with no animation is unlocked from the start — a book that has no
 * video does not lock itself, which matters because most of the catalogue has
 * none and locking it all would empty the app.
 */
export async function booksForChild(studentId: string): Promise<BookForChild[]> {
  await assertCanReadStudent(studentId);
  const schoolId = requireSchoolId();

  const entitlements = await prismaUnscoped.schoolBook.findMany({
    where: { schoolId, enabled: true },
    select: { bookId: true },
  });
  if (entitlements.length === 0) return [];

  const [books, watched] = await Promise.all([
    prismaUnscoped.book.findMany({
      where: { id: { in: entitlements.map((row) => row.bookId) }, isActive: true },
      include: { classLevel: { select: { id: true, name: true } } },
      orderBy: [{ classLevel: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    }),
    prismaUnscoped.bookAnimationView.findMany({
      where: { studentId },
      select: { bookId: true },
    }),
  ]);

  const seen = new Set(watched.map((row) => row.bookId));

  return books.map((book) => {
    const animation = toAnimation(book.animationUrl);
    return {
      id: book.id,
      name: book.name,
      classLevel: book.classLevel,
      coverUrl: book.coverFileId ? `/api/v1/catalogue/assets/${book.coverFileId}` : null,
      animation,
      isUnlocked: animation === null || seen.has(book.id),
    };
  });
}

/**
 * Records that this child has watched a book's animation.
 *
 * Idempotent: watched is watched, and a child who replays it has not watched it
 * twice. The upsert also means a flaky connection retrying the call cannot
 * produce two rows.
 */
export async function recordAnimationWatched(
  bookId: string,
  studentId: string,
): Promise<{ isUnlocked: true }> {
  await assertCanReadStudent(studentId);
  const schoolId = requireSchoolId();

  const entitled = await prismaUnscoped.schoolBook.findUnique({
    where: { schoolId_bookId: { schoolId, bookId } },
    select: { enabled: true },
  });
  // A school that does not have the book cannot record its children against it.
  if (entitled?.enabled !== true) throw ApiError.notFound('Book not found');

  await prismaUnscoped.bookAnimationView.upsert({
    where: { studentId_bookId: { studentId, bookId } },
    create: { schoolId, studentId, bookId },
    update: {},
  });

  return { isUnlocked: true };
}

/** The books this child has still to watch, for locking their activities. */
export async function lockedBookIdsFor(studentId: string): Promise<Set<string>> {
  const schoolId = requireSchoolId();

  const [withAnimation, watched] = await Promise.all([
    prismaUnscoped.book.findMany({
      where: { isActive: true, animationUrl: { not: null } },
      select: { id: true },
    }),
    prismaUnscoped.bookAnimationView.findMany({
      where: { studentId, schoolId },
      select: { bookId: true },
    }),
  ]);

  const seen = new Set(watched.map((row) => row.bookId));
  return new Set(withAnimation.map((book) => book.id).filter((id) => !seen.has(id)));
}
