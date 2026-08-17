/**
 * Codes, derived rather than invented.
 *
 * Every book, standard and question type carries a short fixed handle — the
 * thing a spreadsheet import will name a row by, and the thing that keeps
 * pointing at the same row after somebody fixes a typo in its title. It is real,
 * but it is not something a person should have to think up: asked to name a book
 * "Grammar" under Nursery, anybody would write NUR_GRAMMAR, so the code writes
 * itself.
 *
 * Still accepted when given, because an author importing an existing catalogue
 * has codes already and they must survive the trip.
 */

/** ASCII, uppercase, underscores — what the code patterns allow. */
export function slugCode(...parts: Array<string | null | undefined>): string {
  const raw = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join('_')
    .toUpperCase()
    // Accented letters and Devanagari both appear in these catalogues; strip to
    // what the pattern allows rather than rejecting the name.
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

  // The patterns all require a letter first, and a name of only digits or
  // symbols would otherwise produce something they reject.
  const safe = /^[A-Z]/.test(raw) ? raw : `X_${raw}`;

  return safe.slice(0, 40).replace(/_+$/, '') || 'ITEM';
}

/**
 * The first code in the series that nothing else is using.
 *
 * Two books called "English" under the same standard is not a mistake — one is
 * Nursery's and one is Junior KG's — so a clash gets a number rather than an
 * error thrown at somebody who did nothing wrong.
 */
export async function uniqueCode(
  base: string,
  taken: (code: string) => Promise<boolean>,
): Promise<string> {
  if (!(await taken(base))) return base;

  for (let suffix = 2; suffix < 100; suffix += 1) {
    // Trim the stem, not the number: a truncated suffix would collide again.
    const tail = `_${suffix}`;
    const candidate = `${base.slice(0, 40 - tail.length).replace(/_+$/, '')}${tail}`;
    if (!(await taken(candidate))) return candidate;
  }

  throw new Error(`Could not find a free code near ${base}`);
}
