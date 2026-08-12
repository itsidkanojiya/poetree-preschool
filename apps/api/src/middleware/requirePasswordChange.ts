import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/apiError.js';

/**
 * Holds a user with a temporary password to the one thing they can do.
 *
 * A password an office read down the phone is not a session key: somebody
 * standing at the desk may have heard it, and it was typed into whatever
 * device happened to be nearest. So while `mustChangePassword` is set, this
 * refuses every route except the ones needed to change it — a client that
 * ignores the flag gets 403 on the screen it tried to render anyway.
 *
 * The flag rides in the access token, so this costs no database read. It is
 * safe there because a reset revokes every session: the holder has to sign in
 * again to have a token at all, and changing the password issues a fresh pair
 * without the claim.
 */
const ALLOWED = new Set(['/auth/me', '/auth/change-password', '/auth/logout']);

export function requirePasswordChange(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth?.mustChangePassword) {
    next();
    return;
  }

  // originalUrl carries the query string; the path alone is what identifies
  // the route.
  const path = req.originalUrl.split('?')[0]!.replace(/^\/api\/v1/, '');

  if (ALLOWED.has(path)) {
    next();
    return;
  }

  next(
    ApiError.passwordChangeRequired(
      'Choose a new password before carrying on. Your current one was set by somebody else.',
    ),
  );
}
