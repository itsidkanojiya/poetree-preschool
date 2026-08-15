import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import * as books from '../services/book.service.js';

/**
 * The catalogue as a school sees it.
 *
 * The publisher's own screens live under /publication and are gated to the
 * Super Admin. This is the other side of the same content: what a teacher and a
 * family may open, narrowed to the books this school actually bought.
 */
export const catalogueRouter = Router();

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
