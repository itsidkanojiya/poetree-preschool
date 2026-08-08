import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Correlates a client report with a log line and an error response. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && incoming.length <= 64 ? incoming : crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
}
