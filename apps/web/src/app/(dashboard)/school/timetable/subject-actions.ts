'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export interface SubjectState {
  error?: string;
  success?: string;
}

/**
 * The subjects a school puts on its grid, written on the grid's own screen.
 *
 * They used to live under Classrooms, a click away from the only screen that
 * reads them — so the timetable offered an empty picker and the way to fill it
 * was somewhere else entirely. Every path here revalidates the timetable,
 * because that is the page the change is visible on.
 */
export async function createSubjectAction(
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  const name = String(formData.get('name') ?? '').trim();
  if (name === '') return { error: 'Give the subject a name.' };

  try {
    await apiFetch('/subjects', {
      method: 'POST',
      redirectOnAuthFailure: false,
      // No code: the API derives one from the name, per school.
      body: { name },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the subject.') };
  }

  revalidatePath('/school/timetable');
  return { success: `${name} added — it is in every class’s picker now.` };
}

export async function renameSubjectAction(
  id: string,
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  const name = String(formData.get('name') ?? '').trim();
  if (name === '') return { error: 'A subject needs a name.' };

  try {
    await apiFetch(`/subjects/${id}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: { name },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save it.') };
  }

  revalidatePath('/school/timetable');
  return { success: 'Saved. Every grid it is on now reads the new name.' };
}

/**
 * Retired, never deleted.
 *
 * A timetable entry's subject is set to null when the subject goes, so a delete
 * would empty every period it was on — a week quietly losing its subjects,
 * found by a parent looking at a grid of blank cells. Retiring takes it out of
 * the pickers and leaves every grid exactly as it was.
 */
export async function retireSubjectAction(id: string): Promise<void> {
  await apiFetch(`/subjects/${id}/retire`, { method: 'POST' });
  revalidatePath('/school/timetable');
}
