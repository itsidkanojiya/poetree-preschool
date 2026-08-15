import { Router, type Request } from 'express';
import { z } from 'zod';
import { idParamSchema, idSchema } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { body, params, validate } from '../middleware/validate.js';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { storage } from '../lib/storage.js';
import * as books from '../services/book.service.js';

/**
 * The catalogue as a school sees it.
 *
 * The publisher's own screens live under /publication and are gated to the
 * Super Admin. This is the other side of the same content: what a teacher and a
 * family may open, narrowed to the books this school actually bought.
 */
export const catalogueRouter = Router();

const watchedBodySchema = z.object({ studentId: idSchema });

/**
 * The books this school has.
 *
 * Scoped to the caller's own school inside the service rather than taking one
 * as a parameter — "what can my class play" must not be answerable on behalf of
 * somebody else's school.
 */
catalogueRouter.get(
  '/books',
  requirePermission('progress:read'),
  asyncHandler(async (_req, res) => {
    res.json(await books.booksForMySchool());
  }),
);

/**
 * This child's shelf: the books their school has, and whether each is open yet.
 *
 * Scoped to the caller's school inside the service, and refused for a child
 * they may not read — a parent asking on behalf of somebody else's child gets
 * the same 404 they would anywhere else.
 */
catalogueRouter.get(
  '/children/:id/books',
  requirePermission('progress:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await books.booksForChild(params<{ id: string }>(req).id));
  }),
);

/**
 * The child reached the end of a book's animation.
 *
 * `progress:record` rather than `progress:read`: this unlocks content, so it is
 * the same permission as recording an attempt, and a parent may only do it for
 * their own children.
 */
catalogueRouter.post(
  '/books/:id/watched',
  requirePermission('progress:record'),
  validate({ params: idParamSchema, body: watchedBodySchema }),
  asyncHandler(async (req, res) => {
    const { studentId } = body<{ studentId: string }>(req);
    res.json(await books.recordAnimationWatched(params<{ id: string }>(req).id, studentId));
  }),
);

/**
 * A picture from the catalogue: the letter A, an apple, a cover.
 *
 * Any signed-in user may read one, and that is the point — the same artwork is
 * shown to every child at every school that bought the book, so there is
 * nothing tenant-specific to authorise.
 *
 * A separate handler from `/files/:id` on purpose. That route asks a row-level
 * question about a school's own uploads — whose child is in this photograph —
 * and the two models must not share a code path where one could be mistaken for
 * the other. Only publication-owned files are reachable here: a school's file
 * id gets a 404 however valid it is.
 */
catalogueRouter.get(
  '/assets/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req: Request, res) => {
    const fileId = params<{ id: string }>(req).id;

    const file = await prismaUnscoped.fileObject.findFirst({
      where: { id: fileId, schoolId: null, deletedAt: null },
      select: { storageKey: true, mimeType: true, originalName: true },
    });
    if (!file) throw ApiError.notFound('Not found');

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    // Long-lived and shareable: a piece of clip art never changes, and every
    // phone at every school fetches the same bytes.
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (env.USE_X_ACCEL_REDIRECT) {
      res.setHeader('X-Accel-Redirect', `/_protected_files/${file.storageKey}`);
      res.end();
      return;
    }

    res.sendFile(storage.locate(file.storageKey), (error) => {
      if (error) {
        logger.error('Failed to serve a catalogue asset', { fileId, error: error.message });
        if (!res.headersSent) res.status(404).end();
      }
    });
  }),
);
