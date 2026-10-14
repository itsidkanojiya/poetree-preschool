'use server';

import { revalidatePath } from 'next/cache';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api';

export interface GoogleDriveState {
  error?: string;
  success?: string;
}

/** The field that needs attention, rather than "Some fields need attention". */
function problem(error: unknown): string {
  if (error instanceof ApiRequestError && Array.isArray(error.details)) {
    const first = (error.details as Array<{ message?: unknown }>)[0];
    if (typeof first?.message === 'string') return first.message;
  }
  return errorMessage(error, 'Could not save the Google settings.');
}

/** Poetree's Google sign-in. A blank secret keeps the one already saved. */
export async function saveGoogleDriveAction(
  _prev: GoogleDriveState,
  formData: FormData,
): Promise<GoogleDriveState> {
  try {
    await apiFetch('/publication/google-drive', {
      method: 'PUT',
      redirectOnAuthFailure: false,
      body: {
        clientId: String(formData.get('clientId') ?? '').trim(),
        clientSecret: String(formData.get('clientSecret') ?? '').trim() || undefined,
        redirectUri: String(formData.get('redirectUri') ?? '').trim(),
      },
    });
  } catch (error) {
    return { error: problem(error) };
  }

  revalidatePath('/publication/google-drive');
  return { success: 'Saved. Schools can connect their own Google Drive from Gallery.' };
}

export async function clearGoogleDriveAction(): Promise<void> {
  await apiFetch('/publication/google-drive', { method: 'DELETE' });
  revalidatePath('/publication/google-drive');
}
