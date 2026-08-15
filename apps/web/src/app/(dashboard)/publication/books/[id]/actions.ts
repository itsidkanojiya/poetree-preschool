'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

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

export async function createChapterAction(
  bookId: string,
  _prev: ChapterState,
  formData: FormData,
): Promise<ChapterState> {
  try {
    await apiFetch(`/publication/books/${bookId}/chapters`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        name: String(formData.get('name') ?? '').trim(),
        number: optionalNumber(formData, 'number'),
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
