import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../lib/apiError.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function formatZodError(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Parses the request at the route boundary and stores the *typed* result on
 * `req.validated`. Controllers read only from there, so an unvalidated field
 * can never reach a service by accident.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.validated = {
        body: schemas.body ? schemas.body.parse(req.body) : undefined,
        query: schemas.query ? schemas.query.parse(req.query) : undefined,
        params: schemas.params ? schemas.params.parse(req.params) : undefined,
      };
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(ApiError.badRequest('Some fields need attention', formatZodError(error)));
        return;
      }
      next(error);
    }
  };
}

/** Typed accessors so controllers stay free of casts. */
export function body<T>(req: Request): T {
  return req.validated?.body as T;
}

export function query<T>(req: Request): T {
  return req.validated?.query as T;
}

export function params<T>(req: Request): T {
  return req.validated?.params as T;
}
