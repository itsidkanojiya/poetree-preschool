import { Router, type Request } from 'express';
import { z } from 'zod';
import { idParamSchema, idSchema } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { body, params, validate } from '../middleware/validate.js';
import * as progress from '../services/progress.service.js';

export const progressRouter = Router();

const id = (req: Request) => params<{ id: string }>(req).id;

/** The catalogue of activities a child can be offered. */
progressRouter.get(
  '/activities',
  requirePermission('progress:read'),
  asyncHandler(async (req, res) => {
    const classLevelId =
      typeof req.query.classLevelId === 'string' ? req.query.classLevelId : undefined;
    const bookId = typeof req.query.bookId === 'string' ? req.query.bookId : undefined;
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    res.json(await progress.listActivities({ classLevelId, bookId, studentId }));
  }),
);

const attemptSchema = z.object({
  studentId: idSchema,
  activityId: idSchema,
  correctCount: z.number().int().min(0),
  totalCount: z.number().int().min(1).max(200),
  timeSpentSeconds: z.number().int().min(0).max(7200).optional(),
  resultJson: z.unknown().optional(),
});

/**
 * Recorded by the app when a child finishes an activity.
 *
 * Permission is progress:record rather than progress:read — a parent may look
 * at their child's progress, but the figures must come from activities actually
 * completed, not from anyone able to post a score.
 */
progressRouter.post(
  '/attempts',
  requirePermission('progress:record'),
  validate({ body: attemptSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await progress.recordAttempt(body<z.infer<typeof attemptSchema>>(req)));
  }),
);

progressRouter.get(
  '/students/:id',
  requirePermission('progress:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ skills: await progress.studentProgress(id(req)) });
  }),
);

progressRouter.get(
  '/classrooms/:id',
  requirePermission('progress:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ students: await progress.classroomProgress(id(req)) });
  }),
);
