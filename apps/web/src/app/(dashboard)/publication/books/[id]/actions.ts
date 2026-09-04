'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';
import { uploadCatalogueAsset } from '@/lib/catalogue-assets';

export interface ChapterState {
  error?: string;
  success?: string;
}

function optionalNumber(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? '').trim();
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Every chapter on the page, saved together.
 *
 * Each row had its own Save, so correcting three chapter names meant three
 * clicks and three page reloads, with no way to tell which had gone through.
 * The rows are one form now: what is on screen is what gets written.
 *
 * Only rows that actually changed are sent — a book with twelve chapters
 * should not fire twelve requests because one number moved.
 */
export async function saveChaptersAction(
  bookId: string,
  _prev: ChapterState,
  formData: FormData,
): Promise<ChapterState> {
  const ids = formData.getAll('chapterId').map(String);
  const names = formData.getAll('name').map(String);
  const films = formData.getAll('animationUrl').map(String);
  const before = formData.getAll('before').map(String);

  // One file input per row, always rendered, so this array lines up with the
  // ids above even when most rows are empty.
  const covers = formData.getAll('cover');
  // Ticked boxes only, so this carries ids rather than positions.
  const clearing = new Set(formData.getAll('removeCover').map(String));

  let saved = 0;

  for (const [index, id] of ids.entries()) {
    const name = (names[index] ?? '').trim();
    const film = (films[index] ?? '').trim();

    const chosen = covers[index];
    const picture = chosen instanceof File && chosen.size > 0 ? chosen : null;
    const removingPicture = clearing.has(id);

    // What the row looked like when the page was drawn, carried in a hidden
    // field: comparing against it is what makes "only the changed ones" real.
    // The number is not in it — that follows the order, and dragging saves it.
    // A picture is not in it either, because a File has no place in a string;
    // the two flags above say whether this row's picture is part of the save.
    if (`${name}|${film}` === before[index] && !picture && !removingPicture) continue;

    if (name === '') {
      return { error: 'A chapter needs a name. Use Remove to take one out.' };
    }

    try {
      /**
       * Left out entirely when nobody touched the picture.
       *
       * `PATCH` is partial, so an absent key means "as it was" — sending null
       * for every row would quietly strip the covers off eleven chapters
       * because somebody renamed the twelfth.
       */
      const coverFileId = picture
        ? await uploadCatalogueAsset(picture)
        : removingPicture
          ? null
          : undefined;

      await apiFetch(`/publication/chapters/${id}`, {
        method: 'PATCH',
        redirectOnAuthFailure: false,
        body: {
          name,
          animationUrl: film === '' ? null : film,
          ...(coverFileId === undefined ? {} : { coverFileId }),
        },
      });
      saved += 1;
    } catch (error) {
      return { error: `“${name}” was not saved: ${errorMessage(error, 'unknown reason')}` };
    }
  }

  if (saved === 0) return { success: 'Nothing had changed.' };

  revalidatePath(`/publication/books/${bookId}`);
  return { success: saved === 1 ? 'Chapter saved.' : `${saved} chapters saved.` };
}

export async function createChapterAction(
  bookId: string,
  _prev: ChapterState,
  formData: FormData,
): Promise<ChapterState> {
  const picture = formData.get('cover');

  try {
    const coverFileId =
      picture instanceof File && picture.size > 0 ? await uploadCatalogueAsset(picture) : null;

    await apiFetch(`/publication/books/${bookId}/chapters`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        name: String(formData.get('name') ?? '').trim(),
        animationUrl: String(formData.get('animationUrl') ?? '').trim() || null,
        coverFileId,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the chapter.') };
  }

  revalidatePath(`/publication/books/${bookId}`);
  return { success: 'Added. File the book’s pages into it from the question type screen.' };
}

export async function renameChapterAction(
  bookId: string,
  chapterId: string,
  _prev: ChapterState,
  formData: FormData,
): Promise<ChapterState> {
  try {
    await apiFetch(`/publication/chapters/${chapterId}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: {
        name: String(formData.get('name') ?? '').trim(),
        number: optionalNumber(formData, 'number'),
        animationUrl: String(formData.get('animationUrl') ?? '').trim() || null,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save it.') };
  }

  revalidatePath(`/publication/books/${bookId}`);
  return { success: 'Saved.' };
}

/** Refused server-side while question types are still in the chapter. */
export async function deleteChapterAction(bookId: string, chapterId: string): Promise<void> {
  await apiFetch(`/publication/chapters/${chapterId}`, { method: 'DELETE' });
  revalidatePath(`/publication/books/${bookId}`);
}

/**
 * The contents page, as dragged.
 *
 * The whole running order goes at once rather than the one chapter that moved:
 * moving a chapter changes the position of everything after it, and sending the
 * list is simpler than describing the ripple.
 */
export async function reorderChaptersAction(
  bookId: string,
  chapterIds: string[],
): Promise<void> {
  await apiFetch(`/publication/books/${bookId}/chapters/order`, {
    method: 'PUT',
    body: { chapterIds },
  });
  revalidatePath(`/publication/books/${bookId}`);
}
