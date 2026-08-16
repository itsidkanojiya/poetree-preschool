import 'server-only';

import type { CatalogueActivity, Paginated } from '@poetree/shared';
import { apiFetch } from '@/lib/api';

/**
 * Every question type in the catalogue, for a filter that has to offer all of
 * them.
 *
 * This screen asked for 200 in one go. The API caps pageSize at 100 and answers
 * anything larger with a 400, so the whole page threw — Questions had been
 * returning a 500 in production, and would have kept doing so however small the
 * catalogue was, because the cap is on what is asked for and not on what comes
 * back.
 *
 * Paging is not merely the fix for that: a publisher's catalogue passes a
 * hundred pages long before it is finished, and silently taking the first
 * hundred would drop question types out of the filter with nothing to show it
 * had happened.
 */
export async function allActivities(): Promise<Paginated<CatalogueActivity>> {
  const first = await apiFetch<Paginated<CatalogueActivity>>('/publication/activities', {
    query: { pageSize: 100, page: 1, includeInactive: 'true' },
  });

  const items = [...first.items];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await apiFetch<Paginated<CatalogueActivity>>('/publication/activities', {
      query: { pageSize: 100, page, includeInactive: 'true' },
    });
    items.push(...next.items);
  }

  return { ...first, items, page: 1, pageSize: items.length, totalPages: 1 };
}
