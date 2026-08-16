import 'server-only';

import type { Paginated, StudentSummary } from '@poetree/shared';
import { apiFetch } from '@/lib/api';

/**
 * Every child at the school, for a picker that has to offer all of them.
 *
 * The API caps pageSize at 100. Asking for more is a 400, and silently taking
 * the first hundred would hide children from the picker at any school past that
 * size — which the office would only discover when they could not take
 * somebody's fees. So page through.
 */
export async function allStudents(): Promise<StudentSummary[]> {
  const first = await apiFetch<Paginated<StudentSummary>>('/students', {
    query: { pageSize: 100, page: 1 },
  });

  const items = [...first.items];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await apiFetch<Paginated<StudentSummary>>('/students', {
      query: { pageSize: 100, page },
    });
    items.push(...next.items);
  }

  return items;
}
