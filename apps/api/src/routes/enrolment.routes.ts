import { Router } from 'express';
import {
  idParamSchema,
  importStudentsSchema,
  listEnrolmentsQuerySchema,
  promoteStudentsSchema,
  transferSectionSchema,
  withdrawStudentSchema,
} from '@poetree/shared';
import type {
  ImportStudentsInput,
  ListEnrolmentsQuery,
  PromoteStudentsInput,
  TransferSectionInput,
  WithdrawStudentInput,
} from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { body, params, query, validate } from '../middleware/validate.js';
import * as enrolment from '../services/enrolment.service.js';
import { importStudents } from '../services/studentImport.service.js';

/** Enrolment lifecycle: history, promotion, transfer, withdrawal and import. */
export const enrolmentRouter = Router();

enrolmentRouter.get(
  '/',
  requirePermission('student:read'),
  validate({ query: listEnrolmentsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await enrolment.listEnrolments(query<ListEnrolmentsQuery>(req)));
  }),
);

enrolmentRouter.get(
  '/students/:id/history',
  requirePermission('student:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await enrolment.studentEnrolmentHistory(params<{ id: string }>(req).id));
  }),
);

enrolmentRouter.post(
  '/promote',
  requirePermission('enrolment:manage'),
  validate({ body: promoteStudentsSchema }),
  asyncHandler(async (req, res) => {
    const result = await enrolment.promoteStudents(
      body<PromoteStudentsInput>(req),
      req.auth!.userId,
    );
    res.json(result);
  }),
);

enrolmentRouter.post(
  '/students/:id/withdraw',
  requirePermission('enrolment:manage'),
  validate({ params: idParamSchema, body: withdrawStudentSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await enrolment.withdrawStudent(
        params<{ id: string }>(req).id,
        body<WithdrawStudentInput>(req),
        req.auth!.userId,
      ),
    );
  }),
);

enrolmentRouter.post(
  '/students/:id/transfer',
  requirePermission('enrolment:manage'),
  validate({ params: idParamSchema, body: transferSectionSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await enrolment.transferSection(
        params<{ id: string }>(req).id,
        body<TransferSectionInput>(req),
        req.auth!.userId,
      ),
    );
  }),
);

/**
 * Same endpoint validates and applies. `commit: false` returns the per-row
 * report and touches nothing, which is what the upload wizard calls first.
 */
enrolmentRouter.post(
  '/import',
  requirePermission('student:import'),
  validate({ body: importStudentsSchema }),
  asyncHandler(async (req, res) => {
    const report = await importStudents(body<ImportStudentsInput>(req), req.auth!.userId);
    res.status(report.applied ? 201 : 200).json(report);
  }),
);

enrolmentRouter.get(
  '/next-admission-number',
  requirePermission('student:create'),
  asyncHandler(async (req, res) => {
    res.json({ admissionNo: await enrolment.issueAdmissionNumber(req.auth!.schoolId!) });
  }),
);
