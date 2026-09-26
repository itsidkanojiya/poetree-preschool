'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

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
