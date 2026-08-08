import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@poetree/shared';
import { ApiError } from '../lib/apiError.js';

/** Route-level RBAC. Roles are read from the verified token, never the request. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;

    if (!auth) {
      next(ApiError.unauthenticated());
      return;
    }

    if (!roles.includes(auth.role)) {
      next(ApiError.forbidden(`This action requires one of: ${roles.join(', ')}`));
      return;
    }

    next();
  };
}
