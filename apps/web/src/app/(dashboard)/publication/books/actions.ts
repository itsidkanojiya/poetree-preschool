'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export interface BookState {
  error?: string;
  success?: string;
}

export async function createBookAction(_prev: BookState, formData: FormData): Promise<BookState> {
  try {
    await apiFetch('/publication/books', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        code: String(formData.get('code') ?? '').trim().toUpperCase(),
        name: String(formData.get('name') ?? '').trim(),
        classLevelId: String(formData.get('classLevelId') ?? ''),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the book.') };
  }

  revalidatePath('/publication/books');
  return {
    // Said plainly because it is the surprising half of the rule: a new book is
    // off everywhere until somebody sells it.
    success: 'Added. Turn it on for the schools that bought it, on their page.',
  };
}

export async function renameBookAction(
  id: string,
  _prev: BookState,
  formData: FormData,
): Promise<BookState> {
  try {
    await apiFetch(`/publication/books/${id}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: { name: String(formData.get('name') ?? '').trim() },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save it.') };
  }

  revalidatePath('/publication/books');
  return { success: 'Saved.' };
}

export async function setBookActiveAction(id: string, isActive: boolean): Promise<void> {
  await apiFetch(`/publication/books/${id}`, { method: 'PATCH', body: { isActive } });
  revalidatePath('/publication/books');
}

/**
 * The toggles on a school's page — what that school bought.
 *
 * Sent as the whole list rather than one at a time: a checkbox that is off
 * submits nothing at all, so reading only what arrived would silently turn
 * every unticked book back on.
 */
export async function setSchoolBooksAction(
  schoolId: string,
  bookIds: string[],
  _prev: BookState,
  formData: FormData,
): Promise<BookState> {
  const enabled = new Set(formData.getAll('books').map(String));

  try {
    await apiFetch(`/publication/schools/${schoolId}/books`, {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: { books: bookIds.map((bookId) => ({ bookId, enabled: enabled.has(bookId) })) },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save which books they have.') };
  }

  revalidatePath(`/publication/schools/${schoolId}`);
  return { success: `Saved. They have ${enabled.size} of ${bookIds.length} books.` };
}
