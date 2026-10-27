/**
 * What each activity type's editor asks for, in one place.
 *
 * Plain data and functions, with no 'use client', so the server pages can
 * describe a type and the client editors can lay it out from the same source.
 */

/**
 * Types written as a list of options with the right one ticked. The old
 * Matching, Counting, Sorting, Colouring and Drag and drop are here because
 * they still exist and still play that way.
 */
const CHOICE_TYPES = new Set([
  'SINGLE_CHOICE',
  'ODD_ONE_OUT',
  'MULTIPLE_CHOICE',
  'MATCHING',
  'COUNTING',
  'SORTING',
  'COLOURING',
  'DRAG_DROP',
]);

export function isChoiceType(type: string): boolean {
  return CHOICE_TYPES.has(type);
}

/** Several answers may be ticked. */
export function isMultiType(type: string): boolean {
  return type === 'MULTIPLE_CHOICE';
}

/** Four to pick one from; eight to find them all — the books' rows run to eight. */
export function optionSlots(type: string): number {
  return isMultiType(type) ? 8 : 4;
}

/** Types whose questions carry settings beyond their options. */
export function hasSettings(type: string): boolean {
  return ['SORT_GROUPS', 'COUNT_OUT', 'FILL_GAP', 'LETTER_HUNT', 'RHYME', 'STORY'].includes(type);
}

/**
 * What goes above the question.
 *
 * - `picture`: a picture or an emoji, shown large above the answers.
 * - `glyph`: tracing's letter, number or pattern.
 * - `colour`: Count and Colour's one picture, shown many times.
 * - `illustration`: a rhyme's or story's picture, no emoji.
 * - `none`: the type has nothing above it.
 */
export type PromptStyle = 'picture' | 'glyph' | 'colour' | 'illustration' | 'none';

export function promptStyle(type: string): PromptStyle {
  if (type === 'TRACING') return 'glyph';
  if (type === 'COUNT_OUT') return 'colour';
  if (type === 'RHYME' || type === 'STORY') return 'illustration';
  if (type === 'MATCH_PAIRS' || type === 'SORT_GROUPS' || type === 'LETTER_HUNT') return 'none';
  return 'picture';
}

/** How the spoken line is asked for, by type. */
export function sayCopy(type: string): {
  label: string;
  placeholder: string;
  hint: string;
  initial?: string;
} {
  switch (type) {
    case 'ODD_ONE_OUT':
      return {
        label: 'What the child has to do',
        placeholder: 'Which one is different?',
        hint: 'Read aloud by the app.',
        initial: 'Which one is different?',
      };
    case 'MATCH_PAIRS':
      return {
        label: 'What the child has to do',
        placeholder: 'Match each animal to its shadow',
        hint: 'Read aloud by the app.',
      };
    case 'SORT_GROUPS':
      return {
        label: 'What the child has to do',
        placeholder: 'Put each food in its basket',
        hint: 'Read aloud by the app.',
      };
    case 'COUNT_OUT':
      return {
        label: 'What the child has to do',
        placeholder: 'Colour 11 balls',
        hint: 'Read aloud by the app. Say the number, so it is heard as well as seen.',
      };
    case 'FILL_GAP':
      return {
        label: 'What the child has to do',
        placeholder: 'Which numbers are missing?',
        hint: 'Read aloud by the app.',
      };
    case 'LETTER_HUNT':
      return {
        label: 'What the child has to do',
        placeholder: 'Find every D and d',
        hint: 'Read aloud by the app.',
      };
    case 'RHYME':
      return {
        label: 'Title',
        placeholder: 'Twinkle Twinkle Little Star',
        hint: 'Shown above the words, and read first.',
      };
    case 'STORY':
      return {
        label: 'Title',
        placeholder: 'The Thirsty Crow',
        hint: 'Shown above the story, and read first.',
      };
    case 'FLASHCARD':
      return {
        label: 'What the card says',
        placeholder: 'A is for Apple. The apple is red.',
        hint: 'Read aloud when the card is shown or tapped.',
      };
    default:
      return {
        label: 'What the child has to do',
        placeholder: 'Circle the apple',
        hint: 'Read aloud by the app. Written for the adult sitting beside them.',
      };
  }
}

/** The line under "Add an activity" for each type. */
export function editorDescription(type: string): string {
  switch (type) {
    case 'TRACING':
      return 'Draw the path a child follows with their finger.';
    case 'MULTIPLE_CHOICE':
      return 'A picture, an emoji or a word on each choice. Tick every right one.';
    case 'ODD_ONE_OUT':
      return 'Three or four pictures. Tick the one that is different.';
    case 'MATCH_PAIRS':
      return 'Two to five pairs, each written side by side. The app shuffles the right side.';
    case 'SORT_GROUPS':
      return 'Two or three baskets, and up to nine cards, each with its basket.';
    case 'COUNT_OUT':
      return 'One picture, shown in grey; the child colours exactly the number you choose.';
    case 'FILL_GAP':
      return 'A row of letters or numbers with the missing ones in brackets.';
    case 'LETTER_HUNT':
      return 'What to find, and everything in the grid it is hidden in.';
    case 'FLASHCARD':
      return 'Something to look at and hear. Nothing to get wrong.';
    case 'RHYME':
      return 'The rhyme, a line to a line. Read aloud with each line lit up.';
    case 'STORY':
      return 'The story, a line to a line, ending with its moral.';
    default:
      return 'A picture, an emoji or a word on each choice. Tick the right one.';
  }
}
