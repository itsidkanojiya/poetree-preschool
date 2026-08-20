import { z } from 'zod';
import { idSchema } from './common.js';

/**
 * A book — the thing Poetree actually sells.
 *
 * "Nursery EVS", "Junior KG Phonics". A book belongs to one standard, holds
 * question types ("Circle the correct letter"), and each of those holds the
 * questions a child plays.
 *
 * Deliberately not the existing `Subject`. Schools own subject rows too, and a
 * school editing one would fork the catalogue — the whole point of the
 * publisher owning this is that a book means the same thing everywhere.
 */

const bookCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use capitals, digits and underscores, e.g. NUR_EVS');

export const createBookSchema = z.object({
  /** Derived from the standard and the name when not given. */
  code: bookCodeSchema.optional(),
  name: z.string().trim().min(2).max(120),
  classLevelId: idSchema,
  sortOrder: z.number().int().min(0).max(999).optional(),
  coverFileId: idSchema.nullish(),
  isActive: z.boolean().optional(),
});
export type CreateBookInput = z.infer<typeof createBookSchema>;

/** No `code`: it is how an import file and a printed spine refer to the book. */
export const updateBookSchema = createBookSchema.omit({ code: true }).partial();
export type UpdateBookInput = z.infer<typeof updateBookSchema>;

export interface BookSummary {
  id: string;
  code: string;
  name: string;
  classLevel: { id: string; name: string };
  sortOrder: number;
  isActive: boolean;
  coverUrl: string | null;
  /** How many question types are filed under it. */
  activityCount: number;
  /** How many schools have it switched on. */
  schoolCount: number;
}

/* -------------------------------------------------------------------------- */
/* Entitlement                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Which books a school has.
 *
 * A school that bought only the English book should see only English. The
 * Super Admin sets this per school, because it is a record of what was sold.
 */
export const setSchoolBooksSchema = z.object({
  books: z
    .array(z.object({ bookId: idSchema, enabled: z.boolean() }))
    .min(1)
    .max(200),
});
export type SetSchoolBooksInput = z.infer<typeof setSchoolBooksSchema>;

/** What the app is told about a book, for one child. */
export interface BookForChild {
  id: string;
  name: string;
  classLevel: { id: string; name: string };
  coverUrl: string | null;
  /**
   * Films inside this book that this child has still to watch.
   *
   * The shelf says "there is something to watch in here"; the watching happens
   * chapter by chapter once they are inside, because a chapter is what a book
   * is actually divided into.
   */
  filmsToWatch: number;
  /** False while any film inside is still unwatched. */
  isUnlocked: boolean;
}

export interface SchoolBookRow {
  bookId: string;
  name: string;
  code: string;
  classLevel: { id: string; name: string };
  enabled: boolean;
  /** False when the book has nothing playable in it yet. */
  hasContent: boolean;
}
