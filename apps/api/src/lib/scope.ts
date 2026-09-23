/**
 * Sentinel used for users who belong to no school (PUBLICATION_ADMIN).
 *
 * MySQL treats NULLs as distinct in a unique index, so `@@unique([schoolId, email])`
 * would not stop two Super Admins sharing an email. `scopeKey` collapses NULL to
 * this constant so the constraint holds for them too.
 */
export const PUBLICATION_SCOPE = 'PUBLICATION';

export function scopeKeyFor(schoolId: string | null | undefined): string {
  return schoolId ?? PUBLICATION_SCOPE;
}

/** URL-safe slug derived from a school name, with the code as the tiebreaker. */
export function slugify(name: string, code: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return base ? `${base}-${code}` : code;
}

/**
 * Scope key for a group administrator, who belongs to no single school.
 *
 * `org:` prefixed rather than the bare id so it can never collide with a
 * school's id, which is what a school user's scope key is. A cuid is 25
 * characters, so this fits the VarChar(32) with room to spare.
 */
export function organisationScopeKey(organisationId: string): string {
  return `org:${organisationId}`;
}

/**
 * A code suggestion from a name: "Sunrise Preschool" → "sunrise".
 *
 * A school code doubles as an Android application-id segment, so the result is
 * always `[a-z][a-z0-9]{2,29}`. The first word is usually the recognisable one
 * and the rest ("Preschool", "International School") is noise that every school
 * shares, so this keeps the first two words and stops there.
 *
 * It only proposes. Uniqueness is settled by the caller, which is the only
 * place that can ask the database.
 */
export function codeFromName(name: string): string {
  const words = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let base = words.slice(0, 2).join('').slice(0, 20);

  // Must start with a letter: a school called "2nd Chance Academy" would
  // otherwise produce a code no Android build could use.
  if (!/^[a-z]/.test(base)) base = `s${base}`;
  if (base.length < 3) base = `${base}school`.slice(0, 20);

  return base;
}

/**
 * The next free code of a series, asked of whatever store the caller has.
 *
 * `taken` is a predicate rather than a query so this stays testable and so the
 * same function serves schools and organisations. It is a suggestion even so:
 * two admins creating a school at the same moment can still both be told
 * "sunrise02" is free, which is why the insert itself retries on the unique
 * constraint rather than trusting this.
 */
export async function nextFreeCode(
  base: string,
  taken: (candidate: string) => Promise<boolean>,
  options: { firstSuffix?: number; padTo?: number } = {},
): Promise<string> {
  const padTo = options.padTo ?? 0;
  const first = options.firstSuffix;

  if (first === undefined && !(await taken(base))) return base;

  for (let n = first ?? 2; n < 1000; n += 1) {
    const suffix = padTo > 0 ? String(n).padStart(padTo, '0') : String(n);
    const candidate = `${base.slice(0, 30 - suffix.length)}${suffix}`;
    if (!(await taken(candidate))) return candidate;
  }

  throw new Error(`No free code left in the "${base}" series`);
}
