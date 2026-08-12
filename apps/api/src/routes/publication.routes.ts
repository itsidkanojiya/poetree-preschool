import { Router } from 'express';
import {
  assignSubscriptionSchema,
  createActivitySchema,
  createPlanSchema,
  createSchoolAdminSchema,
  createSchoolSchema,
  idParamSchema,
  listActivitiesQuerySchema,
  listPlansQuerySchema,
  listSchoolsQuerySchema,
  reactivateSchoolSchema,
  setSchoolLogoSchema,
  suspendSchoolSchema,
  updateActivitySchema,
  updatePlanSchema,
  updateSchoolSchema,
} from '@poetree/shared';
import type {
  AssignSubscriptionInput,
  CreateActivityInput,
  CreatePlanInput,
  CreateSchoolAdminInput,
  CreateSchoolInput,
  ListActivitiesQuery,
  ListPlansQuery,
  ListSchoolsQuery,
  ReactivateSchoolInput,
  SuspendSchoolInput,
  UpdateActivityInput,
  UpdatePlanInput,
  UpdateSchoolInput,
} from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireRole } from '../middleware/requireRole.js';
import { body, params, query, validate } from '../middleware/validate.js';
import { prismaUnscoped } from '../db/prisma.js';
import * as schoolService from '../services/school.service.js';
import * as planService from '../services/plan.service.js';
import * as catalogue from '../services/catalogue.service.js';
import * as usage from '../services/usage.service.js';
import * as classroomService from '../services/classroom.service.js';

/**
 * Super Admin surface. Everything below reaches across schools, which is why it
 * is gated once here and uses `prismaUnscoped` throughout the service layer.
 */
export const publicationRouter = Router();

publicationRouter.use(requireRole('PUBLICATION_ADMIN'));

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

publicationRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [total, active, trial, suspended, expired, students, teachers] = await Promise.all([
      prismaUnscoped.school.count(),
      prismaUnscoped.school.count({ where: { status: 'ACTIVE' } }),
      prismaUnscoped.school.count({ where: { status: 'TRIAL' } }),
      prismaUnscoped.school.count({ where: { status: 'SUSPENDED' } }),
      prismaUnscoped.school.count({ where: { status: 'EXPIRED' } }),
      prismaUnscoped.student.count(),
      prismaUnscoped.teacherProfile.count(),
    ]);

    const expiringSoon = await prismaUnscoped.schoolSubscription.count({
      where: {
        isCurrent: true,
        status: 'ACTIVE',
        expiresAt: { gt: new Date(), lt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      },
    });

    res.json({
      schools: { total, active, trial, suspended, expired, expiringSoon },
      students,
      teachers,
    });
  }),
);

/* -------------------------------------------------------------------------- */
/* Schools                                                                    */
/* -------------------------------------------------------------------------- */

publicationRouter.get(
  '/schools',
  validate({ query: listSchoolsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await schoolService.listSchools(query<ListSchoolsQuery>(req)));
  }),
);

publicationRouter.post(
  '/schools',
  validate({ body: createSchoolSchema }),
  asyncHandler(async (req, res) => {
    const school = await schoolService.createSchool(
      body<CreateSchoolInput>(req),
      req.auth!.userId,
    );
    res.status(201).json(school);
  }),
);

publicationRouter.get(
  '/schools/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await schoolService.getSchool(params<{ id: string }>(req).id));
  }),
);

publicationRouter.patch(
  '/schools/:id',
  validate({ params: idParamSchema, body: updateSchoolSchema }),
  asyncHandler(async (req, res) => {
    const updated = await schoolService.updateSchool(
      params<{ id: string }>(req).id,
      body<UpdateSchoolInput>(req),
      req.auth!.userId,
    );
    res.json(updated);
  }),
);

publicationRouter.post(
  '/schools/:id/admins',
  validate({ params: idParamSchema, body: createSchoolAdminSchema }),
  asyncHandler(async (req, res) => {
    const admin = await schoolService.createSchoolAdmin(
      params<{ id: string }>(req).id,
      body<CreateSchoolAdminInput>(req),
      req.auth!.userId,
    );
    res.status(201).json(admin);
  }),
);

/* -------------------------------------------------------------------------- */
/* Plan control                                                               */
/* -------------------------------------------------------------------------- */

publicationRouter.patch(
  '/schools/:id/subscription',
  validate({ params: idParamSchema, body: assignSubscriptionSchema }),
  asyncHandler(async (req, res) => {
    const result = await schoolService.assignSubscription(
      params<{ id: string }>(req).id,
      body<AssignSubscriptionInput>(req),
      req.auth!.userId,
    );
    res.json(result);
  }),
);

