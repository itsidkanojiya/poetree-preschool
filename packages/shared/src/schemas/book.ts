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

/**
 * A book subject's id.
 *
 * The eight subjects the platform shipped with were seeded by a migration with
 * readable ids — subj_english, subj_maths — while every subject added since
 * has a cuid. Both are real ids, and checking for a cuid alone refused every
 * edit to the first eight and every book filed under them.
 */
export const bookSubjectIdSchema = z.union([
  idSchema,
  z.string().regex(/^subj_[a-z0-9_]{1,40}$/, 'Invalid id'),
]);

export const createBookSubjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  /** Derived from the name when not given. */
  code: bookCodeSchema.optional(),
  icon: z.enum(BOOK_SUBJECT_ICONS).default('book'),
  /** An uploaded picture, drawn in place of the icon; null takes it off. */
  pictureFileId: idSchema.nullish(),
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
  /** The uploaded picture, or null when the subject wears its icon. */
  pictureUrl: string | null;
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
  /** The uploaded picture, drawn in place of the icon; null for most. */
  pictureUrl: string | null;
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
  subjectId: bookSubjectIdSchema.nullish(),
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
  /** The book to read, as uploaded; null until the publisher uploads one. */
  pdf: BookPdfFile | null;
  /** How many question types are filed under it. */
  activityCount: number;
  /** How many schools have it switched on. */
  schoolCount: number;
}

/** A book's PDF, as the publisher's screens describe it. */
export interface BookPdfFile {
  fileName: string;
  sizeBytes: number;
  /**
   * Its size as uploaded, once it has been made smaller for phones. Null until
   * then — it is done in the background a minute or so after the upload — or
   * when it could not be made any smaller.
   */
  originalSizeBytes: number | null;
  uploadedAt: string;
}

/**
 * The largest book PDF the publisher may upload: a printed book with full-page
 * pictures, rather than the 15 MB a school's own documents are held to. Keep in
 * step with the book PDF location in infra/nginx.
 */
export const BOOK_PDF_MAX_BYTES = 50 * 1024 * 1024;

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
   * The book to read. Null until the publisher uploads it, which the app says
   * rather than opening onto nothing.
   */
  pdf: BookPdfForChild | null;
  /** Films inside this book that this child has still to watch. */
  filmsToWatch: number;
  /**
   * Always true. Films used to lock a book's pages until watched; they no
   * longer lock anything. Kept for app versions still on phones, which read it.
   */
  isUnlocked: boolean;
}

/** A book's PDF, as a child's app fetches it. */
export interface BookPdfForChild {
  /** Served only to a child whose school has the book. */
  url: string;
  sizeBytes: number;
  /**
   * Changes whenever the publisher replaces the PDF, so an app that kept a
   * copy for reading offline knows to fetch the new one.
   */
  version: string;
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
