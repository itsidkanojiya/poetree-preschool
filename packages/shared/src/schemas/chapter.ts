import { z } from 'zod';
import { idSchema } from './common.js';

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

export interface ChapterSummary {
  id: string;
  bookId: string;
  name: string;
  number: number | null;
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
