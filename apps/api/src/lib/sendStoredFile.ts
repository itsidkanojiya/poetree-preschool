import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { storage } from './storage.js';

/**
 * The header a caller sets to say it cannot honour an X-Accel-Redirect.
 *
 * Nginx serves the bytes for anything the API hands off, which is why the
 * response body is empty on the way out. That is invisible to a browser or a
 * phone — the request passes through Nginx and arrives full. It is not
 * invisible to the portal, whose server fetches this API on loopback and never
 * touches Nginx at all: it received 200, the right content type, and nothing.
 * Every picture in the portal — book covers, children's faces — was an empty
 * frame, and had been since X-Accel was switched on.
 *
 * Granting nothing is the point. This chooses who copies the bytes, not who is
 * allowed to have them; the route has already decided that. So it is safe even
 * when set by a caller we did not write.
 */
export const NO_ACCEL_HEADER = 'x-no-accel';

interface StoredFile {
  storageKey: string;
}

/**
 * Sends a stored file's bytes, by whichever route this deployment and this
 * caller can actually use.
 *
 * Headers — content type, disposition, caching — are the caller's business and
 * must already be set: what is right for a child's photograph is not what is
 * right for a piece of clip art.
 */
export function sendStoredFile(
  req: Request,
  res: Response,
  file: StoredFile,
  context: Record<string, unknown> = {},
): void {
  if (env.USE_X_ACCEL_REDIRECT && !req.get(NO_ACCEL_HEADER)) {
    res.setHeader('X-Accel-Redirect', `/_protected_files/${file.storageKey}`);
    res.end();
    return;
  }

  // Development, a deployment with no Nginx in front, and any caller that
  // asked for the bytes themselves.
  res.sendFile(storage.locate(file.storageKey), (error) => {
    if (error) {
      logger.error('Failed to serve a stored file', { ...context, error: error.message });
      if (!res.headersSent) res.status(404).end();
    }
  });
}
