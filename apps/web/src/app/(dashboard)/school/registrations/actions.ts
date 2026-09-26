'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, errorMessage } from '@/lib/api';

export interface RegistrationState {
  error?: string;
  success?: string;
}

/**
 * The office deciding whether a family gets in.
 *
 * Both revalidate the roster as well as the queue: approving creates a parent,
 * and a Parents page still showing yesterday's list is how somebody approves
 * the same family twice.
 */
function refresh(): void {
  revalidatePath('/school/registrations');
  revalidatePath('/school/parents');
  // Approving can now create a child as well as a parent, so the roll is stale
  // too.
  revalidatePath('/school/students');
  revalidatePath('/school');
}

/**
 * Yes — and which child this is.
 *
 * An empty `studentId` means the office is saying the school does not have this
 * child yet, so the API creates the record and issues the admission number.
 */
export async function approveRegistrationAction(
  registrationId: string,
  _prev: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const studentId = String(formData.get('studentId') ?? '').trim();
  const admissionNo = String(formData.get('admissionNo') ?? '').trim();
  const classroomId = String(formData.get('classroomId') ?? '').trim();
  const gender = String(formData.get('gender') ?? '').trim();

  try {
    await apiFetch(`/registrations/${registrationId}/approve`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: studentId
        ? { mode: 'LINK', studentId }
        : {
            mode: 'CREATE',
            gender,
            // Absent rather than empty: the API issues one from the school's
            // own series, and an empty string would fail validation instead.
            ...(admissionNo ? { admissionNo } : {}),
            ...(classroomId ? { classroomId } : {}),
          },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not approve this.') };
  }

  refresh();
  return { success: 'Approved. The family can sign in now.' };
}

export async function rejectRegistrationAction(
  registrationId: string,
  _prev: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const reason = String(formData.get('reason') ?? '').trim();

  try {
    await apiFetch(`/registrations/${registrationId}/reject`, {
      method: 'POST',
      redirectOnAuthFailure: false,
      // Optional on purpose: a rejection is usually a phone call and a tap, and
      // demanding a sentence would get "x" typed into it.
      body: { reason: reason === '' ? undefined : reason },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not turn this down.') };
  }

  refresh();
  return { success: 'Turned down. The family is told at their next sign-in.' };
}
