'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export type SampleBookResult =
  { bookId: string; bookName: string; added: number; total: number } | { error: string };

/** Adds the sample book, or whatever of it is missing. */
export async function addSampleBookAction(): Promise<SampleBookResult> {
  try {
    const result = await apiFetch<{
      bookId: string;
      bookName: string;
      added: number;
      total: number;
    }>('/publication/samples/pre-primary-a', { method: 'POST', redirectOnAuthFailure: false });
    revalidatePath('/publication/books');
    revalidatePath('/publication/questions');
    revalidatePath('/publication/question-types');
    return result;
  } catch (error) {
    return { error: errorMessage(error, 'The sample book could not be added.') };
  }
}
