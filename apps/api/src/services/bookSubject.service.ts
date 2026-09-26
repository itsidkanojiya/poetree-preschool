import type {
  BookSubjectIcon,
  BookSubjectSummary,
  CreateBookSubjectInput,
  UpdateBookSubjectInput,
} from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { slugCode, uniqueCode } from '../lib/code.js';

/**
 * The subjects books are filed under — English, Maths, EVS.
 *
 * Publication-owned, like the books themselves, so the unscoped client and a
 * Super Admin-only router. Never deleted, only switched off: a subject with
 * books under it cannot be removed without deciding what happens to them, and
 * switching it off is that decision made safely — the books fall back to
 * "More books" in the app rather than disappearing.
 */

function toSummary(row: {
  id: string;
  code: string;
  name: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  _count: { books: number };
}): BookSubjectSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    icon: row.icon as BookSubjectIcon,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    bookCount: row._count.books,
  };
}

const withCount = { _count: { select: { books: true } } } as const;

export async function listBookSubjects(): Promise<BookSubjectSummary[]> {
  const rows = await prismaUnscoped.bookSubject.findMany({
    include: withCount,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toSummary);
}

export async function createBookSubject(
  input: CreateBookSubjectInput,
): Promise<BookSubjectSummary> {
  const code =
    input.code ??
    (await uniqueCode(slugCode(input.name), async (candidate) =>
      Boolean(await prismaUnscoped.bookSubject.findUnique({ where: { code: candidate } })),
    ));

  if (input.code && (await prismaUnscoped.bookSubject.findUnique({ where: { code } }))) {
    throw ApiError.conflict(`Subject code "${code}" is already taken`, { field: 'code' });
  }

  const last = await prismaUnscoped.bookSubject.findFirst({
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const row = await prismaUnscoped.bookSubject.create({
    data: {
      code,
      name: input.name,
      icon: input.icon,
      sortOrder: input.sortOrder ?? (last?.sortOrder ?? 0) + 1,
    },
    include: withCount,
  });
  return toSummary(row);
}

export async function updateBookSubject(
  id: string,
  input: UpdateBookSubjectInput,
): Promise<BookSubjectSummary> {
  const existing = await prismaUnscoped.bookSubject.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Subject not found');

  const row = await prismaUnscoped.bookSubject.update({
    where: { id },
    data: {
      name: input.name,
      icon: input.icon,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
    include: withCount,
  });
  return toSummary(row);
}
