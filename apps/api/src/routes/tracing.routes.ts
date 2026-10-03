import { Router } from 'express';
import { idParamSchema, tracingStudentSchema } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { body, params, query, validate } from '../middleware/validate.js';
import * as tracing from '../services/tracing.service.js';

/**
 * The tracing module, as a child meets it.
 *
 * Same permissions as the books' activities: reading needs `progress:read`,
 * and recording a video watched or a letter traced is `progress:record`, which
 * a parent has only for their own children.
 */
export const tracingRouter = Router();

/** Whether the module is on, and its categories with this child's progress. */
tracingRouter.get(
  '/',
  requirePermission('progress:read'),
  validate({ query: tracingStudentSchema }),
  asyncHandler(async (req, res) => {
    res.json(await tracing.homeFor(query<{ studentId: string }>(req).studentId));
  }),
);

tracingRouter.get(
  '/categories/:id',
  requirePermission('progress:read'),
  validate({ params: idParamSchema, query: tracingStudentSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await tracing.categoryFor(
        params<{ id: string }>(req).id,
        query<{ studentId: string }>(req).studentId,
      ),
    );
  }),
);

tracingRouter.post(
  '/items/:id/watched',
  requirePermission('progress:record'),
  validate({ params: idParamSchema, body: tracingStudentSchema }),
  asyncHandler(async (req, res) => {
    await tracing.recordWatched(
      params<{ id: string }>(req).id,
      body<{ studentId: string }>(req).studentId,
    );
    res.status(204).end();
  }),
);

tracingRouter.post(
  '/items/:id/traced',
  requirePermission('progress:record'),
  validate({ params: idParamSchema, body: tracingStudentSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await tracing.recordTraced(
        params<{ id: string }>(req).id,
        body<{ studentId: string }>(req).studentId,
      ),
    );
  }),
);
