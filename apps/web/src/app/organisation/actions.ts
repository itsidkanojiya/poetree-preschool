'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { LoginResponse } from '@poetree/shared';
import { apiFetch, errorMessage } from '@/lib/api';
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions } from '@/lib/auth-cookies';

export interface SwitchState {
  error?: string;
}

/**
 * Choosing which branch to work in.
 *
 * The API hands back a whole new session, bound to that one school — so this
 * replaces the cookies rather than adding to them. From the next request on,
 * every screen in the school dashboard is that branch's, and the tenant filter
 * on the API side sees one school id like it does for anybody else.
 */
export async function switchBranchAction(
  _prev: SwitchState,
  formData: FormData,
): Promise<SwitchState> {
  const schoolId = String(formData.get('schoolId') ?? '');
  if (!schoolId) return { error: 'Choose a branch.' };

  try {
    const session = await apiFetch<LoginResponse>('/auth/switch-branch', {
      method: 'POST',
      redirectOnAuthFailure: false,
      body: { schoolId },
    });

    const store = await cookies();
    store.set(ACCESS_COOKIE, session.accessToken, cookieOptions);
    store.set(REFRESH_COOKIE, session.refreshToken, cookieOptions);
  } catch (error) {
    return { error: errorMessage(error, 'Could not open that branch.') };
  }

  redirect('/school');
}
