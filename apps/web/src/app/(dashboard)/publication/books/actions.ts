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
        code: String(formData.get('code') ?? '').trim().toUpperCase(),
        name: String(formData.get('name') ?? '').trim(),
        classLevelId: String(formData.get('classLevelId') ?? ''),
        animationUrl: String(formData.get('animationUrl') ?? '').trim() || null,
        coverFileId,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the book.') };
  }

  revalidatePath('/publication/books');
  // Straight to the book, which is where its chapters are written — and where
  // the surprising half of the rule is visible: a new book is switched off at
  // every school until somebody sells it.
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
        animationUrl: String(formData.get('animationUrl') ?? '').trim() || null,
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
