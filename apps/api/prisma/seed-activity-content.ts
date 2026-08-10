/**
 * Fills the starter activities with something a child can actually do.
 *
 * The activities seeded earlier were names with nothing behind them, so the
 * whole progress module measured nothing. This gives each one real content
 * against the shape in `@poetree/shared` — enough for a pilot classroom, and
 * enough to prove the loop from tapping an answer to a mastery figure a parent
 * can read.
 *
 * It is placeholder content in the sense that Poetree will replace it with
 * authored material and their own artwork. It is not placeholder in the sense
 * of being fake: every item is a real question with a real answer.
 *
 *   npx tsx prisma/seed-activity-content.ts
 */
import { PrismaClient } from '@prisma/client';
import { activityContentSchema, type ActivityContent } from '@poetree/shared';

const prisma = new PrismaClient();

/** Four points down the left, across, and down — enough to trace an L or an I. */
const line = (x1: number, y1: number, x2: number, y2: number) => [
  { x: x1, y: y1 },
  { x: x2, y: y2 },
];

const CONTENT: Record<string, ActivityContent> = {
  TRACE_A_E: {
    kind: 'TRACING',
    items: [
      {
        glyph: 'A',
        say: 'Trace the letter A. Up the hill, down the hill, across the middle.',
        strokes: [line(0.2, 0.9, 0.5, 0.1), line(0.5, 0.1, 0.8, 0.9), line(0.32, 0.6, 0.68, 0.6)],
      },
      {
        glyph: 'B',
        say: 'Trace the letter B. Straight down, then two bumps.',
        strokes: [line(0.3, 0.1, 0.3, 0.9), line(0.3, 0.1, 0.7, 0.35), line(0.3, 0.5, 0.72, 0.75)],
      },
      {
        glyph: 'C',
        say: 'Trace the letter C. Around like a moon.',
        strokes: [line(0.72, 0.22, 0.3, 0.5), line(0.3, 0.5, 0.72, 0.78)],
      },
      {
        glyph: 'D',
        say: 'Trace the letter D. Straight down, then all the way around.',
        strokes: [line(0.3, 0.1, 0.3, 0.9), line(0.3, 0.1, 0.75, 0.5), line(0.75, 0.5, 0.3, 0.9)],
      },
      {
        glyph: 'E',
        say: 'Trace the letter E. Down, then three lines across.',
        strokes: [
          line(0.32, 0.1, 0.32, 0.9),
          line(0.32, 0.1, 0.72, 0.1),
          line(0.32, 0.5, 0.66, 0.5),
          line(0.32, 0.9, 0.72, 0.9),
        ],
      },
    ],
  },

  TRACE_F_J: {
    kind: 'TRACING',
    items: [
      {
        glyph: 'F',
        say: 'Trace the letter F. Down, then two lines across.',
        strokes: [line(0.32, 0.1, 0.32, 0.9), line(0.32, 0.1, 0.72, 0.1), line(0.32, 0.5, 0.64, 0.5)],
      },
      {
        glyph: 'G',
        say: 'Trace the letter G. Around like a C, then a little shelf.',
        strokes: [line(0.72, 0.22, 0.3, 0.5), line(0.3, 0.5, 0.72, 0.78), line(0.72, 0.78, 0.72, 0.55)],
      },
      {
        glyph: 'H',
        say: 'Trace the letter H. Down, down, and across the middle.',
        strokes: [line(0.3, 0.1, 0.3, 0.9), line(0.7, 0.1, 0.7, 0.9), line(0.3, 0.5, 0.7, 0.5)],
      },
      {
        glyph: 'I',
        say: 'Trace the letter I. One straight line down.',
        strokes: [line(0.5, 0.1, 0.5, 0.9)],
      },
      {
        glyph: 'J',
        say: 'Trace the letter J. Down, then a little hook.',
        strokes: [line(0.6, 0.1, 0.6, 0.72), line(0.6, 0.72, 0.35, 0.85)],
      },
    ],
  },

  TRACE_LOWER_A_E: {
    kind: 'TRACING',
    items: [
      { glyph: 'a', say: 'Trace a small a.', strokes: [line(0.68, 0.4, 0.35, 0.6), line(0.68, 0.35, 0.68, 0.85)] },
      { glyph: 'b', say: 'Trace a small b.', strokes: [line(0.32, 0.1, 0.32, 0.9), line(0.32, 0.55, 0.7, 0.75)] },
      { glyph: 'c', say: 'Trace a small c.', strokes: [line(0.68, 0.42, 0.35, 0.6), line(0.35, 0.6, 0.68, 0.8)] },
      { glyph: 'd', say: 'Trace a small d.', strokes: [line(0.68, 0.1, 0.68, 0.9), line(0.68, 0.5, 0.32, 0.7)] },
      { glyph: 'e', say: 'Trace a small e.', strokes: [line(0.34, 0.62, 0.7, 0.62), line(0.7, 0.62, 0.4, 0.85)] },
    ],
  },

  TRACE_1_10: {
    kind: 'TRACING',
    items: [
      { glyph: '1', say: 'Trace the number one. Straight down.', strokes: [line(0.5, 0.12, 0.5, 0.88)] },
      { glyph: '2', say: 'Trace the number two. Around, down, across.', strokes: [line(0.32, 0.3, 0.7, 0.28), line(0.7, 0.28, 0.32, 0.85), line(0.32, 0.85, 0.72, 0.85)] },
      { glyph: '3', say: 'Trace the number three. Two little bumps.', strokes: [line(0.34, 0.2, 0.68, 0.4), line(0.68, 0.4, 0.34, 0.55), line(0.34, 0.55, 0.68, 0.85)] },
      { glyph: '4', say: 'Trace the number four. Down, across, and down.', strokes: [line(0.6, 0.12, 0.3, 0.6), line(0.3, 0.6, 0.75, 0.6), line(0.6, 0.12, 0.6, 0.88)] },
      { glyph: '5', say: 'Trace the number five. Across, down, and around.', strokes: [line(0.68, 0.15, 0.34, 0.15), line(0.34, 0.15, 0.34, 0.5), line(0.34, 0.5, 0.7, 0.75)] },
    ],
  },

  COUNT_OBJECTS: {
    kind: 'COUNTING',
    items: [
      { prompt: { say: 'How many apples?', glyph: '🍎🍎' }, options: ['1', '2', '3'], answer: 1 },
      { prompt: { say: 'How many ducks?', glyph: '🦆🦆🦆' }, options: ['2', '3', '4'], answer: 1 },
      { prompt: { say: 'How many stars?', glyph: '⭐' }, options: ['1', '2', '3'], answer: 0 },
      { prompt: { say: 'How many cars?', glyph: '🚗🚗🚗🚗' }, options: ['3', '4', '5'], answer: 1 },
      { prompt: { say: 'How many flowers?', glyph: '🌸🌸🌸' }, options: ['2', '3', '4'], answer: 1 },
    ],
  },

  MATCH_LETTER_PICTURE: {
    kind: 'MATCHING',
    items: [
      { prompt: { say: 'Which one starts with A?' }, options: ['🍎', '🐝', '🐱'], answer: 0 },
      { prompt: { say: 'Which one starts with B?' }, options: ['🍎', '🎈', '🌞'], answer: 1 },
      { prompt: { say: 'Which one starts with C?' }, options: ['🐶', '🐱', '🐟'], answer: 1 },
      { prompt: { say: 'Which one starts with D?' }, options: ['🐶', '🐘', '🦋'], answer: 0 },
      { prompt: { say: 'Which one starts with E?' }, options: ['🥚', '🍇', '🌈'], answer: 0 },
    ],
  },

  MATCH_SHAPES: {
    kind: 'MATCHING',
    items: [
      { prompt: { say: 'Find the circle.', glyph: '⭕' }, options: ['🔺', '⭕', '🟦'], answer: 1 },
      { prompt: { say: 'Find the triangle.', glyph: '🔺' }, options: ['🔺', '⭕', '🟦'], answer: 0 },
      { prompt: { say: 'Find the square.', glyph: '🟦' }, options: ['⭕', '🔺', '🟦'], answer: 2 },
      { prompt: { say: 'Find the star.', glyph: '⭐' }, options: ['⭐', '🟦', '🔺'], answer: 0 },
    ],
  },

  SORT_SHAPES: {
    kind: 'SORTING',
    items: [
      { prompt: { say: 'Which one is round?' }, options: ['🟦', '⭕'], answer: 1 },
      { prompt: { say: 'Which one has corners?' }, options: ['🔺', '⭕'], answer: 0 },
      { prompt: { say: 'Which one is a box shape?' }, options: ['⭕', '🟦'], answer: 1 },
    ],
  },

  MATCH_COLOURS: {
    kind: 'MATCHING',
    items: [
      { prompt: { say: 'Find the red one.' }, options: ['🔴', '🔵', '🟡'], answer: 0 },
      { prompt: { say: 'Find the blue one.' }, options: ['🔴', '🔵', '🟢'], answer: 1 },
      { prompt: { say: 'Find the yellow one.' }, options: ['🟢', '🟡', '🔵'], answer: 1 },
      { prompt: { say: 'Find the green one.' }, options: ['🟢', '🔴', '🟡'], answer: 0 },
    ],
  },

  COLOUR_THE_FRUIT: {
    kind: 'COLOURING',
    items: [
      { prompt: { say: 'What colour is a banana?', glyph: '🍌' }, options: ['🔴', '🟡', '🔵'], answer: 1 },
      { prompt: { say: 'What colour is a strawberry?', glyph: '🍓' }, options: ['🔴', '🟢', '🟡'], answer: 0 },
      { prompt: { say: 'What colour is a leaf?', glyph: '🍃' }, options: ['🔵', '🟢', '🔴'], answer: 1 },
    ],
  },

  FLASH_ANIMALS: {
    kind: 'FLASHCARD',
    items: [
      { glyph: '🐶', title: 'Dog', say: 'This is a dog. A dog says woof.' },
      { glyph: '🐱', title: 'Cat', say: 'This is a cat. A cat says meow.' },
      { glyph: '🐮', title: 'Cow', say: 'This is a cow. A cow says moo.' },
      { glyph: '🐘', title: 'Elephant', say: 'This is an elephant. It has a long trunk.' },
      { glyph: '🐟', title: 'Fish', say: 'This is a fish. A fish swims in water.' },
    ],
  },

  FLASH_FRUITS: {
    kind: 'FLASHCARD',
    items: [
      { glyph: '🍎', title: 'Apple', say: 'This is an apple. Apples are crunchy.' },
      { glyph: '🍌', title: 'Banana', say: 'This is a banana. Bananas are yellow.' },
      { glyph: '🍇', title: 'Grapes', say: 'These are grapes. They grow in a bunch.' },
      { glyph: '🍊', title: 'Orange', say: 'This is an orange. Oranges are juicy.' },
    ],
  },

  RHYME_TWINKLE: {
    kind: 'RHYME',
    items: [
      { glyph: '⭐', title: 'Twinkle Twinkle', say: 'Twinkle, twinkle, little star, how I wonder what you are.' },
      { glyph: '✨', title: 'Up above', say: 'Up above the world so high, like a diamond in the sky.' },
      { glyph: '⭐', title: 'Twinkle again', say: 'Twinkle, twinkle, little star, how I wonder what you are.' },
    ],
  },
};

async function main(): Promise<void> {
  let filled = 0;
  const missing: string[] = [];

  for (const [code, content] of Object.entries(CONTENT)) {
    // Validated before it is written, so a malformed activity is caught here
    // rather than by a four-year-old opening a blank screen.
    const parsed = activityContentSchema.safeParse(content);
    if (!parsed.success) {
      throw new Error(`Content for ${code} does not match the schema: ${parsed.error.message}`);
    }

    const activity = await prisma.learningActivity.findUnique({ where: { code } });
    if (!activity) {
      missing.push(code);
      continue;
    }

    await prisma.learningActivity.update({
      where: { code },
      data: { contentJson: parsed.data as never },
    });
    filled += 1;
  }

  console.warn(`Filled ${filled} activities with content.`);
  if (missing.length > 0) {
    console.warn(`Not found (run seed-skills.ts first): ${missing.join(', ')}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('Activity content seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
