import {
  createActivitySchema,
  createBookSchema,
  createChapterSchema,
  createQuestionSchema,
  type ActivityType,
  type CreateQuestionInput,
} from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { logger } from '../lib/logger.js';
import * as books from './book.service.js';
import * as catalogue from './catalogue.service.js';
import * as chapters from './chapter.service.js';
import * as pictures from './pictureLibrary.service.js';
import * as questions from './question.service.js';

/**
 * The sample book: one or two activities of every type, each modelled on a page
 * of the Pre-Primary A books — the animal and its shadow, healthy or junk, the
 * D and d hunt, the 11 balls to colour, the number train — so a publisher sees
 * every type working before writing their own.
 *
 * A book of its own, given to no school, so no child meets it until the
 * publisher decides. Added through the same services the portal uses, so every
 * question is checked and audited as if a person had typed it.
 *
 * Safe to run again: what is there is left alone and anything missing is
 * added, so a run cut short is finished by the next.
 */

export const SAMPLE_BOOK_CODE = 'PRE_PRIMARY_A_SAMPLES';
const SKILL_CODE = 'PRE_PRIMARY_A';

/** A picture from the library by the app's own name for it, or an emoji. */
type Pic = { picture: string; emoji: string };
const PIC = {
  apple: { picture: 'Apple (A)', emoji: '🍎' },
  ball: { picture: 'Ball (B)', emoji: '⚽' },
  cat: { picture: 'Cat (C)', emoji: '🐱' },
  dog: { picture: 'Dog (D)', emoji: '🐶' },
  elephant: { picture: 'Elephant (E)', emoji: '🐘' },
  fish: { picture: 'Fish (F)', emoji: '🐟' },
  grapes: { picture: 'Grapes (G)', emoji: '🍇' },
  lion: { picture: 'Lion (L)', emoji: '🦁' },
  mango: { picture: 'Mango (M)', emoji: '🥭' },
  rabbit: { picture: 'Rabbit (R)', emoji: '🐰' },
  zebra: { picture: 'Zebra (Z)', emoji: '🦓' },
  one: { picture: 'One apple (1)', emoji: '1' },
  two: { picture: 'Two balls (2)', emoji: '2' },
  three: { picture: 'Three stars (3)', emoji: '3' },
  four: { picture: 'Four fish (4)', emoji: '4' },
  five: { picture: 'Five flowers (5)', emoji: '5' },
} satisfies Record<string, Pic>;

/** What an option or card is made of, before the pictures are looked up. */
type Media = Pic | { glyph: string } | { text: string };

interface SampleQuestion {
  say: string;
  prompt?: Media;
  options?: Array<{
    media: Media;
    right?: boolean;
    group?: number;
    match?: Media;
    shadow?: boolean;
  }>;
  settings?: CreateQuestionInput['settings'];
}

interface SampleActivity {
  code: string;
  title: string;
  type: ActivityType;
  /** Where in the books it comes from. */
  from: string;
  questions: SampleQuestion[];
}

const glyph = (value: string): Media => ({ glyph: value });
const text = (value: string): Media => ({ text: value });

