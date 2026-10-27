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
    /** Sort into Groups: which basket the card belongs in, from 0. */
    groupIndex: z.number().int().min(0).max(2).nullish(),
    /** Match the Pairs: the partner on the right. */
    matchText: z.string().trim().min(1).max(80).nullish(),
    matchGlyph: z.string().trim().min(1).max(16).nullish(),
    matchFileId: idSchema.nullish(),
    /** Match the Pairs: the partner is this option's own picture, as a shadow. */
    matchShadow: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.text ?? value.glyph ?? value.fileId), {
    message: 'An option needs a picture, an emoji or some text',
  });

/** A basket in Sort into Groups. */
const sortGroupInputSchema = z.object({
  label: z.string().trim().min(1).max(30),
  glyph: z.string().trim().min(1).max(16).nullish(),
  fileId: idSchema.nullish(),
});

/**
 * What a question needs beyond its options, by type. Each type reads only its
 * own fields; the API says, beside the question, when one is missing.
 */
export const questionSettingsSchema = z.object({
  /** Count and Colour: how many to colour, and how many to show. */
  target: z.number().int().min(1).max(20).nullish(),
  shown: z.number().int().min(1).max(20).nullish(),
  /** Sort into Groups: two or three baskets. */
  groups: z.array(sortGroupInputSchema).max(3).nullish(),
  /** Fill the Gap: the row, gaps in brackets — "1 2 [3] 4 [5]". */
  row: z.string().trim().min(1).max(120).nullish(),
  /** Fill the Gap: wrong tiles to offer, space-separated. Chosen for you when empty. */
  extras: z.string().trim().max(40).nullish(),
  /** Find the Letter: what to find — "D d". */
  targets: z.string().trim().min(1).max(20).nullish(),
  /** Find the Letter: everything in the grid, space-separated. */
  grid: z.string().trim().min(1).max(200).nullish(),
  /** Rhyme or Story: the words, a line to a line. */
  lines: z.string().trim().min(1).max(2400).nullish(),
});
export type QuestionSettings = z.infer<typeof questionSettingsSchema>;

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
  /** Four at most to pick one from, eight to find them all, nine cards to sort, five pairs — the service says which. */
  options: z.array(optionSchema).max(9).optional(),
  settings: questionSettingsSchema.nullish(),
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
  groupIndex: number | null;
  matchText: string | null;
  matchGlyph: string | null;
  matchImageUrl: string | null;
  matchShadow: boolean;
}

/** A basket as the editor shows it: the picture as a path, like an option's. */
export interface SortGroupRow {
  label: string;
  glyph: string | null;
  imageUrl: string | null;
}

export interface QuestionSettingsRow {
  target: number | null;
  shown: number | null;
  groups: SortGroupRow[];
  row: string | null;
  extras: string | null;
  targets: string | null;
  grid: string | null;
  lines: string | null;
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
  settings: QuestionSettingsRow;
  /**
   * Why a child will never see this question.
   *
   * A scored question with no right answer, or with one option, is worse than
   * a missing one: a four-year-old taps every square and is told each time that
   * they are wrong. The editor shows this rather than letting it reach anybody.
   */
  problem: string | null;
}
