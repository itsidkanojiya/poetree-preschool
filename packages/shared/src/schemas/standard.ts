import { z } from 'zod';

/**
 * A standard — the year a child is in.
 *
 * Play Group, Nursery, Junior KG and Senior KG were compiled in as an enum of
 * four. They are rows the Super Admin maintains now, because a school that
 * calls its first year "Toddler" should not need a release, and because a book
 * and a child's progress both hang off a standard.
 */

/**
 * Stable and not editable after creation: the seed, fee structures and any
 * import file refer to a standard by code. Renaming is what `name` is for, and
 * the name is the only one anybody sees.
 */
const standardCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use capitals, digits and underscores, e.g. TODDLER');

export const createStandardSchema = z.object({
  code: standardCodeSchema,
  name: z.string().trim().min(2).max(60),
  sortOrder: z.number().int().min(0).max(999).optional(),
  /** Guidance for the office when enrolling, never enforced. */
  minAgeMonths: z.number().int().min(0).max(240).nullish(),
  maxAgeMonths: z.number().int().min(0).max(240).nullish(),
});
export type CreateStandardInput = z.infer<typeof createStandardSchema>;

export const updateStandardSchema = createStandardSchema.omit({ code: true }).partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateStandardInput = z.infer<typeof updateStandardSchema>;

export interface StandardSummary {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  /** Why it cannot be deleted — worth showing before somebody tries. */
  classroomCount: number;
}