const CHAPTERS: Array<{ name: string; activities: SampleActivity[] }> = [
  {
    name: 'My world (Holistic)',
    activities: [
      {
        code: 'SAMPLE_SHADOW_MATCH',
        title: 'Match the animal with its shadow',
        type: 'MATCH_PAIRS',
        from: 'Holistic Book A, p17',
        questions: [
          {
            say: 'Match each animal to its shadow.',
            options: [PIC.cat, PIC.elephant, PIC.fish, PIC.lion].map((animal) => ({
              media: animal,
              shadow: true,
            })),
          },
          {
            say: 'Match each fruit to its name.',
            options: [
              { media: PIC.apple, match: text('Apple') },
              { media: PIC.grapes, match: text('Grapes') },
              { media: PIC.mango, match: text('Mango') },
            ],
          },
        ],
      },
      {
        code: 'SAMPLE_HEALTHY_JUNK',
        title: 'Tick the healthy food, cross the junk food',
        type: 'SORT_GROUPS',
        from: 'Holistic Book A, p40',
        questions: [
          {
            say: 'Put each food in its basket: healthy or junk.',
            settings: {
              groups: [
                { label: 'Healthy', glyph: '✅' },
                { label: 'Junk', glyph: '❌' },
              ],
            },
            options: [
              { media: PIC.apple, group: 0 },
              { media: glyph('🍔'), group: 1 },
              { media: PIC.grapes, group: 0 },
              { media: glyph('🍟'), group: 1 },
              { media: PIC.mango, group: 0 },
              { media: glyph('🍭'), group: 1 },
            ],
          },
        ],
      },
      {
        code: 'SAMPLE_ANIMAL_HOMES',
        title: 'Domestic, wild and water animals',
        type: 'SORT_GROUPS',
        from: 'Holistic Book A, p20',
        questions: [
          {
            say: 'Where does each animal live? Home, forest or water.',
            settings: {
              groups: [
                { label: 'Home', glyph: '🏠' },
                { label: 'Forest', glyph: '🌳' },
                { label: 'Water', glyph: '🌊' },
              ],
            },
            options: [
              { media: PIC.cat, group: 0 },
              { media: PIC.lion, group: 1 },
              { media: PIC.fish, group: 2 },
              { media: PIC.dog, group: 0 },
              { media: PIC.zebra, group: 1 },
              { media: glyph('🐬'), group: 2 },
              { media: PIC.rabbit, group: 0 },
              { media: PIC.elephant, group: 1 },
            ],
          },
        ],
      },
      {
        code: 'SAMPLE_PET_ANIMALS',
        title: 'Circle the pet animals',
        type: 'MULTIPLE_CHOICE',
        from: 'Holistic Book A, p18',
        questions: [
          {
            say: 'Tap every pet animal, then Done.',
            options: [
              { media: PIC.cat, right: true },
              { media: PIC.lion },
              { media: PIC.dog, right: true },
              { media: PIC.zebra },
              { media: PIC.rabbit, right: true },
              { media: PIC.elephant },
            ],
          },
          {
            say: 'Tap every fruit, then Done.',
            options: [
              { media: PIC.apple, right: true },
              { media: PIC.cat },
              { media: PIC.mango, right: true },
              { media: PIC.ball },
              { media: PIC.grapes, right: true },
              { media: PIC.dog },
            ],
          },
        ],
      },
      {
        code: 'SAMPLE_FRUIT_CARDS',
        title: 'Fruits we eat',
        type: 'FLASHCARD',
        from: 'Holistic Book A, p9',
        questions: [
          { say: 'This is an apple. Apples are crunchy and red.', prompt: PIC.apple },
          { say: 'These are grapes. They grow in a bunch.', prompt: PIC.grapes },
          { say: 'This is a mango. Mangoes are sweet and yellow.', prompt: PIC.mango },
        ],
      },
      {
        code: 'SAMPLE_ANIMAL_CARDS',
        title: 'Animals around us',
        type: 'FLASHCARD',
        from: 'Holistic Book A, the animal pages',
        questions: [
          { say: 'This is a cat. A cat says meow.', prompt: PIC.cat },
          { say: 'This is a dog. A dog says woof.', prompt: PIC.dog },
          { say: 'This is an elephant. It has a long trunk.', prompt: PIC.elephant },
          { say: 'This is a lion. The lion is the king of the forest.', prompt: PIC.lion },
          { say: 'This is a zebra. It has black and white stripes.', prompt: PIC.zebra },
          { say: 'This is a fish. A fish swims in water.', prompt: PIC.fish },
        ],
      },
      {
        code: 'SAMPLE_NOT_A_FRUIT',
        title: 'Which one does not belong?',
        type: 'ODD_ONE_OUT',
        from: 'Holistic Book A, the odd one out pages',
        questions: [
          {
            say: 'Which one is not a fruit?',
            options: [
              { media: PIC.apple },
              { media: PIC.mango },
              { media: PIC.ball, right: true },
              { media: PIC.grapes },
            ],
          },
          {
            say: 'Which one is not an animal?',
            options: [
              { media: PIC.cat },
              { media: PIC.apple, right: true },
              { media: PIC.dog },
              { media: PIC.rabbit },
            ],
          },
        ],
      },
      {
        code: 'SAMPLE_COLOUR_ANIMALS',
        title: 'Count and colour the animals',
        type: 'COUNT_OUT',
        from: 'Holistic Book A, the colouring pages',
        questions: [
          { say: 'Colour 4 fish.', prompt: PIC.fish, settings: { target: 4, shown: 8 } },
          { say: 'Colour 2 cats.', prompt: PIC.cat, settings: { target: 2, shown: 6 } },
        ],
      },
    ],
  },
  {
    name: 'Letters (Literacy)',
    activities: [
      {
        code: 'SAMPLE_FIND_D',
        title: 'Circle all the capital D and small d',
        type: 'LETTER_HUNT',
        from: 'Literacy Book A, p11',
        questions: [
          {
            say: 'Find every D and d.',
            settings: { targets: 'D d', grid: 'D A d D d E D O D A Z d C D d D S j' },
          },
          {
            say: 'Find every B and b.',
            settings: { targets: 'B b', grid: 'B d b P B b D B q b p B' },
          },
          {
            say: 'Find every A and a.',
            settings: { targets: 'A a', grid: 'A n a A m a A e a A' },
          },
        ],
      },
      {
        code: 'SAMPLE_FIRST_LETTER',
        title: 'Circle the first letter of the picture',
        type: 'SINGLE_CHOICE',
        from: 'Literacy Book A, p13',
        questions: [
          {
            say: 'Which letter does apple start with?',
            prompt: PIC.apple,
            options: [
              { media: glyph('A'), right: true },
              { media: glyph('B') },
              { media: glyph('C') },
            ],
          },
          {
            say: 'Which letter does ball start with?',
            prompt: PIC.ball,
            options: [
              { media: glyph('D') },
              { media: glyph('B'), right: true },
              { media: glyph('P') },
            ],
          },
          {
            say: 'Which letter does cat start with?',
            prompt: PIC.cat,
            options: [
              { media: glyph('C'), right: true },
              { media: glyph('O') },
              { media: glyph('G') },
            ],
          },
          {
            say: 'Which letter does dog start with?',
            prompt: PIC.dog,
            options: [
              { media: glyph('B') },
              { media: glyph('P') },
              { media: glyph('D'), right: true },
            ],
          },
          {
            say: 'Which letter does elephant start with?',
            prompt: PIC.elephant,
            options: [
              { media: glyph('E'), right: true },
              { media: glyph('F') },
              { media: glyph('A') },
            ],
          },
        ],
      },
      {
        code: 'SAMPLE_CAPITAL_SMALL',
        title: 'Match the capital and small letters',
        type: 'MATCH_PAIRS',
        from: 'Literacy Book A, p22',
        questions: [
          {
            say: 'Match each big letter to its small letter.',
            options: ['A', 'B', 'C', 'D', 'E'].map((letter) => ({
              media: glyph(letter),
              match: glyph(letter.toLowerCase()),
            })),
          },
        ],
      },
      {
        code: 'SAMPLE_ALPHABET_TRAIN',
        title: 'Fill in the missing letters',
        type: 'FILL_GAP',
        from: 'Literacy Book A, p68',
        questions: [
          {
            say: 'Which letters are missing from the train?',
            settings: { row: 'A B [C] D [E] F' },
          },
          {
            say: 'Apple starts with…',
            prompt: PIC.apple,
            settings: { row: '[a] p p l e', extras: 'o u' },
          },
        ],
      },
      {
        code: 'SAMPLE_STARTS_WITH_B',
        title: 'Tap the pictures that start with B',
        type: 'MULTIPLE_CHOICE',
        from: 'Literacy Book A, the "starts with" pages',
        questions: [
          {
            say: 'Tap every picture that starts with B, then Done.',
            options: [
              { media: PIC.ball, right: true },
              { media: PIC.cat },
              { media: glyph('🍌'), right: true },
              { media: PIC.apple },
              { media: glyph('🚌'), right: true },
              { media: PIC.fish },
            ],
          },
        ],
      },
      {
        code: 'SAMPLE_LETTER_CARDS',
        title: 'A for Apple',
        type: 'FLASHCARD',
        from: 'Literacy Book A, the letter pages',
        questions: [
          { say: 'A is for Apple.', prompt: PIC.apple },
          { say: 'B is for Ball.', prompt: PIC.ball },
          { say: 'C is for Cat.', prompt: PIC.cat },
          { say: 'D is for Dog.', prompt: PIC.dog },
          { say: 'E is for Elephant.', prompt: PIC.elephant },
          { say: 'F is for Fish.', prompt: PIC.fish },
        ],
      },
      {
        code: 'SAMPLE_CAPITAL_OR_SMALL',
        title: 'Capital letter or small letter?',
        type: 'SORT_GROUPS',
        from: 'Literacy Book A, the revision pages',
        questions: [
          {
            say: 'Put each letter in its basket: capital or small.',
            settings: {
              groups: [
                { label: 'Capital', glyph: 'A' },
                { label: 'Small', glyph: 'a' },
              ],
            },
            options: [
              { media: glyph('B'), group: 0 },
              { media: glyph('d'), group: 1 },
              { media: glyph('E'), group: 0 },
              { media: glyph('f'), group: 1 },
              { media: glyph('G'), group: 0 },
              { media: glyph('h'), group: 1 },
            ],
          },
        ],
      },
      {
        code: 'SAMPLE_ODD_LETTER',
        title: 'Which letter is different?',
        type: 'ODD_ONE_OUT',
        from: 'Literacy Workbook A, same letters',
        questions: [
          {
            say: 'Which letter is different?',
            options: [
              { media: glyph('A') },
              { media: glyph('A') },
              { media: glyph('B'), right: true },
              { media: glyph('A') },
            ],
          },
          {
            say: 'Which small letter is different?',
            options: [
              { media: glyph('c') },
              { media: glyph('o'), right: true },
              { media: glyph('c') },
              { media: glyph('c') },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Numbers (Numeracy)',
    activities: [
      {
        code: 'SAMPLE_COUNT_COLOUR',
        title: 'Count and colour',
        type: 'COUNT_OUT',
        from: 'Numeracy Book A, p43',
        questions: [
          { say: 'Colour 11 balls.', prompt: PIC.ball, settings: { target: 11, shown: 20 } },
          { say: 'Colour 5 apples.', prompt: PIC.apple, settings: { target: 5, shown: 9 } },
          { say: 'Colour 3 stars.', prompt: glyph('⭐'), settings: { target: 3, shown: 6 } },
          { say: 'Colour 7 grapes.', prompt: PIC.grapes, settings: { target: 7, shown: 12 } },
        ],
      },
      {
        code: 'SAMPLE_HOW_MANY',
        title: 'Count and circle the number',
        type: 'SINGLE_CHOICE',
        from: 'Numeracy Book A, p21',
        questions: [
          {
            say: 'Which plate has 2 cookies?',
            options: [
              { media: text('🍪') },
              { media: text('🍪🍪'), right: true },
              { media: text('🍪🍪🍪') },
            ],
          },
          {
            say: 'How many apples? 🍎🍎🍎🍎',
            options: [
              { media: glyph('3') },
              { media: glyph('4'), right: true },
              { media: glyph('5') },
            ],
          },
        ],
      },
      {
        code: 'SAMPLE_NUMBER_TRAIN',
        title: 'Circle the number on the train',
        type: 'LETTER_HUNT',
        from: 'Numeracy Book A, every number page',
        questions: [
          { say: 'Find every 7 on the train.', settings: { targets: '7', grid: '8 7 7 6 5 2' } },
          { say: 'Find every 3 on the train.', settings: { targets: '3', grid: '0 2 1 3 2 3' } },
        ],
      },
      {
        code: 'SAMPLE_MISSING_NUMBERS',
        title: 'Write the missing numbers',
        type: 'FILL_GAP',
        from: 'Numeracy Workbook A, p24 and p38',
        questions: [
          { say: 'Which numbers are missing?', settings: { row: '1 [2] 3 [4] 5' } },
          { say: 'Which numbers are missing?', settings: { row: '6 7 [8] 9 [10]' } },
          { say: 'What comes before 5?', settings: { row: '[4] 5 6' } },
        ],
      },
      {
        code: 'SAMPLE_COUNT_MATCH',
        title: 'Count and match',
        type: 'MATCH_PAIRS',
        from: 'Numeracy Workbook A, p26',
        questions: [
          {
            say: 'Count the stars and match the number.',
            options: [
              { media: text('⭐'), match: glyph('1') },
              { media: text('⭐⭐'), match: glyph('2') },
              { media: text('⭐⭐⭐'), match: glyph('3') },
              { media: text('⭐⭐⭐⭐'), match: glyph('4') },
            ],
          },
        ],
      },
      {
        code: 'SAMPLE_ODD_ONE_OUT',
        title: 'Circle the odd one out',
        type: 'ODD_ONE_OUT',
        from: 'Numeracy Book A, p15',
        questions: [
          {
            say: 'Which one is different?',
            options: [
              { media: glyph('🎒') },
              { media: glyph('🎒') },
              { media: glyph('📚'), right: true },
              { media: glyph('🎒') },
            ],
          },
          {
            say: 'Which one is different?',
            options: [
              { media: glyph('🚗'), right: true },
              { media: glyph('🚚') },
              { media: glyph('🚚') },
              { media: glyph('🚚') },
            ],
          },
        ],
      },
      {
        code: 'SAMPLE_BIG_SMALL',
        title: 'Big and small',
        type: 'SINGLE_CHOICE',
        from: 'Numeracy Book A, p4',
        questions: [
          {
            say: 'Which animal is big?',
            options: [{ media: PIC.elephant, right: true }, { media: PIC.rabbit }],
          },
          {
            say: 'Which bunch has more grapes?',
            options: [{ media: text('🍇') }, { media: text('🍇🍇🍇🍇🍇'), right: true }],
          },
        ],
      },
      {
        code: 'SAMPLE_NUMBER_CARDS',
        title: 'Numbers 1 to 5',
        type: 'FLASHCARD',
        from: 'Numeracy Book A, the number pages',
        questions: [
          { say: 'One. One apple.', prompt: PIC.one },
          { say: 'Two. Two balls.', prompt: PIC.two },
          { say: 'Three. Three stars.', prompt: PIC.three },
          { say: 'Four. Four fish.', prompt: PIC.four },
          { say: 'Five. Five flowers.', prompt: PIC.five },
        ],
      },
      {
        code: 'SAMPLE_BIG_OR_SMALL',
        title: 'Big animals and small animals',
        type: 'SORT_GROUPS',
        from: 'Numeracy Workbook A, p3',
        questions: [
          {
            say: 'Put each animal in its basket: big or small.',
            settings: {
              groups: [
                { label: 'Big', glyph: '🐘' },
                { label: 'Small', glyph: '🐭' },
              ],
            },
            options: [
              { media: PIC.elephant, group: 0 },
              { media: PIC.cat, group: 1 },
              { media: PIC.lion, group: 0 },
              { media: PIC.rabbit, group: 1 },
              { media: PIC.zebra, group: 0 },
              { media: PIC.fish, group: 1 },
            ],
          },
        ],
      },
      {
        code: 'SAMPLE_TAP_THREES',
        title: 'Tap every number 3',
        type: 'MULTIPLE_CHOICE',
        from: 'Numeracy Book A, p22',
        questions: [
          {
            say: 'Tap every 3, then Done.',
            options: [
              { media: glyph('3'), right: true },
              { media: glyph('5') },
              { media: glyph('3'), right: true },
              { media: glyph('8') },
              { media: glyph('3'), right: true },
              { media: glyph('1') },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Rhymes and stories',
    activities: [
      {
        code: 'SAMPLE_RHYMES',
        title: 'Nursery rhymes',
        type: 'RHYME',
        from: 'Nursery Rhymes A, p15 and p16',
        questions: [
          {
            say: 'Twinkle Twinkle Little Star',
            prompt: glyph('⭐'),
            settings: {
              lines: [
                'Twinkle, twinkle, little star,',
                'How I wonder what you are.',
                'Up above the world so high,',
                'Like a diamond in the sky.',
              ].join('\n'),
            },
          },
          {
            say: 'Johnny Johnny',
            prompt: glyph('👦'),
            settings: {
              lines: [
                'Johnny, Johnny,',
                'Yes, papa?',
                'Eating sugar?',
                'No, papa.',
                'Telling lies?',
                'No, papa.',
                'Open your mouth.',
                'Ha! Ha! Ha!',
              ].join('\n'),
            },
          },
          {
            say: 'Rain, Rain, Go Away',
            prompt: glyph('🌧️'),
            settings: {
              lines: [
                'Rain, rain, go away,',
                'Come again another day.',
                'Little Tommy wants to play.',
                'Rain, rain, go away.',
              ].join('\n'),
            },
          },
          {
            say: 'Two Little Hands',
            prompt: glyph('👏'),
            settings: {
              lines: [
                'Two little hands go clap, clap, clap,',
                'Two little feet go tap, tap, tap,',
                'Two little eyes are open wide,',
                'One little head goes side to side.',
              ].join('\n'),
            },
          },
        ],
      },
      {
        code: 'SAMPLE_THIRSTY_CROW',
        title: 'The Thirsty Crow',
        type: 'STORY',
        from: 'Nursery Rhymes A, p24',
        questions: [
          {
            say: 'The Thirsty Crow',
            prompt: glyph('🐦'),
            settings: {
              lines: [
                'Once upon a time there was a crow, and he was very thirsty.',
                'He looked for water here and there.',
                'At last he saw a pot of water, but there was very little water in it.',
                'The crow thought of a plan.',
                'He collected some stones and put them into the pot one by one.',
                'The water came up.',
                'The crow drank the water and flew away happily.',
                'Moral: Where there is a will, there is a way.',
              ].join('\n'),
            },
          },
        ],
      },
      {
        code: 'SAMPLE_TWO_CATS',
        title: 'The Two Cats and a Monkey',
        type: 'STORY',
        from: 'Nursery Rhymes A, p23',
        questions: [
          {
            say: 'The Two Cats and a Monkey',
            prompt: glyph('🐒'),
            settings: {
              lines: [
                'Once upon a time there were two cats. They were good friends.',
                'They got a piece of bread.',
                'They made a big piece and a small piece, and began to fight for the bigger one.',
                'A monkey saw them fighting. He said, "I will share it equally."',
                'He bit the bigger piece to make it equal. Then he bit the other piece.',
                'Bit by bit, he ate the whole bread and went away happily.',
                'The poor cats lost the bread.',
                'Moral: We must learn to share what we have.',
              ].join('\n'),
            },
          },
        ],
      },
    ],
  },
];

export interface SamplesResult {
  bookId: string;
  bookName: string;
  /** Activities added this time; zero when everything was there. */
  added: number;
  /** Activities the sample book has, all told. */
  total: number;
  /** Questions added to sample pages that were there already. */
  questionsAdded: number;
}

/** Adds the sample book, or whatever of it is missing. */
export async function addPrePrimarySamples(actorUserId: string): Promise<SamplesResult> {
  // The letter pictures, brought into the library if they are not there yet.
  try {
    await pictures.importAppPictures(actorUserId);
  } catch (error) {
    // Without them the samples use emoji; still worth having.
    logger.warn('Sample book: the app pictures could not be brought in', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const pictureIds = await libraryPictures();

  const level =
    (await prismaUnscoped.classLevel.findFirst({
      where: { code: 'NURSERY' },
      select: { id: true },
    })) ??
    (await prismaUnscoped.classLevel.findFirst({
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    }));
  if (!level) throw ApiError.badRequest('Add a standard before adding the sample book');

  const skill = await prismaUnscoped.skill.upsert({
    where: { code: SKILL_CODE },
    update: {},
    create: { code: SKILL_CODE, name: 'Pre-Primary A', classLevelId: level.id, sortOrder: 900 },
    select: { id: true },
  });

  const existing = await prismaUnscoped.book.findFirst({
    where: { code: SAMPLE_BOOK_CODE },
    select: { id: true, name: true },
  });
  const book =
    existing ??
    (await books.createBook(
      createBookSchema.parse({
        code: SAMPLE_BOOK_CODE,
        name: 'Pre-Primary A — Samples',
        classLevelId: level.id,
      }),
      actorUserId,
    ));

  const haveChapters = await prismaUnscoped.chapter.findMany({
    where: { bookId: book.id },
    select: { id: true, name: true },
  });

  let added = 0;
  let total = 0;
  let questionsAdded = 0;
  for (const sampleChapter of CHAPTERS) {
    const chapterId =
      haveChapters.find((chapter) => chapter.name === sampleChapter.name)?.id ??
      (
        await chapters.createChapter(
          book.id,
          createChapterSchema.parse({ name: sampleChapter.name }),
          actorUserId,
        )
      ).id;

    for (const sample of sampleChapter.activities) {
      total += 1;
      const there = await prismaUnscoped.learningActivity.findUnique({
        where: { code: sample.code },
        select: { id: true, questions: { select: { say: true } } },
      });
      if (there) {
        // A page from an earlier run: its new questions only, matched by what
        // they say, so pressing the button again tops it up.
        const said = new Set(there.questions.map((question) => question.say));
        for (const question of sample.questions) {
          if (said.has(question.say)) continue;
          await questions.createQuestion(
            there.id,
            createQuestionSchema.parse(toQuestion(sample.type, question, pictureIds)),
            actorUserId,
          );
          questionsAdded += 1;
        }
        continue;
      }

      const activity = await catalogue.createActivity(
        createActivitySchema.parse({
          code: sample.code,
          title: sample.title,
          type: sample.type,
          skillId: skill.id,
          classLevelId: level.id,
          bookIds: [book.id],
          chapterId,
        }),
        actorUserId,
      );
      for (const question of sample.questions) {
        await questions.createQuestion(
          activity.id,
          createQuestionSchema.parse(toQuestion(sample.type, question, pictureIds)),
          actorUserId,
        );
      }
      added += 1;
    }
  }

  return { bookId: book.id, bookName: book.name, added, total, questionsAdded };
}

/** The library's pictures the samples use, by the name they were brought in under. */
async function libraryPictures(): Promise<Map<string, string>> {
  const names = Object.values(PIC).flatMap((pic) => [`${pic.picture}.webp`, `${pic.picture}.png`]);
  const rows = await prismaUnscoped.fileObject.findMany({
    where: {
      schoolId: null,
      deletedAt: null,
      mimeType: { startsWith: 'image/' },
      originalName: { in: names },
    },
    select: { id: true, originalName: true },
  });
  return new Map(rows.map((row) => [row.originalName.replace(/\.(webp|png)$/, ''), row.id]));
}

/** A sample question as the API takes it, pictures looked up. */
function toQuestion(
  type: ActivityType,
  sample: SampleQuestion,
  pictureIds: Map<string, string>,
): CreateQuestionInput {
  /** A picture as its file, or its emoji when the library does not have it. */
  type Drawn = { fileId?: string; glyph?: string; text?: string };
  const media = (item: Media): Drawn => {
    if ('picture' in item) {
      const fileId = pictureIds.get(item.picture);
      return fileId ? { fileId } : { glyph: item.emoji };
    }
    return item;
  };

  const prompt: Drawn = sample.prompt ? media(sample.prompt) : {};
  return {
    say: sample.say,
    ...(prompt.fileId ? { promptFileId: prompt.fileId } : {}),
    ...(prompt.glyph ? { promptGlyph: prompt.glyph } : {}),
    ...(sample.settings ? { settings: sample.settings } : {}),
    options: (sample.options ?? []).map((option) => {
      const own = media(option.media);
      // A shadow needs the picture itself; with only an emoji, match its name.
      const shadow = Boolean(option.shadow && own.fileId);
      const match: Drawn | undefined = option.match
        ? media(option.match)
        : option.shadow && !shadow && 'picture' in option.media
          ? { text: option.media.picture.replace(/ \(.\)$/, '') }
          : undefined;
      return {
        ...own,
        isCorrect:
          type === 'ODD_ONE_OUT' || type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE'
            ? Boolean(option.right)
            : false,
        ...(option.group === undefined ? {} : { groupIndex: option.group }),
        ...(shadow ? { matchShadow: true } : {}),
        ...(match?.fileId ? { matchFileId: match.fileId } : {}),
        ...(match?.glyph ? { matchGlyph: match.glyph } : {}),
        ...(match?.text ? { matchText: match.text } : {}),
      };
    }),
  };
}
