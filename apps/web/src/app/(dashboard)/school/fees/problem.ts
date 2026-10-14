import 'server-only';

import { ApiRequestError, errorMessage } from '@/lib/api';

/**
 * What went wrong, in the API's own words. A validation failure names the
 * field that needs attention rather than "Some fields need attention".
 */
export function problem(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError && Array.isArray(error.details)) {
    const first = (error.details as Array<{ message?: unknown }>)[0];
    if (typeof first?.message === 'string') return first.message;
  }
  return errorMessage(error, fallback);
}
