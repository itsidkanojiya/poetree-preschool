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

/* -------------------------------------------------------------------------- */
/* Subjects                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The pictures the app knows how to draw for a subject.
 *
 * A fixed set of keys rather than uploaded images, so a subject added in the
 * admin panel has a proper tile on the first day instead of a grey square. The
 * app maps each key to a picture in its asset pack (SubjectArt in
 * lib/core/assets/app_assets.dart); an app too old to know a key draws a book.
 */
export const BOOK_SUBJECT_ICONS = [
  'abc',
  'numbers',
  'globe',
  'hindi',
  'gujarati',
  'bulb',
  'music',
  'phonics',
  'book',
  // From the app's picture pack, added after the first set.
  'stories',
  'shapes',
  'festivals',
  'awareness',
  'abc_blocks',
  'number_blocks',
  'storybook',
] as const;
export type BookSubjectIcon = (typeof BOOK_SUBJECT_ICONS)[number];

export const createBookSubjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  /** Derived from the name when not given. */
  code: bookCodeSchema.optional(),
  icon: z.enum(BOOK_SUBJECT_ICONS).default('book'),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export type CreateBookSubjectInput = z.infer<typeof createBookSubjectSchema>;

export const updateBookSubjectSchema = createBookSubjectSchema
  .omit({ code: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateBookSubjectInput = z.infer<typeof updateBookSubjectSchema>;

export interface BookSubjectSummary {
  id: string;
  code: string;
  name: string;
  icon: BookSubjectIcon;
  sortOrder: number;
  isActive: boolean;
  /** Books filed under it, across every standard. */
  bookCount: number;
}

/**
 * A subject as a child's shelf shows it: only subjects with a book this child
 * can open, and how much is waiting inside them.
 */
export interface SubjectForChild {
  /** Null for the "More books" group — books nobody has filed yet. */
  id: string | null;
  name: string;
  icon: BookSubjectIcon;
  bookCount: number;
  /** Chapters with a film, across its books. */
  filmCount: number;
  /** Of those, how many this child has not watched. */
  filmsToWatch: number;
}

export const createBookSchema = z.object({
  /** Derived from the standard and the name when not given. */
  code: bookCodeSchema.optional(),
  name: z.string().trim().min(2).max(120),
  /**
   * What the book is about. Optional so an unfiled book still saves — it shows
   * under "More books" in the app until somebody files it.
   */
  subjectId: idSchema.nullish(),
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
  subject: { id: string; name: string } | null;
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
  subject: { id: string; name: string; icon: BookSubjectIcon } | null;
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
