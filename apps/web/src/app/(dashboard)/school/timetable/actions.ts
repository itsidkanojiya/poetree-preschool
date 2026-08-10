'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export interface TimetableState {
  error?: string;
  success?: string;
}

/**
 * Saves the whole week in one call.
 *
 * The grid posts every cell it knows about; empty ones are simply omitted, so
 * clearing a slot is expressed by its absence rather than by a delete.
 */
export async function saveTimetableAction(
  classroomId: string,
  _prev: TimetableState,
  formData: FormData,
): Promise<TimetableState> {
  const slots: Array<{
    dayOfWeek: number;
    periodId: string;
    subjectId?: string | null;
    teacherId?: string | null;
    roomId?: string | null;
  }> = [];

  for (const [key, value] of formData.entries()) {
    // Keys look like "cell:<day>:<periodId>:<field>".
    if (!key.startsWith('cell:')) continue;
    const [, day, periodId, field] = key.split(':');
    if (!day || !periodId || !field) continue;

    const chosen = String(value);
    if (!chosen) continue;

    let slot = slots.find((s) => s.dayOfWeek === Number(day) && s.periodId === periodId);
    if (!slot) {
      slot = { dayOfWeek: Number(day), periodId };
      slots.push(slot);
    }

    if (field === 'subject') slot.subjectId = chosen;
    if (field === 'teacher') slot.teacherId = chosen;
    if (field === 'room') slot.roomId = chosen;
  }

  try {
    await apiFetch(`/timetable/classrooms/${classroomId}`, {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: { slots },
    });
  } catch (error) {
    // Conflict messages name the clashing class, teacher and period, so they are
    // worth surfacing verbatim rather than replacing with something generic.
    return { error: errorMessage(error, 'Could not save the timetable.') };
  }

  revalidatePath('/school/timetable');
  return { success: `Saved ${slots.length} period${slots.length === 1 ? '' : 's'}.` };
}

export async function createPeriodAction(
  _prev: TimetableState,
  formData: FormData,
): Promise<TimetableState> {
  try {
    await apiFetch('/timetable/periods', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        academicYearId: String(formData.get('academicYearId') ?? ''),
        name: String(formData.get('name') ?? '').trim(),
        startTime: String(formData.get('startTime') ?? ''),
        endTime: String(formData.get('endTime') ?? ''),
        sortOrder: Number(formData.get('sortOrder') ?? 0),
        isBreak: formData.get('isBreak') === 'on',
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the period.') };
  }

  revalidatePath('/school/timetable');
  return { success: 'Period added.' };
}
