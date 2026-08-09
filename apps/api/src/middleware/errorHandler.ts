import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, type ApiErrorBody } from '@poetree/shared';
import { ApiError, isApiError } from '../lib/apiError.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { PRISMA_FK_VIOLATION, PRISMA_NOT_FOUND, PRISMA_UNIQUE_VIOLATION } from '../db/prisma.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No route for ${req.method} ${req.path}`));
}

/** body-parser marks its own failures; `type` is the reliable discriminator. */
function isBodyParseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: string }).type === 'entity.parse.failed'
  );
}

function isPayloadTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: string }).type === 'entity.too.large'
  );
}

function translate(error: unknown): ApiError {
  if (isApiError(error)) return error;

  // A client sending broken JSON is a bad request, not a server fault. Left
  // untranslated it returns 500 and fills the error log with noise that looks
  // like an outage.
  if (isBodyParseError(error)) {
    return ApiError.badRequest('The request body is not valid JSON');
  }

  if (isPayloadTooLarge(error)) {
    return ApiError.badRequest('The request body is too large');
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case PRISMA_NOT_FOUND:
        // Also the cross-tenant case: the isolation extension narrowed the
        // where clause, so another school's row simply does not exist here.
        return ApiError.notFound();
      case PRISMA_UNIQUE_VIOLATION: {
        const target = (error.meta?.target as string[] | string | undefined) ?? undefined;
        return ApiError.conflict('That value is already in use', { fields: target });
      }
      case PRISMA_FK_VIOLATION:
        return ApiError.badRequest('A referenced record does not exist');
      default:
        break;
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return ApiError.badRequest('The request could not be processed');
  }

  return ApiError.internal();
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const apiError = translate(error);

  const logMeta = {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    status: apiError.status,
    code: apiError.code,
    userId: req.auth?.userId,
    schoolId: req.auth?.schoolId,
  };

  if (apiError.status >= 500) {
    logger.error(apiError.message, {
      ...logMeta,
      stack: error instanceof Error ? error.stack : undefined,
    });
  } else {
    logger.warn(apiError.message, logMeta);
  }

  const body: ApiErrorBody = {
    error: {
      code: apiError.code,
      // Never leak internals to the client; the request id is the bridge to the log.
      message:
        apiError.status >= 500 && env.isProduction ? 'Something went wrong' : apiError.message,
      requestId: req.requestId,
    },
  };

  if (apiError.details !== undefined && apiError.code !== ERROR_CODES.INTERNAL_ERROR) {
    body.error.details = apiError.details;
  }

  res.status(apiError.status).json(body);
}
