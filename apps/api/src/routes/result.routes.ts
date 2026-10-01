import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  addReportAreaPresetSchema,
  createReportAreaSchema,
  createTermSchema,
  idParamSchema,
  idSchema,
  publishReportCardsSchema,
  reportAreasQuerySchema,
  saveGradeScaleSchema,
  saveReportCardSchema,
  updateReportAreaSchema,
  updateTermSchema,
  type AddReportAreaPresetInput,
  type CreateReportAreaInput,
  type CreateTermInput,
  type PublishReportCardsInput,
  type SaveGradeScaleInput,
  type SaveReportCardInput,
  type UpdateReportAreaInput,
  type UpdateTermInput,
} from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { body, params, query, validate } from '../middleware/validate.js';
import * as results from '../services/result.service.js';

/**
 * Term report cards. The office configures and publishes; class teachers
 * fill in their own classes (checked row by row in the service); families read
 * their own children's published cards.
 */
export const resultRouter = Router();

const configure = requirePermission('result:configure');
const enter = requirePermission('result:enter');
const publish = requirePermission('result:publish');

const classTermParams = z.object({ classroomId: idSchema, termId: idSchema });
type ClassTerm = { classroomId: string; termId: string };

function sendPdf(res: Response, file: { buffer: Buffer; filename: string }): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
  res.send(file.buffer);
}

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

/** Read by teachers too: the grid needs the scale to offer. */
resultRouter.get(
  '/scale',
  enter,
  asyncHandler(async (_req, res) => {
    res.json(await results.getScale());
  }),
);

resultRouter.put(
  '/scale',
  configure,
  validate({ body: saveGradeScaleSchema }),
  asyncHandler(async (req, res) => {
    res.json(await results.saveScale(body<SaveGradeScaleInput>(req)));
  }),
);

resultRouter.get(
  '/terms',
  requirePermission('result:read'),
  validate({ query: z.object({ academicYearId: idSchema.optional() }) }),
  asyncHandler(async (req, res) => {
    res.json(await results.listTerms(query<{ academicYearId?: string }>(req).academicYearId));
  }),
);

resultRouter.post(
  '/terms',
  configure,
  validate({ body: createTermSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await results.createTerm(body<CreateTermInput>(req)));
  }),
);

resultRouter.patch(
  '/terms/:id',
  configure,
  validate({ params: idParamSchema, body: updateTermSchema }),
  asyncHandler(async (req, res) => {
    res.json(await results.updateTerm(params<{ id: string }>(req).id, body<UpdateTermInput>(req)));
  }),
);

resultRouter.get(
  '/areas',
  enter,
  validate({ query: reportAreasQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await results.listAreas(query<{ classLevelId?: string }>(req).classLevelId));
  }),
);

resultRouter.post(
  '/areas',
  configure,
  validate({ body: createReportAreaSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await results.createArea(body<CreateReportAreaInput>(req)));
  }),
);

resultRouter.post(
  '/areas/preset',
  configure,
  validate({ body: addReportAreaPresetSchema }),
  asyncHandler(async (req, res) => {
    res.json(await results.addAreaPreset(body<AddReportAreaPresetInput>(req)));
  }),
);

resultRouter.patch(
  '/areas/:id',
  configure,
  validate({ params: idParamSchema, body: updateReportAreaSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await results.updateArea(params<{ id: string }>(req).id, body<UpdateReportAreaInput>(req)),
    );
  }),
);

/* -------------------------------------------------------------------------- */
/* Filling in and publishing                                                  */
/* -------------------------------------------------------------------------- */

/** Every class's progress through a term, for the office. */
resultRouter.get(
  '/terms/:id/overview',
  publish,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await results.overview(params<{ id: string }>(req).id));
  }),
);

resultRouter.get(
  '/classrooms/:classroomId/terms/:termId',
  enter,
  validate({ params: classTermParams }),
  asyncHandler(async (req, res) => {
    const { classroomId, termId } = params<ClassTerm>(req);
    res.json(await results.reportGrid(classroomId, termId));
  }),
);

resultRouter.put(
  '/report-cards',
  enter,
  validate({ body: saveReportCardSchema }),
  asyncHandler(async (req, res) => {
    res.json(await results.saveReportCard(body<SaveReportCardInput>(req), req.auth!.userId));
  }),
);

/** The teacher hands the class to the office. */
resultRouter.post(
  '/classrooms/:classroomId/terms/:termId/submit',
  enter,
  validate({ params: classTermParams }),
  asyncHandler(async (req, res) => {
    const { classroomId, termId } = params<ClassTerm>(req);
    res.json(await results.submitClass(classroomId, termId));
  }),
);

/** The office hands it back. */
resultRouter.post(
  '/classrooms/:classroomId/terms/:termId/return',
  publish,
  validate({ params: classTermParams }),
  asyncHandler(async (req, res) => {
    const { classroomId, termId } = params<ClassTerm>(req);
    res.json(await results.returnClass(classroomId, termId));
  }),
);

resultRouter.post(
  '/classrooms/:classroomId/terms/:termId/publish',
  publish,
  validate({ params: classTermParams, body: publishReportCardsSchema }),
  asyncHandler(async (req, res) => {
    const { classroomId, termId } = params<ClassTerm>(req);
    const { studentIds } = body<PublishReportCardsInput>(req);
    res.json(await results.publish(classroomId, termId, studentIds, req.auth!.userId));
  }),
);

resultRouter.post(
  '/report-cards/:id/unpublish',
  publish,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await results.unpublish(params<{ id: string }>(req).id, req.auth!.userId);
    res.status(204).end();
  }),
);

/* -------------------------------------------------------------------------- */
/* Printing                                                                   */
/* -------------------------------------------------------------------------- */

/** One child's card: the office, the class's teacher, or the family once published. */
resultRouter.get(
  '/report-cards/:id/pdf',
  requirePermission('result:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) =>
    sendPdf(res, await results.reportCardPdf(params<{ id: string }>(req).id)),
  ),
);

/** The whole class, one child per page. */
resultRouter.get(
  '/classrooms/:classroomId/terms/:termId/pdf',
  enter,
  validate({ params: classTermParams }),
  asyncHandler(async (req, res) => {
    const { classroomId, termId } = params<ClassTerm>(req);
    sendPdf(res, await results.classPdf(classroomId, termId));
  }),
);
