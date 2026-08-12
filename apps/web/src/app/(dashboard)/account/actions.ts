'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
  homePathFor,
  readClaims,
} from '@/lib/auth-cookies';
import { apiFetch, errorMessage } from '@/lib/api';

export interface PasswordState {
  error?: string;
}

/**
 * Changing a password ends every session — the API revokes all refresh tokens
 * — and hands back a fresh pair for the session doing the changing. Storing
 * those keeps this browser signed in while every other one is turned out,
 * which is the point of changing it in the first place.
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

  let tokens: { accessToken: string; refreshToken: string };

  try {
    tokens = await apiFetch<{ accessToken: string; refreshToken: string }>(
      '/auth/change-password',
      {
        method: 'POST',
        redirectOnAuthFailure: false,
        body: { currentPassword, newPassword },
      },
    );
  } catch (error) {
    return { error: errorMessage(error, 'Could not change the password.') };
  }

  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions);
  store.set(REFRESH_COOKIE, tokens.refreshToken, cookieOptions);

  // The new token no longer carries mustChangePassword, so the middleware will
  // stop pinning them here.
  redirect(homePathFor(readClaims(tokens.accessToken)?.role));
}
