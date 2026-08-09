import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { roleHasPermission, type Permission } from '@poetree/shared';
import { ApiError } from '../lib/apiError.js';

/**
 * Role-level authorisation. The finer half of the pair: a teacher may hold
 * `homework:manage` and still not touch a classroom they are not assigned to —
 * that is enforced separately by the row-scope helpers in `scope.service.ts`.
 *
 * Both are required. Neither is sufficient alone.
 */
export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;

    if (!auth) {
      next(ApiError.unauthenticated());
      return;
    }

    const missing = permissions.filter((permission) => !roleHasPermission(auth.role, permission));

    if (missing.length > 0) {
      next(ApiError.forbidden(`This action requires: ${missing.join(', ')}`));
      return;
    }

    next();
  };
}
