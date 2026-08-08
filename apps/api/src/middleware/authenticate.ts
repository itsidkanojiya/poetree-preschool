import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/apiError.js';
import { verifyAccessToken } from '../lib/tokens.js';

/**
 * Verifies the bearer token and pins `role` and `schoolId` onto the request.
 *
 * Everything downstream reads tenancy from here. Nothing downstream may read it
 * from the body, query string or URL.
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

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.sub,
      role: payload.role,
      schoolId: payload.schoolId,
    };
    next();
  } catch (error) {
    next(error);
  }
}
