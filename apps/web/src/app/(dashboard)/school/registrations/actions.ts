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
  revalidatePath('/school');
}

export async function approveRegistrationAction(registrationId: string): Promise<void> {
  await apiFetch(`/registrations/${registrationId}/approve`, { method: 'POST' });
  refresh();
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
