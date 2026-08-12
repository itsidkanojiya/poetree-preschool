import { ERROR_CODES, type ErrorCode } from '@poetree/shared';

/**
 * The only error type route handlers should throw. Anything else reaching the
 * error handler is treated as an unexpected fault and reported as
 * INTERNAL_ERROR with the details withheld from the client.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, ERROR_CODES.VALIDATION_ERROR, message, details);
  }

  static unauthenticated(message = 'Authentication required'): ApiError {
    return new ApiError(401, ERROR_CODES.UNAUTHENTICATED, message);
  }

  static invalidCredentials(message = 'Invalid email/phone or password'): ApiError {
    return new ApiError(401, ERROR_CODES.INVALID_CREDENTIALS, message);
  }

  static tokenExpired(message = 'Access token has expired'): ApiError {
    return new ApiError(401, ERROR_CODES.TOKEN_EXPIRED, message);
  }

  static invalidRefreshToken(message = 'Refresh token is invalid or has been used'): ApiError {
    return new ApiError(401, ERROR_CODES.INVALID_REFRESH_TOKEN, message);
  }

  static forbidden(message = 'You do not have access to this resource'): ApiError {
    return new ApiError(403, ERROR_CODES.FORBIDDEN, message);
  }

  /** Signed in, but the password was set by somebody else and must be changed. */
  static passwordChangeRequired(message: string): ApiError {
    return new ApiError(403, ERROR_CODES.PASSWORD_CHANGE_REQUIRED, message);
  }

  /** Every user of the school is locked out because its plan is not active. */
  static schoolSuspended(message: string, details?: unknown): ApiError {
    return new ApiError(403, ERROR_CODES.SCHOOL_SUSPENDED, message, details);
  }

  static portalAccessDenied(message = 'This account cannot sign in to the web portal'): ApiError {
    return new ApiError(403, ERROR_CODES.PORTAL_ACCESS_DENIED, message);
  }

  /**
   * Used for cross-tenant access too: a record belonging to another school is
   * reported as missing, never as forbidden, so existence cannot be probed.
   */
  static notFound(message = 'Not found'): ApiError {
    return new ApiError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, ERROR_CODES.CONFLICT, message, details);
  }

  static planLimitExceeded(message: string, details?: unknown): ApiError {
    return new ApiError(422, ERROR_CODES.PLAN_LIMIT_EXCEEDED, message, details);
  }

  static tenantContextMissing(message: string): ApiError {
    return new ApiError(500, ERROR_CODES.TENANT_CONTEXT_MISSING, message);
  }

  static internal(message = 'Something went wrong'): ApiError {
    return new ApiError(500, ERROR_CODES.INTERNAL_ERROR, message);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
