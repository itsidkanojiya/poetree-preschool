/**
 * What the newer activity types need beyond a list of options, worked out
 * from what an author types.
 *
 * Kept apart from the question service and free of the database, because each
 * of these is a small rule about text — where the gaps are in "1 2 [3] 4",
 * which letters are in a grid, which wrong tiles to offer — and every rule is
 * easier to trust with a test of its own.
 */

/** One car of a Fill the Gap row. */
export interface GapCell {
  value: string;
  gap: boolean;
}

/**
 * The pieces of a line an author typed.
 *
 * Spaces separate the pieces when there are any — "10 11 12" is three numbers,
 * "D d" two letters. A line with no spaces is read a letter at a time, so
 * "DAdD" is four; a Hindi letter with its marks stays one piece, because the
 * split is by what a reader sees as one character, not by code point.
 */
export function pieces(text: string | null | undefined): string[] {
  const line = (text ?? '').trim();
  if (line === '') return [];
  if (/\s/.test(line)) return line.split(/\s+/).filter(Boolean);
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(line)].map(
    (part) => part.segment,
  );
}

/**
 * A Fill the Gap row: "1 2 [3] 4 [5]", "[a] p p l e", "A B [C] D".
 *
 * Square brackets mark a gap and hold its answer. Spaces are needed between
 * the cars, because "10 [11] 12" has to be told apart from "1 0 1 1 1 2".
 */
export function parseGapRow(row: string | null | undefined): GapCell[] {
  return (row ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const gap = /^\[(.+)\]$/.exec(token);
      return gap ? { value: gap[1]!.trim(), gap: true } : { value: token, gap: false };
    })
    .filter((cell) => cell.value !== '' && cell.value.length <= 8);
}

/**
 * Wrong tiles to sit beside the right ones, close enough to make a child look:
 * the numbers either side of the answer, the letters either side of it.
 *
 * Never something already in the row — a tile that matches a car the child
 * can see is not a wrong answer, it is a trick. Letters stay in their own case
 * and their own script, so an "a" gets "b", not "B", and a Hindi letter gets a
 * Hindi letter.
 */
export function nearbyWrongTiles(answers: string[], inRow: string[], wanted: number): string[] {
  const taken = new Set([...answers, ...inRow]);
  const found: string[] = [];
  const offer = (value: string): void => {
    if (found.length < wanted && !taken.has(value)) {
      taken.add(value);
      found.push(value);
    }
  };

  for (let step = 1; step <= 4 && found.length < wanted; step += 1) {
    for (const answer of answers) {
      if (/^\d+$/.test(answer)) {
        const number = Number(answer);
        offer(String(number + step));
        if (number - step >= 0) offer(String(number - step));
        continue;
      }

      const letters = [...answer];
      if (letters.length !== 1) continue;
      const code = answer.codePointAt(0)!;
      for (const next of [code + step, code - step]) {
        const candidate = String.fromCodePoint(next);
        if (sameKind(answer, candidate)) offer(candidate);
      }
    }
  }
  return found;
}

/** Both letters of the same script and case, or both digits. */
function sameKind(a: string, b: string): boolean {
  if (!/^\p{L}$/u.test(b)) return false;
  const script = (letter: string): string =>
    /\p{Script=Latin}/u.test(letter)
      ? 'latin'
      : /\p{Script=Devanagari}/u.test(letter)
        ? 'devanagari'
        : /\p{Script=Gujarati}/u.test(letter)
          ? 'gujarati'
          : 'other';
  if (script(a) !== script(b)) return false;
  const lower = (letter: string): boolean => letter.toLowerCase() === letter;
  return script(a) !== 'latin' || lower(a) === lower(b);
}

/**
 * The tiles for a Fill the Gap row: each gap's answer once, then the author's
 * wrong tiles or, when they gave none, nearby ones — four tiles at most, and
 * always at least one wrong one so the right answer is a choice.
 */
export function gapChoices(cells: GapCell[], extras: string | null | undefined): string[] {
  const answers = [...new Set(cells.filter((cell) => cell.gap).map((cell) => cell.value))];
  const room = Math.max(1, Math.min(2, 4 - answers.length));
  const given = pieces(extras).filter((value) => !answers.includes(value) && value.length <= 8);
  const wrong =
    given.length > 0
      ? given.slice(0, room)
      : nearbyWrongTiles(
          answers,
          cells.map((cell) => cell.value),
          room,
        );
  return [...answers, ...wrong];
}

/**
 * How many pictures Count and Colour shows when the author did not say: a few
 * more than the number to colour, so there is something left over to not
 * colour, and never more than twenty.
 */
export function defaultShown(target: number): number {
  return Math.min(20, target + Math.max(3, Math.ceil(target / 2)));
}

/** A rhyme or story typed a line to a line, blank lines dropped. */
export function verseLines(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => line.slice(0, 160))
    .slice(0, 40);
}
