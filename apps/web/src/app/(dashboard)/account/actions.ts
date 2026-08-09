'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth-cookies';
import { apiFetch, errorMessage } from '@/lib/api';

export interface PasswordState {
  error?: string;
}

/**
 * Changing a password ends every session, including this one — the API revokes
 * all refresh tokens. So the browser's cookies are cleared and the user is sent
 * back to sign in with the new password, rather than left holding a token that
 * silently stops working on the next navigation.
 */
export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (newPassword !== confirmPassword) {
    return { error: 'The two new passwords do not match.' };
  }
  if (newPassword === currentPassword) {
    return { error: 'The new password must be different from the current one.' };
  }

  try {
    await apiFetch('/auth/change-password', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { currentPassword, newPassword },
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not change the password.') };
  }

  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);

  redirect('/login?reason=password-changed');
}
