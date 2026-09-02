'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export interface SubjectState {
  error?: string;
  success?: string;
}

export async function createSubjectAction(
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  const name = String(formData.get('name') ?? '').trim();

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

  revalidatePath('/school/classrooms/subjects');
  revalidatePath('/school/timetable');
  return { success: `${name} added. It is on the timetable pickers now.` };
}

export async function renameSubjectAction(
  id: string,
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  try {
    await apiFetch(`/subjects/${id}`, {
      method: 'PATCH',
      redirectOnAuthFailure: false,
      body: { name: String(formData.get('name') ?? '').trim() },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save it.') };
  }

  revalidatePath('/school/classrooms/subjects');
  revalidatePath('/school/timetable');
  return { success: 'Saved.' };
}

/**
 * Retired, never deleted.
 *
 * A timetable entry's subject is set to null when the subject goes, so a delete
 * would empty every period it was on — a week quietly losing its subjects,
 * found by a parent looking at a grid of blank cells.
 */
export async function retireSubjectAction(id: string): Promise<void> {
  await apiFetch(`/subjects/${id}/retire`, { method: 'POST' });
  revalidatePath('/school/classrooms/subjects');
  revalidatePath('/school/timetable');
}
