'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isApiErrorBody, type LoginResponse, type Role } from '@poetree/shared';
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions, homePathFor } from '@/lib/auth-cookies';
import { API_BASE_URL } from '@/lib/api';

export interface LoginState {
  error?: string;
  /**
   * The schools this login exists at.
   *
   * The API refuses to guess when the same email or phone is a person at two
   * schools. Until now the portal sent no code and had nowhere to type one, so
   * its message ("please include your school code") was a dead end.
   */
  schoolCodes?: string[];
}

const PORTAL_ROLES: Role[] = ['PUBLICATION_ADMIN', 'ORG_ADMIN', 'SCHOOL_ADMIN'];

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const schoolCode = String(formData.get('schoolCode') ?? '').trim();

  if (!identifier || !password) {
    return { error: 'Enter your email or phone and your password.' };
  }

  let data: LoginResponse;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password, ...(schoolCode ? { schoolCode } : {}) }),
      cache: 'no-store',
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      // SCHOOL_SUSPENDED arrives here when a school's plan is switched off — the
      // API refuses to issue tokens at all, so there is nothing to store.
      const message = isApiErrorBody(payload)
        ? payload.error.message
        : 'Sign-in failed. Please try again.';

      // The same login at two schools. Hand the codes back so the form can ask
      // which one, rather than telling them to include something they have no
      // field for.
      const codes =
        isApiErrorBody(payload) && response.status === 409
          ? (payload.error.details as { schoolCodes?: unknown })?.schoolCodes
          : undefined;

      return {
        error: message,
        ...(Array.isArray(codes) && codes.length > 0
          ? { schoolCodes: codes.map(String) }
          : {}),
      };
    }

    data = payload as LoginResponse;
  } catch {
    return { error: 'Cannot reach the server. Please try again in a moment.' };
  }

  if (!PORTAL_ROLES.includes(data.user.role)) {
    return { error: 'This account cannot sign in to the admin portal.' };
  }

  const store = await cookies();
  store.set(ACCESS_COOKIE, data.accessToken, cookieOptions);
  store.set(REFRESH_COOKIE, data.refreshToken, cookieOptions);

  redirect(homePathFor(data.user.role, data.user.schoolId));
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (accessToken) {
    // Best effort: revoke server-side, but always clear the browser either way.
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);
  }

  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);

  redirect('/login');
}
