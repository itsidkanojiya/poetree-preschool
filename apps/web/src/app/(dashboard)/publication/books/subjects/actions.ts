'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';
import { uploadCatalogueAsset } from '@/lib/catalogue-assets';

export interface SubjectState {
  error?: string;
  success?: string;
}

function refresh(): void {
  revalidatePath('/publication/books/subjects');
  // The book forms offer these as a dropdown.
  revalidatePath('/publication/books');
}

export async function createSubjectAction(
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  const name = String(formData.get('name') ?? '').trim();

  try {
    await apiFetch('/publication/book-subjects', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { name, icon: String(formData.get('icon') ?? 'book') },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the subject.') };
  }

  refresh();
  return { success: `${name} added.` };
}

export async function updateSubjectAction(
  id: string,
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  try {
    await apiFetch(`/publication/book-subjects/${id}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: {
        name: String(formData.get('name') ?? '').trim(),
        icon: String(formData.get('icon') ?? 'book'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save it.') };
  }

  refresh();
  return { success: 'Saved.' };
}

/**
 * Switched off, never deleted. Its books stay where they are and show under
 * "More books" in the app until they are filed somewhere else.
 */
export async function setSubjectActiveAction(id: string, isActive: boolean): Promise<void> {
  await apiFetch(`/publication/book-subjects/${id}`, { method: 'PATCH', body: { isActive } });
  refresh();
}

/**
 * A subject's picture, shown on its tile in the app in place of the icon.
 *
 * Two steps, like a book's cover: the upload route owns the sniffing and the
 * caps, and this records which file the subject wears. Remove goes back to the
 * icon.
 */
export async function setSubjectPictureAction(
  id: string,
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  const remove = formData.get('remove') === '1';
  const file = formData.get('picture');

  try {
    let pictureFileId: string | null = null;
    if (!remove) {
      if (!(file instanceof File) || file.size === 0) return { error: 'Choose a picture first.' };
      pictureFileId = await uploadCatalogueAsset(file);
    }

    await apiFetch(`/publication/book-subjects/${id}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: { pictureFileId },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the picture.') };
  }

  refresh();
  return { success: remove ? 'Picture removed.' : 'Picture saved.' };
}
