import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ERROR_CODES, isApiErrorBody, type AuthenticatedUser, type ErrorCode } from '@poetree/shared';
import { ACCESS_COOKIE } from './auth-cookies';

export const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /**
   * Pages want an expired session to bounce to /login. Server actions want the
   * message back so they can render it beside the form, so they pass `false`.
   */
  redirectOnAuthFailure?: boolean;
}

function buildUrl(path: string, query?: FetchOptions['query']): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const code = isApiErrorBody(data) ? data.error.code : ERROR_CODES.INTERNAL_ERROR;
    const message = isApiErrorBody(data)
      ? data.error.message
      : `The server returned ${response.status}`;
    const details = isApiErrorBody(data) ? data.error.details : undefined;

    if (options.redirectOnAuthFailure !== false) {
      // A school suspended mid-session lands here on the very next navigation.
      if (code === ERROR_CODES.SCHOOL_SUSPENDED) redirect('/blocked');
      if (response.status === 401) redirect('/login?reason=expired');
    }

    throw new ApiRequestError(response.status, code, message, details);
  }

  return data as T;
}

/** Deduplicated per request — several components ask "who am I?" while rendering. */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser> => {
  const { user } = await apiFetch<{ user: AuthenticatedUser }>('/auth/me');
  return user;
});

export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}
