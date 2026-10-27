'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api';

/** cuid, which is what every id in this system is. */
const ID = /^[a-z0-9]{20,32}$/;

/** At most a page of them at once: the list shows fifty. */
const MOST = 100;

/**
 * Removes the activities ticked on the list, each through the same route that
 * removes one — so each is checked, audited and cascaded exactly as a single
 * delete is.
 *
 * A few at a time rather than one long queue or fifty at once: quick for a
 * page of them, and gentle on the API. One that fails does not stop the rest;
 * the answer says how many went and how many did not.
 */
export async function deleteActivitiesAction(
  ids: string[],
): Promise<{ deleted: number; failed: number }> {
  const wanted = [...new Set(ids)].filter((id) => ID.test(id)).slice(0, MOST);
  let deleted = 0;
  let failed = 0;

  for (let start = 0; start < wanted.length; start += 5) {
    const results = await Promise.allSettled(
      wanted.slice(start, start + 5).map((id) =>
        apiFetch(`/publication/questions/${id}`, {
          method: 'DELETE',
          redirectOnAuthFailure: false,
        }),
      ),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') deleted += 1;
      else failed += 1;
    }
  }

  revalidatePath('/publication/questions');
  // Each activity type's own page counts and lists them too.
  revalidatePath('/publication/question-types', 'layout');
  return { deleted, failed };
}
