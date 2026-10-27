import { describe, expect, it } from 'vitest';
import {
  defaultShown,
  gapChoices,
  nearbyWrongTiles,
  parseGapRow,
  pieces,
  verseLines,
} from '../../src/content/activityKinds.js';

describe('what an author types', () => {
  it('splits on spaces, or a letter at a time when there are none', () => {
    expect(pieces('D d')).toEqual(['D', 'd']);
    expect(pieces('10 11 12')).toEqual(['10', '11', '12']);
    expect(pieces('DAdD')).toEqual(['D', 'A', 'd', 'D']);
    // A Hindi letter with its vowel sign is one thing a child sees.
    expect(pieces('कि')).toEqual(['कि']);
    expect(pieces('  ')).toEqual([]);
    expect(pieces(null)).toEqual([]);
  });

  it('reads a row with its gaps in brackets', () => {
    expect(parseGapRow('1 2 [3] 4 [5]')).toEqual([
      { value: '1', gap: false },
      { value: '2', gap: false },
      { value: '3', gap: true },
      { value: '4', gap: false },
      { value: '5', gap: true },
    ]);
    expect(parseGapRow('[a] p p l e')[0]).toEqual({ value: 'a', gap: true });
    expect(parseGapRow('')).toEqual([]);
  });

  it('keeps a rhyme a line to a line, without the blank ones', () => {
    expect(verseLines('Twinkle, twinkle, little star,\n\nHow I wonder what you are.\r\n')).toEqual([
      'Twinkle, twinkle, little star,',
      'How I wonder what you are.',
    ]);
  });
});

describe('wrong tiles beside the right ones', () => {
  it('offers the numbers either side, never one already in the row', () => {
    expect(nearbyWrongTiles(['3'], ['1', '2', '3', '4'], 2)).toEqual(['5', '6']);
    expect(nearbyWrongTiles(['0'], ['0'], 2)).toEqual(['1', '2']);
  });

  it('offers letters of the same case and script', () => {
    expect(nearbyWrongTiles(['C'], ['A', 'B', 'C', 'D'], 2)).toEqual(['E', 'F']);
    expect(nearbyWrongTiles(['a'], ['a', 'p', 'l', 'e'], 2)).toEqual(['b', 'c']);
    const hindi = nearbyWrongTiles(['क'], ['क'], 2);
    expect(hindi).toHaveLength(2);
    expect(hindi.every((letter) => /\p{Script=Devanagari}/u.test(letter))).toBe(true);
  });

  it('builds the tiles: each answer once, then wrong ones, four at most', () => {
    expect(gapChoices(parseGapRow('1 2 [3] 4 [5]'), null)).toEqual(['3', '5', '6', '7']);
    expect(gapChoices(parseGapRow('A B [C] D'), null)).toEqual(['C', 'E', 'F']);
    // What the author typed wins over what would be chosen.
    expect(gapChoices(parseGapRow('A B [C] D'), 'Q')).toEqual(['C', 'Q']);
    expect(gapChoices(parseGapRow('[1] [2] [3] 4'), null)).toHaveLength(4);
  });
});

describe('Count and Colour', () => {
  it('shows a few more than the number to colour, twenty at most', () => {
    expect(defaultShown(3)).toBe(6);
    expect(defaultShown(11)).toBe(17);
    expect(defaultShown(19)).toBe(20);
  });
});
