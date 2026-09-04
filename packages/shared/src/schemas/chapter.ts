import { z } from 'zod';
import { idSchema } from './common.js';
import { youTubeUrlSchema, type BookAnimation } from './animation.js';

/**
 * A chapter — a section of a book.
 *
 * Standard → Book → Chapter → Question type → Questions. The chapter is the
 * layer a teacher and a publisher both think in ("we're on chapter three"),
 * and the one the printed book is physically divided into.
 */

export const createChapterSchema = z.object({
  name: z.string().trim().min(1).max(160),
  /**
   * The film a child watches before this chapter's pages open.
   *
   * On the chapter rather than the book: a chapter is what a book is divided
   * into, and one video standing in for everything between two covers was
   * never how a workbook is taught.
   */
  animationUrl: youTubeUrlSchema.nullish(),
  /**
   * An optional picture for the chapter, shown on the contents page in the app.
   *
   * Optional because a book of twelve chapters is twelve pictures to draw, and
   * a chapter without one still has to look like something — the app falls back
   * to its own colour.
   */
  coverFileId: idSchema.nullish(),
  /**
   * What is printed on the page, which is not the order it sits in: a book can
   * open with "Chapter 0: Getting ready", and some have none at all.
   */
  number: z.number().int().min(0).max(999).nullish(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export type CreateChapterInput = z.infer<typeof createChapterSchema>;

export const updateChapterSchema = createChapterSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;

/**
 * A new running order for a book's chapters, as dragged.
 *
 * The whole list every time, not a from/to pair: a partial order is ambiguous
 * about everything it does not mention, and this is small enough that sending
 * all of it is simpler than reasoning about the gap.
 */
export const reorderChaptersSchema = z.object({
  chapterIds: z.array(idSchema).min(1).max(999),
});
export type ReorderChaptersInput = z.infer<typeof reorderChaptersSchema>;

export interface ChapterSummary {
  id: string;
  bookId: string;
  name: string;
  number: number | null;
  /** Null when there is no film, in which case the chapter is open from the start. */
  animation: BookAnimation | null;
  /** The chapter's picture, or null — most chapters have none. */
  coverUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Question types filed under it. */
  activityCount: number;
  /** Questions across those, which is what tells you a chapter is written. */
  questionCount: number;
}

/** For the pickers: every chapter, with the book it belongs to. */
export interface ChapterOption {
  id: string;
  name: string;
  bookId: string;
  bookName: string;
}

export const setActivityChapterSchema = z.object({ chapterId: idSchema.nullable() });
