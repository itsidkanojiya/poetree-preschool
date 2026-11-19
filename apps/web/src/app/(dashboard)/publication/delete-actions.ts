'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { ID } from '@/lib/document-proxy';
import type { DeleteState } from '@/components/ui/delete-button';

/** The publisher's permanent deletes in the catalogue. The API checks the typed name again. */

const confirmOf = (formData: FormData) => String(formData.get('confirm') ?? '').trim();

export async function deleteBookAction(
  bookId: string,
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  if (!ID.test(bookId)) return { error: 'Not a book.' };
  let name: string;
  try {
    ({ name } = await apiFetch<{ name: string }>(`/publication/books/${bookId}`, {
      method: 'DELETE',
      redirectOnAuthFailure: false,
      body: { confirm: confirmOf(formData) },
    }));
  } catch (error) {
    return { error: errorMessage(error, 'Could not delete the book.') };
  }
  revalidatePath('/publication/books');
  revalidatePath('/publication/question-types');
  redirect(`/publication/books?deleted=${encodeURIComponent(name)}`);
}

export async function deleteActivityAction(
  activityId: string,
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  if (!ID.test(activityId)) return { error: 'Not an activity type.' };
  let title: string;
  try {
    ({ title } = await apiFetch<{ title: string }>(`/publication/activities/${activityId}`, {
      method: 'DELETE',
      redirectOnAuthFailure: false,
      body: { confirm: confirmOf(formData) },
    }));
  } catch (error) {
    return { error: errorMessage(error, 'Could not delete the activity type.') };
  }
  revalidatePath('/publication/question-types');
  revalidatePath('/publication/books');
  redirect(`/publication/question-types?deleted=${encodeURIComponent(title)}`);
}

export async function deleteOrganisationAction(
  organisationId: string,
  _prev: DeleteState,
): Promise<DeleteState> {
  if (!ID.test(organisationId)) return { error: 'Not a group.' };
  try {
    await apiFetch(`/publication/organisations/${organisationId}`, {
      method: 'DELETE',
      redirectOnAuthFailure: false,
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not delete the group.') };
  }
  revalidatePath('/publication/organisations');
  revalidatePath('/publication/schools');
  redirect('/publication/organisations');
}
