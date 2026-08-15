import { z } from 'zod';
import { activityContentSchema } from './activities.js';
import { idSchema } from './common.js';

/**
 * The publisher's catalogue of learning activities.
 *
 * These belong to Poetree, not to a school. A school buys access to the
 * activities; it does not author them, and it cannot edit or hide one — that
 * would fork the catalogue sixty ways and make a child's mastery figure mean
 * something different at each school.
 */

export const ACTIVITY_TYPES = [
  'TRACING',
  'MATCHING',
  'COUNTING',
  'FLASHCARD',
  'SORTING',
  'COLOURING',
  'RHYME',
  'STORY',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/**
 * Stable, human-readable and unique — it is how a printed workbook page refers
 * to the activity that goes with it, so it must not change after publication.
 */
const activityCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(
    /^[A-Z][A-Z0-9_]{2,39}$/,
    'Use capitals, digits and underscores, e.g. TRACE_LETTER_A',
  );

export const createActivitySchema = z.object({
  code: activityCodeSchema,
  /**
   * The instruction as it reads in the book — "Circle the correct letter".
   * This is the question *type*; the questions themselves sit under it.
   */
  title: z.string().trim().min(2).max(160),
  /** The book this is a page of, and the chapter within it. */
  bookId: idSchema.nullish(),
  chapterId: idSchema.nullish(),
  type: z.enum(ACTIVITY_TYPES),
  skillId: idSchema,
  /** Null means every class level; most activities are for one. */
  classLevelId: idSchema.nullish(),
  content: activityContentSchema,
  isActive: z.boolean().optional(),
});
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

/**
 * No `code` and no `type`.
 *
 * The code is printed in a workbook, and the type decides how every past
 * attempt was scored — changing either after children have played would
 * silently rewrite history.
 */
export const updateActivitySchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  bookId: idSchema.nullish(),
  chapterId: idSchema.nullish(),
  skillId: idSchema.optional(),
  classLevelId: idSchema.nullish(),
  content: activityContentSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const listActivitiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  skillId: idSchema.optional(),
  bookId: idSchema.optional(),
  chapterId: idSchema.optional(),
  classLevelId: idSchema.optional(),
  type: z.enum(ACTIVITY_TYPES).optional(),
  search: z.string().trim().max(120).optional(),
  /** The editor needs to see retired activities; the app never does. */
  includeInactive: z.coerce.boolean().optional(),
});
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;

export interface CatalogueActivity {
  id: string;
  code: string;
  title: string;
  type: string;
  isActive: boolean;
  skill: { id: string; code: string; name: string };
  book: { id: string; name: string } | null;
  chapter: { id: string; name: string } | null;
  classLevelId: string | null;
  classLevelCode: string | null;
  itemCount: number;
  /**
   * False when the stored content will not parse. The app refuses to offer an
   * activity it cannot render, so an unplayable one is invisible to every child
   * until somebody notices — this is how they notice.
   */
  isPlayable: boolean;
  /** How much use it has had, across every school. */
  attemptCount: number;
  updatedAt: string;
}
