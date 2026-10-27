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
const mediaFields = {
  glyph: glyphSchema.optional(),
  /** A word or a number under the picture, or instead of one. */
  text: z.string().trim().min(1).max(80).optional(),
  /** `/api/v1/catalogue/assets/:id` — always a path this API serves. */
  imageUrl: z.string().trim().min(1).max(300).optional(),
  /**
   * Draw the picture as its shadow: every part that is not see-through turns
   * black. "Match the animal to its shadow" without a second picture to draw.
   */
  silhouette: z.boolean().optional(),
};

const hasMedia = (value: { glyph?: string; text?: string; imageUrl?: string }): boolean =>
  Boolean(value.glyph ?? value.text ?? value.imageUrl);

export const activityMediaSchema = z.object(mediaFields).refine(hasMedia, {
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
/**
 * The pre-writing patterns a tracing question can ask for, from the school's
 * handwriting sheet. The key is what goes in the question's glyph; the API has
 * a path for each.
 */
export const TRACING_PATTERNS = [
  { key: 'pattern-standing', label: 'Standing lines' },
  { key: 'pattern-sleeping', label: 'Sleeping lines' },
  { key: 'pattern-slant-r', label: 'Slanting line /' },
  { key: 'pattern-slant-l', label: 'Slanting line \\' },
  { key: 'pattern-curve', label: 'Big curve' },
  { key: 'pattern-curve-s', label: 'Small curve' },
  { key: 'pattern-arch', label: 'Big bridge' },
  { key: 'pattern-arch-s', label: 'Small bridge' },
  { key: 'pattern-cup', label: 'Big cup' },
  { key: 'pattern-cup-s', label: 'Small cup' },
  { key: 'pattern-zigzag', label: 'Big zigzag' },
  { key: 'pattern-zigzag-s', label: 'Small zigzag' },
] as const;

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
          // A Hindi or Gujarati letter from the school's sheet can be a dozen
          // parts: a knot, a curl, a headline and a dot.
          .max(16),
        /**
         * False when the strokes may be traced in any order and either way
         * round — the Hindi and Gujarati letters, whose order is not yet
         * taught. Absent means in order, as written.
         */
        ordered: z.boolean().optional(),
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
  kind: z.enum([
    'SINGLE_CHOICE',
    'ODD_ONE_OUT',
    'MATCHING',
    'COUNTING',
    'SORTING',
    'COLOURING',
    'DRAG_DROP',
  ]),
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
 * Up to eight options rather than four: the whole point is a set to sift, and
 * the books' rows ("circle the pet animals") run to eight.
 */
export const multiChoiceContentSchema = z.object({
  kind: z.literal('MULTIPLE_CHOICE'),
  items: z
    .array(
      z.object({
        prompt: promptSchema,
        options: z.array(activityMediaSchema).min(2).max(8),
        /** Indexes into `options`. At least one, or there is nothing to find. */
        answers: z.array(z.number().int().min(0).max(7)).min(1).max(8),
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
        /**
         * A rhyme or a story, a line at a time, so the app can light up the
         * line being read. Absent on a flashcard.
         */
        lines: z.array(z.string().trim().min(1).max(160)).min(1).max(40).optional(),
      }),
    )
    .min(1)
    .max(20),
});

/** What a question asks, read aloud: "Colour 11 balls." */
const spokenSchema = z.object({ say: z.string().trim().min(1).max(200) });

/**
 * Join each thing to its partner: an animal to its shadow or its baby, a
 * picture to its letter, a capital to its small letter, fingers to a number.
 *
 * The app shows the left column in order and shuffles the right one, so the
 * author writes each pair side by side and never has to scramble it.
 */
export const matchPairsContentSchema = z.object({
  kind: z.literal('MATCH_PAIRS'),
  items: z
    .array(
      z.object({
        prompt: promptSchema,
        pairs: z
          .array(z.object({ left: activityMediaSchema, right: activityMediaSchema }))
          .min(2)
          .max(5),
      }),
    )
    .min(1)
    .max(12),
});

/** A basket things are sorted into: "Healthy", "Day", "Water". */
const sortGroupSchema = z.object({
  label: z.string().trim().min(1).max(30),
  glyph: glyphSchema.optional(),
  imageUrl: z.string().trim().min(1).max(300).optional(),
});

/**
 * Put each card in its basket: healthy or junk, day or night, land, water or
 * air. Two or three baskets — the books never ask for more.
 */
export const sortGroupsContentSchema = z.object({
  kind: z.literal('SORT_GROUPS'),
  items: z
    .array(
      z.object({
        prompt: promptSchema,
        groups: z.array(sortGroupSchema).min(2).max(3),
        cards: z
          .array(
            z
              .object({ ...mediaFields, group: z.number().int().min(0).max(2) })
              .refine(hasMedia, { message: 'A card needs a picture, an emoji or some text' }),
          )
          .min(2)
          .max(9),
      }),
    )
    .min(1)
    .max(12),
});

/**
 * Make a set of exactly N: "count and colour the 11 balls". The app shows the
 * one picture `shown` times in grey and colours each one tapped.
 */
export const countOutContentSchema = z.object({
  kind: z.literal('COUNT_OUT'),
  items: z
    .array(
      z
        .object({
          prompt: spokenSchema,
          target: z.number().int().min(1).max(20),
          shown: z.number().int().min(1).max(20),
          picture: activityMediaSchema,
        })
        .refine((item) => item.shown >= item.target, {
          message: 'Show at least as many as the child has to colour',
        }),
    )
    .min(1)
    .max(12),
});

/** One car of the train: a letter or number, or a gap to fill. */
const gapCellSchema = z.object({
  value: z.string().trim().min(1).max(8),
  /** Empty on screen until the child puts the right tile in it. */
  gap: z.boolean(),
});

/**
 * Complete the row: missing numbers, the alphabet train, the number before or
 * after, the first letter of a word under its picture. Gaps fill in order.
 */
export const fillGapContentSchema = z.object({
  kind: z.literal('FILL_GAP'),
  items: z
    .array(
      z.object({
        prompt: promptSchema,
        cells: z.array(gapCellSchema).min(2).max(10),
        /** The tiles to choose from: every gap's answer, and a wrong one or two. */
        choices: z.array(z.string().trim().min(1).max(8)).min(2).max(6),
      }),
    )
    .min(1)
    .max(12),
});

/**
 * Find every one: "circle all the D and d", "circle 7 on the train". Done by
 * itself when the last one is found.
 */
export const letterHuntContentSchema = z.object({
  kind: z.literal('LETTER_HUNT'),
  items: z
    .array(
      z.object({
        prompt: spokenSchema,
        cells: z.array(z.string().trim().min(1).max(8)).min(2).max(30),
        targets: z.array(z.string().trim().min(1).max(8)).min(1).max(4),
      }),
    )
    .min(1)
    .max(12),
});

export const activityContentSchema = z.discriminatedUnion('kind', [
  tracingContentSchema,
  choiceContentSchema,
  multiChoiceContentSchema,
  cardContentSchema,
  matchPairsContentSchema,
  sortGroupsContentSchema,
  countOutContentSchema,
  fillGapContentSchema,
  letterHuntContentSchema,
]);

export type ActivityContent = z.infer<typeof activityContentSchema>;
export type TracingContent = z.infer<typeof tracingContentSchema>;
export type ChoiceContent = z.infer<typeof choiceContentSchema>;
export type MultiChoiceContent = z.infer<typeof multiChoiceContentSchema>;
export type CardContent = z.infer<typeof cardContentSchema>;
export type MatchPairsContent = z.infer<typeof matchPairsContentSchema>;
export type SortGroupsContent = z.infer<typeof sortGroupsContentSchema>;
export type CountOutContent = z.infer<typeof countOutContentSchema>;
export type FillGapContent = z.infer<typeof fillGapContentSchema>;
export type LetterHuntContent = z.infer<typeof letterHuntContentSchema>;

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

/**
 * Answered by tapping one option out of a few — every type whose questions are
 * a list of options with the right one ticked.
 */
export function isChoice(kind: ActivityContent['kind']): boolean {
  return (
    kind === 'SINGLE_CHOICE' ||
    kind === 'ODD_ONE_OUT' ||
    kind === 'MATCHING' ||
    kind === 'COUNTING' ||
    kind === 'SORTING' ||
    kind === 'COLOURING' ||
    kind === 'DRAG_DROP'
  );
}

/** More than one answer may be marked right. Only one type works this way. */
export function isMultiAnswer(kind: ActivityContent['kind']): boolean {
  return kind === 'MULTIPLE_CHOICE';
}
