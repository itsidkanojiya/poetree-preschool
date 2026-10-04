import { Router } from 'express';
import { gamesStudentSchema, recordGameSessionSchema } from '@poetree/shared';
import type { RecordGameSessionInput } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { body, query, validate } from '../middleware/validate.js';
import * as games from '../services/games.service.js';

/**
 * The learning games, as a child meets them. Same permissions as the books'
 * activities: reading is `progress:read`; a round played is recorded with
 * `progress:record`, which a parent has only for their own children.
 */
export const gamesRouter = Router();

/** Whether games are on, which ones, and this child's progress in each. */
gamesRouter.get(
  '/',
  requirePermission('progress:read'),
  validate({ query: gamesStudentSchema }),
  asyncHandler(async (req, res) => {
    res.json(await games.homeFor(query<{ studentId: string }>(req).studentId));
  }),
);

gamesRouter.post(
  '/sessions',
  requirePermission('progress:record'),
  validate({ body: recordGameSessionSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await games.recordSession(body<RecordGameSessionInput>(req)));
  }),
);
