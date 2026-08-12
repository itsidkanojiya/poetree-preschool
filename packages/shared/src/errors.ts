/**
 * Every error the API returns uses one of these codes. Clients branch on the
 * code, never on the human-readable message.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  FORBIDDEN: 'FORBIDDEN',
  /** Signed in, but holding a password somebody else set. Change it first. */
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  /** The user's school has no active plan — every user of that school is locked out. */
  SCHOOL_SUSPENDED: 'SCHOOL_SUSPENDED',
  /** Role is valid but has no portal login surface in this phase (TEACHER / PARENT). */
  PORTAL_ACCESS_DENIED: 'PORTAL_ACCESS_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PLAN_LIMIT_EXCEEDED: 'PLAN_LIMIT_EXCEEDED',
  RATE_LIMITED: 'RATE_LIMITED',
  /** A tenant-scoped query ran without request context. Always a server bug — fail closed. */
  TENANT_CONTEXT_MISSING: 'TENANT_CONTEXT_MISSING',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const err = (value as { error?: unknown }).error;
  if (typeof err !== 'object' || err === null) return false;
  return typeof (err as { code?: unknown }).code === 'string';
}
