import { z } from 'zod';

/**
 * What an activity actually contains.
 *
 * `LearningActivity.contentJson` was left as untyped JSON because the shape
 * varies by type. That was right, but it meant the app had nothing to render
 * and no contract to render it against. This is that contract.
 *
 * Defined here rather than in the app so the API can validate authored content
 * on the way in, and so a malformed activity is caught when it is written
 * rather than when a four-year-old opens it.
 *
 * The design constraints throughout: a child of two to six cannot read, so
 * every question needs a picture or a sound and never only words; and no
 * activity may have more than one right answer to tap, because ambiguity at
 * this age reads as failure.
 */

/** An emoji, or a letter or digit being taught. */
const glyphSchema = z.string().trim().min(1).max(16);

/**
 * One thing a child looks at: a picture, an emoji, or a couple of characters.
 *
 * Emoji were all there was, which meant half of a real workbook could not be
 * written down — "cross out the things that are not safe at home" has no emoji
 * for a kettle on a low shelf. A picture is an uploaded file, referenced by the
 * path that serves it rather than by a bare id, so a client renders it without
 * having to know how the catalogue addresses its assets.
 *
 * At least one of the three has to be present, or the child is shown a blank
 * square to tap.
 */
export const activityMediaSchema = z
  .object({
    glyph: glyphSchema.optional(),
    /** A word or a number under the picture, or instead of one. */
    text: z.string().trim().min(1).max(80).optional(),
    /** `/api/v1/catalogue/assets/:id` — always a path this API serves. */
    imageUrl: z.string().trim().min(1).max(300).optional(),
  })
  .refine((value) => Boolean(value.glyph ?? value.text ?? value.imageUrl), {
    message: 'An option needs a picture, an emoji or some text',
  });
export type ActivityMedia = z.infer<typeof activityMediaSchema>;

const promptSchema = z.object({
  /** Spoken aloud by the app. Written for the adult sitting beside them. */
  say: z.string().trim().min(1).max(200),
  glyph: glyphSchema.optional(),
  imageUrl: z.string().trim().min(1).max(300).optional(),
});

/**
 * Trace a shape or a letter with a finger.
 *
 * `strokes` are normalised 0–1 coordinates so the same definition renders on
 * any screen size. Scoring is per stroke completed, not per pixel — a
 * three-year-old's line is never going to sit on the path.
 */
export const tracingContentSchema = z.object({
  kind: z.literal('TRACING'),
  items: z
    .array(
      z.object({
        glyph: glyphSchema,
        say: z.string().trim().min(1).max(200),
        strokes: z
          .array(
            z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).min(2),
          )
          .min(1)
          .max(6),
      }),
    )
    .min(1)
    .max(12),
});

/** Tap the one that matches the prompt. */
export const choiceContentSchema = z.object({
  /**
   * One right answer, however it is reached. SINGLE_CHOICE and DRAG_DROP hold
   * exactly the same thing — a prompt, some options, and which one is right —
   * and differ only in whether the child taps the answer or drags it into
   * place. Splitting them into two shapes would duplicate the schema, the
   * editor and the scoring to record a preference about fingers.
   */
  kind: z.enum(['SINGLE_CHOICE', 'MATCHING', 'COUNTING', 'SORTING', 'COLOURING', 'DRAG_DROP']),
  items: z
    .array(
      z.object({
        prompt: promptSchema,
        /**
         * Objects rather than bare strings since a picture became possible.
         * An old build reading this fails to parse and hides the activity,
         * which is the designed behaviour: better nothing than a row of blank
         * squares.
         */
        options: z.array(activityMediaSchema).min(2).max(4),
        /** Index into `options`. Exactly one, deliberately. */
        answer: z.number().int().min(0).max(3),
      }),
    )
    .min(1)
    .max(12),
});

/**
 * More than one right answer, marked together.
 *
 * This is the one shape that breaks the rule written at the top of this file —
 * that no activity may have more than one right answer, because ambiguity at
 * three reads as failure. It is here because a publisher asked for it, and it
 * earns its place further up the school: "tap all the animals" is a real page
 * in a Senior KG workbook and cannot be written any other way.
 *
 * The child taps as many as they think, then says they are done — so nothing is
 * scored until they choose to be finished, and a first tap is never a mistake.
 * Up to six options rather than four: the whole point is a set to sift.
 */
export const multiChoiceContentSchema = z.object({
  kind: z.literal('MULTIPLE_CHOICE'),
  items: z
    .array(
      z.object({
        prompt: promptSchema,
        options: z.array(activityMediaSchema).min(2).max(6),
        /** Indexes into `options`. At least one, or there is nothing to find. */
        answers: z.array(z.number().int().min(0).max(5)).min(1).max(6),
      }),
    )
    .min(1)
    .max(12),
});

/** Look, listen, swipe. No wrong answer — these teach recognition. */
export const cardContentSchema = z.object({
  kind: z.enum(['FLASHCARD', 'RHYME', 'STORY']),
  items: z
    .array(
      z.object({
        glyph: glyphSchema.optional(),
        imageUrl: z.string().trim().min(1).max(300).optional(),
        title: z.string().trim().min(1).max(80),
        say: z.string().trim().min(1).max(400),
      }),
    )
    .min(1)
    .max(20),
});

export const activityContentSchema = z.discriminatedUnion('kind', [
  tracingContentSchema,
  choiceContentSchema,
  multiChoiceContentSchema,
  cardContentSchema,
]);

export type ActivityContent = z.infer<typeof activityContentSchema>;
export type TracingContent = z.infer<typeof tracingContentSchema>;
export type ChoiceContent = z.infer<typeof choiceContentSchema>;
export type MultiChoiceContent = z.infer<typeof multiChoiceContentSchema>;
export type CardContent = z.infer<typeof cardContentSchema>;

/**
 * Whether an activity type is scored at all.
 *
 * Flashcards, rhymes and stories are not. Scoring a child for looking at a
 * picture of a cow would put a number on something that is not a test, and
 * mastery figures built from it would mean nothing.
 */
export function isScored(kind: ActivityContent['kind']): boolean {
  return kind !== 'FLASHCARD' && kind !== 'RHYME' && kind !== 'STORY';
}

/** Scored, and answered by choosing between options rather than by drawing. */
export function isChoice(kind: ActivityContent['kind']): boolean {
  return isScored(kind) && kind !== 'TRACING';
}

/** More than one answer may be marked right. Only one type works this way. */
export function isMultiAnswer(kind: ActivityContent['kind']): boolean {
  return kind === 'MULTIPLE_CHOICE';
}
