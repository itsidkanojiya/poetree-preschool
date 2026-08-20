'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { uploadCatalogueAsset } from '@/lib/catalogue-assets';

export interface BookState {
  error?: string;
  success?: string;
}

export async function createBookAction(_prev: BookState, formData: FormData): Promise<BookState> {
  let created: { id: string };

  try {
    // The cover goes up first, so the book is created already wearing it. The
    // alternative was a book that exists with no cover for as long as it takes
    // somebody to remember to go back and add one.
    const file = formData.get('cover');
    const coverFileId =
      file instanceof File && file.size > 0 ? await uploadCatalogueAsset(file) : null;

    created = await apiFetch<{ id: string }>('/publication/books', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        // No code: the API derives one from the standard and the name.
        name: String(formData.get('name') ?? '').trim(),
        classLevelId: String(formData.get('classLevelId') ?? ''),
        coverFileId,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the book.') };
  }

  /**
   * The chapters typed alongside the book, in the order they were typed.
   *
   * Sequentially rather than in parallel: sortOrder is assigned by the API from
   * what is already there, so two at once would race for the same position.
   * There are three or four of these, not three hundred.
   */
  const names = formData.getAll('chapterName').map(String);
  const numbers = formData.getAll('chapterNumber').map(String);
  const films = formData.getAll('chapterAnimation').map(String);

  for (const [index, name] of names.entries()) {
    if (name.trim() === '') continue;

    const number = Number(numbers[index] ?? '');
    const film = (films[index] ?? '').trim();

    try {
      await apiFetch(`/publication/books/${created.id}/chapters`, {
        method: 'POST',
        redirectOnAuthFailure: false,
        body: {
          name: name.trim(),
          number: Number.isFinite(number) && numbers[index] !== '' ? number : null,
          animationUrl: film === '' ? null : film,
        },
      });
    } catch (error) {
      // The book exists; say which chapter did not, rather than losing both.
      return {
        error: `The book was added, but “${name.trim()}” was not: ${errorMessage(error, 'unknown reason')}`,
      };
    }
  }

  revalidatePath('/publication/books');
  // Straight to the book, which is where the rest of its chapters are written —
  // and where the surprising half of the rule is visible: a new book is
  // switched off at every school until somebody sells it.
  redirect(`/publication/books/${created.id}`);
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
      body: {
        name: String(formData.get('name') ?? '').trim(),
      },
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


/**
 * The picture on the front of the book.
 *
 * Two steps, like every other attachment: the upload route owns the sniffing
 * and the caps, and this records which file the book wears. An empty submit
 * clears it — a cover somebody uploaded by mistake has to be removable.
 */
export async function setBookCoverAction(
  bookId: string,
  _prev: BookState,
  formData: FormData,
): Promise<BookState> {
  const file = formData.get('cover');

  try {
    const coverFileId =
      file instanceof File && file.size > 0 ? await uploadCatalogueAsset(file) : null;

    await apiFetch(`/publication/books/${bookId}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: { coverFileId },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the cover.') };
  }

  revalidatePath('/publication/books');
  return { success: file instanceof File && file.size > 0 ? 'Cover saved.' : 'Cover removed.' };
}
