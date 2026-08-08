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
