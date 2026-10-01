import type { TermSummary } from '@poetree/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';

/**
 * The current year's terms, or why there are none: a school that has not set
 * up its academic year yet gets a sentence, not an error page.
 */
export async function loadTerms(): Promise<{ terms: TermSummary[]; problem: string | null }> {
  try {
    const terms = await apiFetch<TermSummary[]>('/results/terms');
    return { terms, problem: null };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 400) {
      return { terms: [], problem: error.message };
    }
    throw error;
  }
}

/**
 * The term named in the address, or the one a school is most likely in: the
 * latest that has started, else the first.
 */
export function pickTerm(terms: TermSummary[], termId?: string): TermSummary | null {
  const active = terms.filter((term) => term.isActive);
  const named = active.find((term) => term.id === termId);
  if (named) return named;

  const now = Date.now();
  const started = active.filter((term) => term.startsOn && Date.parse(term.startsOn) <= now);
  return started[started.length - 1] ?? active[0] ?? null;
}

/** "Term 1 · 2026–27", the way a term is named in a heading. */
export function termTitle(term: TermSummary): string {
  return `${term.name} · ${term.academicYearName}`;
}
