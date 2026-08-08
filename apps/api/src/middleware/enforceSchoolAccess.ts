import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/apiError.js';
import { assertSchoolUsable } from '../services/schoolAccess.service.js';

/**
 * The per-request half of plan control: if the caller's school has no active
 * plan, nothing else in the chain runs.
 *
 * PUBLICATION_ADMIN is exempt — the Super Admin must still be able to
 * administer, and reactivate, a school they have just switched off.
 */
export async function enforceSchoolAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.auth;

  if (!auth) {
    next(ApiError.unauthenticated());
    return;
  }

  if (auth.role === 'PUBLICATION_ADMIN') {
    next();
    return;
  }

  if (!auth.schoolId) {
    // Only a Super Admin may be school-less; any other role without one is a
    // malformed token.
    next(ApiError.unauthenticated('Your session is not bound to a school'));
    return;
  }

  try {
    await assertSchoolUsable(auth.schoolId);
    next();
  } catch (error) {
    next(error);
  }
}
