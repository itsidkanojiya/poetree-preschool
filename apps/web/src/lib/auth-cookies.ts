import type { Role } from '@poetree/shared';

/**
 * Tokens live in httpOnly cookies so no script in the page can read them.
 * This module is imported by both the Edge middleware and server components, so
 * it must stay free of Node-only APIs.
 */
export const ACCESS_COOKIE = 'poetree_at';
export const REFRESH_COOKIE = 'poetree_rt';

export interface AccessClaims {
  sub: string;
  role: Role;
  schoolId: string | null;
  exp: number;
  /** Set while the password was chosen by somebody else. */
  mustChangePassword?: boolean;
}

/**
 * Reads the claims without verifying the signature. That is safe here because
 * nothing is authorised on this basis — the API re-verifies every request. The
 * portal only uses it to decide which dashboard to show and when to refresh.
 */
export function readClaims(token: string | undefined): AccessClaims | null {
  if (!token) return null;

  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const normalised = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as AccessClaims;
  } catch {
    return null;
  }
}

/** True when the token is missing, unreadable, or about to lapse. */
export function needsRefresh(token: string | undefined, skewSeconds = 30): boolean {
  const claims = readClaims(token);
  if (!claims) return true;
  return claims.exp * 1000 - Date.now() < skewSeconds * 1000;
}

export function homePathFor(role: Role | undefined): string {
  switch (role) {
    case 'PUBLICATION_ADMIN':
      return '/publication';
    case 'SCHOOL_ADMIN':
      return '/school';
    case 'TEACHER':
      return '/teacher';
    default:
      return '/login';
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.COOKIE_SECURE === '1',
} as const;