/** Read before you pull the switch — powers the confirmation dialog. */
publicationRouter.get(
  '/schools/:id/suspension-impact',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await schoolService.getSuspensionImpact(params<{ id: string }>(req).id));
  }),
);

publicationRouter.post(
  '/schools/:id/suspend',
  validate({ params: idParamSchema, body: suspendSchoolSchema }),
  asyncHandler(async (req, res) => {
    const result = await schoolService.suspendSchool(
      params<{ id: string }>(req).id,
      body<SuspendSchoolInput>(req),
      req.auth!.userId,
      req.ip ?? null,
    );
    res.json(result);
  }),
);

publicationRouter.post(
  '/schools/:id/reactivate',
  validate({ params: idParamSchema, body: reactivateSchoolSchema }),
  asyncHandler(async (req, res) => {
    const result = await schoolService.reactivateSchool(
      params<{ id: string }>(req).id,
      body<ReactivateSchoolInput>(req),
      req.auth!.userId,
      req.ip ?? null,
    );
    res.json(result);
  }),
);

/* -------------------------------------------------------------------------- */
/* Subscription plans                                                         */
/* -------------------------------------------------------------------------- */

publicationRouter.get(
  '/plans',
  validate({ query: listPlansQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await planService.listPlans(query<ListPlansQuery>(req)));
  }),
);

publicationRouter.post(
  '/plans',
  validate({ body: createPlanSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await planService.createPlan(body<CreatePlanInput>(req)));
  }),
);

publicationRouter.get(
  '/plans/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await planService.getPlan(params<{ id: string }>(req).id));
  }),
);

publicationRouter.patch(
  '/plans/:id',
  validate({ params: idParamSchema, body: updatePlanSchema }),
  asyncHandler(async (req, res) => {
    res.json(await planService.updatePlan(params<{ id: string }>(req).id, body<UpdatePlanInput>(req)));
  }),
);

/**
 * Whether any of this is being opened.
 *
 * The overview says how much has been sold; this says how much is used, which
 * is a different question and the one that predicts a renewal.
 */
publicationRouter.get(
  '/usage',
  asyncHandler(async (req, res) => {
    const days = Number(req.query.days);
    res.json(await usage.usageReport(Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30));
  }),
);

/**
 * Which uploaded file is this school's logo.
 *
 * Two steps, like every other attachment: POST /files owns the bytes, this
 * records the choice. Passing null takes the logo away again.
 */
publicationRouter.put(
  '/schools/:id/logo',
  validate({ params: idParamSchema, body: setSchoolLogoSchema }),
  asyncHandler(async (req, res) => {
    const { fileId } = body<{ fileId: string | null }>(req);
    res.json(
      await schoolService.setSchoolLogo(params<{ id: string }>(req).id, fileId, req.auth!.userId),
    );
  }),
);

/* -------------------------------------------------------------------------- */
/* Learning activities — the publisher's own product                          */
/* -------------------------------------------------------------------------- */

/**
 * The catalogue every school plays from.
 *
 * Authoring lives here and nowhere else. A school cannot write an activity, or
 * edit one, or retire one: sixty schools each amending the alphabet would make
 * "80% on letter recognition" mean sixty different things.
 */
publicationRouter.get(
  '/activities',
  validate({ query: listActivitiesQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await catalogue.listActivities(query<ListActivitiesQuery>(req)));
  }),
);

/**
 * Class levels, for the pickers.
 *
 * The school-admin tree has its own copy of this route, but a publisher is not
 * a school admin — without this the level picker on the authoring screen was
 * silently empty and every activity would have been written for "every level".
 */
publicationRouter.get(
  '/class-levels',
  asyncHandler(async (_req, res) => {
    res.json(await classroomService.listClassLevels());
  }),
);

/** The skills an activity is filed under, for the pickers. */
publicationRouter.get(
  '/skills',
  asyncHandler(async (_req, res) => {
    res.json(await catalogue.listSkills());
  }),
);

publicationRouter.get(
  '/activities/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await catalogue.getActivity(params<{ id: string }>(req).id));
  }),
);

publicationRouter.post(
  '/activities',
  validate({ body: createActivitySchema }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await catalogue.createActivity(body<CreateActivityInput>(req), req.auth!.userId));
  }),
);

publicationRouter.patch(
  '/activities/:id',
  validate({ params: idParamSchema, body: updateActivitySchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await catalogue.updateActivity(
        params<{ id: string }>(req).id,
        body<UpdateActivityInput>(req),
        req.auth!.userId,
      ),
    );
  }),
);
