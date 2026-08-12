import { Router, type Request } from 'express';
import {
  createClassroomPostSchema,
  createHomeworkSchema,
  createNoticeSchema,
  idParamSchema,
  listHomeworkQuerySchema,
  listNoticesQuerySchema,
  reviewSubmissionSchema,
  submitHomeworkSchema,
  updateHomeworkSchema,
} from '@poetree/shared';
import type {
  CreateClassroomPostInput,
  CreateHomeworkInput,
  CreateNoticeInput,
  ListHomeworkQuery,
  ListNoticesQuery,
  ReviewSubmissionInput,
  SubmitHomeworkInput,
  UpdateHomeworkInput,
} from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { body, params, query, validate } from '../middleware/validate.js';
import { ApiError } from '../lib/apiError.js';
import * as homework from '../services/homework.service.js';
import * as notices from '../services/notice.service.js';

const id = (req: Request) => params<{ id: string }>(req).id;

/* -------------------------------------------------------------------------- */
/* Homework                                                                   */
/* -------------------------------------------------------------------------- */

export const homeworkRouter = Router();

homeworkRouter.get(
  '/',
  requirePermission('homework:read'),
  validate({ query: listHomeworkQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await homework.listHomework(query<ListHomeworkQuery>(req)));
  }),
);

homeworkRouter.post(
  '/',
  requirePermission('homework:manage'),
  validate({ body: createHomeworkSchema }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await homework.createHomework(body<CreateHomeworkInput>(req), req.auth!.userId));
  }),
);

homeworkRouter.get(
  '/:id',
  requirePermission('homework:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await homework.getHomework(id(req)));
  }),
);

homeworkRouter.patch(
  '/:id',
  requirePermission('homework:manage'),
  validate({ params: idParamSchema, body: updateHomeworkSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await homework.updateHomework(id(req), body<UpdateHomeworkInput>(req), req.auth!.userId),
    );
  }),
);

homeworkRouter.delete(
  '/:id',
  requirePermission('homework:manage'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await homework.deleteHomework(id(req), req.auth!.userId);
    res.status(204).end();
  }),
);

homeworkRouter.post(
  '/:id/publish',
  requirePermission('homework:manage'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await homework.publishHomework(id(req), req.auth!.userId));
  }),
);

/**
 * A parent marking their own child's homework done.
 *
 * homework:read, not homework:review — reviewing is the teacher's judgement on
 * whether it counts, and a parent claiming COMPLETED for their own child would
 * turn every completion figure into a self-report. The service sets SUBMITTED.
 */
homeworkRouter.post(
  '/:id/submit',
  requirePermission('homework:read'),
  validate({ params: idParamSchema, body: submitHomeworkSchema }),
  asyncHandler(async (req, res) => {
    await homework.submitHomework(id(req), body<SubmitHomeworkInput>(req), req.auth!.userId);
    res.status(204).send();
  }),
);

homeworkRouter.get(
  '/:id/submissions',
  requirePermission('homework:review'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await homework.listSubmissions(id(req)));
  }),
);

homeworkRouter.patch(
  '/submissions/:id',
  requirePermission('homework:review'),
  validate({ params: idParamSchema, body: reviewSubmissionSchema }),
  asyncHandler(async (req, res) => {
    await homework.reviewSubmission(id(req), body<ReviewSubmissionInput>(req), req.auth!.userId);
    res.status(204).send();
  }),
);

/* -------------------------------------------------------------------------- */
/* Class stream                                                               */
/* -------------------------------------------------------------------------- */

export const classroomPostRouter = Router();

// homework:read rather than classroom_post:manage — parents read the stream,
// only teachers write to it.
classroomPostRouter.get(
  '/',
  requirePermission('homework:read'),
  asyncHandler(async (req, res) => {
    const classroomId = typeof req.query.classroomId === 'string' ? req.query.classroomId : null;
    if (!classroomId) throw ApiError.badRequest('classroomId is required');
    res.json(await homework.listClassroomPosts(classroomId));
  }),
);

classroomPostRouter.post(
  '/',
  requirePermission('classroom_post:manage'),
  validate({ body: createClassroomPostSchema }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await homework.createClassroomPost(body<CreateClassroomPostInput>(req), req.auth!.userId),
      );
  }),
);

/* -------------------------------------------------------------------------- */
/* Notices                                                                    */
/* -------------------------------------------------------------------------- */

export const noticeRouter = Router();

noticeRouter.get(
  '/',
  requirePermission('notice:read'),
  validate({ query: listNoticesQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await notices.listNotices(query<ListNoticesQuery>(req)));
  }),
);

noticeRouter.post(
  '/',
  requirePermission('notice:manage'),
  validate({ body: createNoticeSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await notices.createNotice(body<CreateNoticeInput>(req), req.auth!.userId));
  }),
);

noticeRouter.post(
  '/:id/read',
  requirePermission('notice:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await notices.markNoticeRead(id(req));
    res.status(204).send();
  }),
);

noticeRouter.get(
  '/:id/receipts',
  requirePermission('notice:manage'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await notices.noticeReadReceipts(id(req)));
  }),
);
