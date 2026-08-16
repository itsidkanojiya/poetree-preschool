import { z } from 'zod';
import { idSchema } from './common.js';

/**
 * The questions under a question type.
 *
 * "Circle the correct letter" is the type; the questions are the rows on the
 * page. Authored one at a time, which is why they are rows rather than entries
 * in a JSON blob — adding a question used to mean rewriting the whole thing.
 */

const optionSchema = z
  .object({
    text: z.string().trim().min(1).max(80).optional(),
    glyph: z.string().trim().min(1).max(16).optional(),
    /** An uploaded catalogue asset. */
    fileId: idSchema.nullish(),
    isCorrect: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.text ?? value.glyph ?? value.fileId), {
    message: 'An option needs a picture, an emoji or some text',
  });

export const createQuestionSchema = z.object({
  /** Read aloud. The child cannot read it themselves, and that is the point. */
  say: z.string().trim().min(1).max(200),
  promptGlyph: z.string().trim().min(1).max(16).nullish(),
  promptFileId: idSchema.nullish(),
  /** Tracing only: normalised 0–1 paths. */
  strokes: z
    .array(z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).min(2))
    .min(1)
    .max(6)
    .nullish(),
  options: z.array(optionSchema).max(4).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const updateQuestionSchema = createQuestionSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export interface QuestionOptionRow {
  id: string;
  text: string | null;
  glyph: string | null;
  imageUrl: string | null;
  isCorrect: boolean;
  sortOrder: number;
}

/** A question with the page and book it belongs to, for the flat list. */
export interface QuestionWithContext extends QuestionRow {
  activity: { id: string; title: string; type: string };
  book: { id: string; name: string } | null;
  chapter: { id: string; name: string } | null;
}

export interface QuestionRow {
  id: string;
  activityId: string;
  sortOrder: number;
  say: string;
  promptGlyph: string | null;
  promptImageUrl: string | null;
  strokes: Array<Array<{ x: number; y: number }>> | null;
  isActive: boolean;
  options: QuestionOptionRow[];
  /**
   * Why a child will never see this question.
   *
   * A scored question with no right answer, or with one option, is worse than
   * a missing one: a four-year-old taps every square and is told each time that
   * they are wrong. The editor shows this rather than letting it reach anybody.
   */
  problem: string | null;
}
