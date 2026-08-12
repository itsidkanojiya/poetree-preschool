'use server';

import { revalidatePath } from 'next/cache';
import type { PasswordResetResponse } from '@poetree/shared';
import { apiFetch, errorMessage } from '@/lib/api';

export interface ActionState {
  error?: string;
  success?: string;
}

export interface ResetState {
  error?: string;
  reset?: PasswordResetResponse;
}

/**
 * Sets a new password for a teacher or a parent who cannot get in.
 *
 * The reply is handed straight back to the page and never written anywhere
 * else: not to the log, not to a cookie, not into the revalidated cache.
 */
export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const kind = String(formData.get('kind') ?? '');
  const userId = String(formData.get('userId') ?? '');

  if (kind !== 'parents' && kind !== 'teachers') return { error: 'Unknown user.' };
  if (!userId) return { error: 'Unknown user.' };

  try {
    const reset = await apiFetch<PasswordResetResponse>(`/${kind}/${userId}/reset-password`, {
      method: 'POST',
      redirectOnAuthFailure: false,
    });
    return { reset };
  } catch (error) {
    return { error: errorMessage(error, 'Could not reset the password.') };
  }
}

function text(formData: FormData, key: string): string | undefined {
  const value = String(formData.get(key) ?? '').trim();
  return value === '' ? undefined : value;
}

function num(formData: FormData, key: string): number | undefined {
  const raw = text(formData, key);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function createTeacherAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await apiFetch('/teachers', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        name: text(formData, 'name'),
        email: text(formData, 'email'),
        phone: text(formData, 'phone'),
        password: text(formData, 'password'),
        employeeCode: text(formData, 'employeeCode'),
        qualification: text(formData, 'qualification'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the teacher.') };
  }

  revalidatePath('/school/teachers');
  return { success: 'Teacher added.' };
}

export async function createParentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await apiFetch('/parents', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        name: text(formData, 'name'),
        phone: text(formData, 'phone'),
        email: text(formData, 'email'),
        password: text(formData, 'password'),
        relation: text(formData, 'relation') ?? 'GUARDIAN',
        occupation: text(formData, 'occupation'),
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the parent.') };
  }

  revalidatePath('/school/parents');
  revalidatePath('/school/students');
  return { success: 'Parent added. They can now be linked to a child.' };
}

export async function createStudentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parentProfileId = text(formData, 'parentProfileId');

  if (!parentProfileId) {
    return { error: 'Choose a guardian. Every child is reached through a parent account.' };
  }

  try {
    await apiFetch('/students', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        firstName: text(formData, 'firstName'),
        lastName: text(formData, 'lastName'),
        dateOfBirth: text(formData, 'dateOfBirth'),
        gender: text(formData, 'gender'),
        admissionNo: text(formData, 'admissionNo'),
        rollNo: text(formData, 'rollNo'),
        classroomId: text(formData, 'classroomId'),
        guardians: [
          { parentProfileId, relation: text(formData, 'relation') ?? 'GUARDIAN', isPrimary: true },
        ],
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not add the student.') };
  }

  revalidatePath('/school/students');
  return { success: 'Student added.' };
}

export async function createClassroomAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await apiFetch('/classrooms', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        academicYearId: text(formData, 'academicYearId'),
        classLevelCode: text(formData, 'classLevelCode'),
        section: text(formData, 'section'),
        capacity: num(formData, 'capacity'),
        classTeacherId: text(formData, 'classTeacherId') ?? null,
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not create the classroom.') };
  }

  revalidatePath('/school/classrooms');
  return { success: 'Classroom created.' };
}

export async function createAcademicYearAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await apiFetch('/academic-years', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: {
        name: text(formData, 'name'),
        startDate: text(formData, 'startDate'),
        endDate: text(formData, 'endDate'),
        isCurrent: formData.get('isCurrent') === 'on',
      },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not create the academic year.') };
  }

  revalidatePath('/school/classrooms');
  return { success: 'Academic year created.' };
}
