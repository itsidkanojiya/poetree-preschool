import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/apiError.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { currentSessionOf, isSingleDevice } from '../services/auth.service.js';

/**
 * Verifies the bearer token and pins `role` and `schoolId` onto the request.
 *
 * Everything downstream reads tenancy from here. Nothing downstream may read it
 * from the body, query string or URL.
 *
 * For a parent or teacher it also checks the token belongs to the account's
 * current sign-in. They are held to one device: signing in on a new phone ends
 * the old one's session, and without this check the old phone's access token
 * would keep working for hours until it expired.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');

  if (!header?.startsWith('Bearer ')) {
    next(ApiError.unauthenticated('Missing bearer token'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(ApiError.unauthenticated('Missing bearer token'));
    return;
  }

  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    next(error);
    return;
  }

  req.auth = {
    userId: payload.sub,
    role: payload.role,
    schoolId: payload.schoolId,
    mustChangePassword: payload.mustChangePassword === true,
  };

  if (!isSingleDevice(payload.role)) {
    next();
    return;
  }

  currentSessionOf(payload.sub)
    .then((current) => {
      // No current session on record: the account has not signed in since
      // sessions were tracked, and its existing tokens carry on until it does.
      if (current !== null && payload.sid !== current) {
        next(ApiError.sessionReplaced());
        return;
      }
      next();
    })
    .catch(next);
}
