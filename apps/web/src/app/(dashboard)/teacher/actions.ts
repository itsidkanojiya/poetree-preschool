'use server';

import { revalidatePath } from 'next/cache';
import type { AttendanceStatus } from '@poetree/shared';
import { apiFetch, errorMessage } from '@/lib/api';

export interface AttendanceState {
  error?: string;
  success?: string;
}

/**
 * Submits the whole register in one call.
 *
 * The API upserts on (classroom, date), so a double-tap or a retry leaves one
 * register rather than two — the same property the offline mobile app will rely
 * on later.
 */
export async function markAttendanceAction(
  classroomId: string,
  date: string,
  _prev: AttendanceState,
  formData: FormData,
): Promise<AttendanceState> {
  const records: Array<{ studentId: string; status: AttendanceStatus }> = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('status:')) continue;
    records.push({
      studentId: key.slice('status:'.length),
      status: String(value) as AttendanceStatus,
    });
  }

  if (records.length === 0) {
    return { error: 'No children on this register.' };
  }

  try {
    await apiFetch('/attendance', {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: {
        classroomId,
        date,
        note: String(formData.get('note') ?? '').trim() || undefined,
        records,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not save the register.') };
  }

  revalidatePath('/teacher/attendance');
  revalidatePath('/school/attendance');

  const absent = records.filter((r) => r.status !== 'PRESENT').length;
  return {
    success:
      absent === 0
        ? `Saved — all ${records.length} children present.`
        : `Saved — ${records.length - absent} present, ${absent} not.`,
  };
}
