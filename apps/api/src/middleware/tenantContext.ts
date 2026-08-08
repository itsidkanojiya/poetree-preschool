import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';

/**
 * Binds the verified identity to the async execution context so the Prisma
 * extension can scope queries without every service threading `schoolId`
 * through its signature.
 *
 * Must run after `authenticate`; everything after it — including async
 * continuations — inherits the context.
 */
export function tenantContext(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.auth;

  if (!auth) {
    next(ApiError.unauthenticated());
    return;
  }

  runWithRequestContext(
    {
      requestId: req.requestId,
      userId: auth.userId,
      role: auth.role,
      schoolId: auth.schoolId,
    },
    () => next(),
  );
}
