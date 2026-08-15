import { Router } from 'express';
import {
  assignSubscriptionSchema,
  createActivitySchema,
  createBookSchema,
  createPlanSchema,
  createQuestionSchema,
  createStandardSchema,
  createSchoolAdminSchema,
  createSchoolSchema,
  idParamSchema,
  listActivitiesQuerySchema,
  listPlansQuerySchema,
  listSchoolsQuerySchema,
  reactivateSchoolSchema,
  setSchoolBooksSchema,
  setSchoolLogoSchema,
  suspendSchoolSchema,
  updateActivitySchema,
  updateBookSchema,
  updatePlanSchema,
  updateQuestionSchema,
  updateStandardSchema,
  updateSchoolSchema,
} from '@poetree/shared';
import type {
  AssignSubscriptionInput,
  CreateActivityInput,
  CreateBookInput,
  CreatePlanInput,
  CreateQuestionInput,
  CreateStandardInput,
  CreateSchoolAdminInput,
  CreateSchoolInput,
  ListActivitiesQuery,
  ListPlansQuery,
  ListSchoolsQuery,
  ReactivateSchoolInput,
  SuspendSchoolInput,
  SetSchoolBooksInput,
  UpdateActivityInput,
  UpdateBookInput,
  UpdatePlanInput,
  UpdateQuestionInput,
  UpdateStandardInput,
  UpdateSchoolInput,
} from '@poetree/shared';
import multer from 'multer';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../lib/apiError.js';
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, sniffMime, storage, typeFor } from '../lib/storage.js';
import { stripImageMetadata } from '../lib/exif.js';
import { requireRole } from '../middleware/requireRole.js';
import { body, params, query, validate } from '../middleware/validate.js';
import { prismaUnscoped } from '../db/prisma.js';
import * as schoolService from '../services/school.service.js';
import * as planService from '../services/plan.service.js';
import * as catalogue from '../services/catalogue.service.js';
import * as usage from '../services/usage.service.js';
import * as classroomService from '../services/classroom.service.js';
import * as standards from '../services/standard.service.js';
import * as books from '../services/book.service.js';
import * as questions from '../services/question.service.js';

/**
 * Super Admin surface. Everything below reaches across schools, which is why it
 * is gated once here and uses `prismaUnscoped` throughout the service layer.
 */
export const publicationRouter = Router();

publicationRouter.use(requireRole('PUBLICATION_ADMIN'));

/** Buffered in memory like every other upload; the cap is enforced per type. */
const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

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
/* Catalogue artwork                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Uploads a picture for the catalogue.
 *
 * Separate from POST /files, which stamps the caller's school onto every row
 * and would throw for a Super Admin who has no school at all. These are
 * publication-owned — schoolId NULL — because the same apple is shown to every
 * child at every school that bought the book.
 */
publicationRouter.post(
  '/assets',
  assetUpload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw ApiError.badRequest('No file was uploaded');

    // By content, never by the name or the Content-Type the client sent.
    const mime = sniffMime(file.buffer);
    const allowed = mime ? typeFor(mime) : undefined;
    if (!mime || !allowed) {
      throw ApiError.badRequest('That file type is not supported', {
        allowed: ALLOWED_TYPES.map((t) => t.mime),
      });
    }
    if (!mime.startsWith('image/')) {
      throw ApiError.badRequest('Catalogue artwork has to be a picture');
    }
    if (file.size > allowed.maxBytes) {
      throw ApiError.badRequest(
        `${mime} files may be at most ${Math.round(allowed.maxBytes / (1024 * 1024))} MB`,
      );
    }

    // Stripped like every other upload. Publisher artwork is unlikely to carry
    // a home address, but the rule is cheaper to keep than to reason about.
    const bytes = stripImageMetadata(file.buffer, mime);
    const stored = await storage.put({ schoolId: null, originalName: file.originalname, bytes });

    const record = await prismaUnscoped.fileObject.create({
      data: {
        schoolId: null,
        storageKey: stored.key,
        originalName: file.originalname.slice(0, 200),
        mimeType: mime,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksum,
        uploadedById: req.auth!.userId,
        visibility: 'PUBLIC',
      },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
    });

    res.status(201).json({ ...record, url: `/api/v1/catalogue/assets/${record.id}` });
  }),
);

/* -------------------------------------------------------------------------- */
/* Books — what Poetree actually sells                                        */
/* -------------------------------------------------------------------------- */

publicationRouter.get(
  '/books',
  asyncHandler(async (req, res) => {
    const classLevelId = typeof req.query.classLevelId === 'string' ? req.query.classLevelId : undefined;
    res.json(await books.listBooks(classLevelId));
  }),
);

publicationRouter.post(
  '/books',
  validate({ body: createBookSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await books.createBook(body<CreateBookInput>(req), req.auth!.userId));
  }),
);

publicationRouter.patch(
  '/books/:id',
  validate({ params: idParamSchema, body: updateBookSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await books.updateBook(
        params<{ id: string }>(req).id,
        body<UpdateBookInput>(req),
        req.auth!.userId,
      ),
    );
  }),
);

/** Which books this school bought. */
publicationRouter.get(
  '/schools/:id/books',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await books.booksForSchoolAdmin(params<{ id: string }>(req).id));
  }),
);

publicationRouter.put(
  '/schools/:id/books',
  validate({ params: idParamSchema, body: setSchoolBooksSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await books.setSchoolBooks(
        params<{ id: string }>(req).id,
        body<SetSchoolBooksInput>(req),
        req.auth!.userId,
      ),
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

/* -------------------------------------------------------------------------- */
/* Standards — the years a preschool teaches                                  */
/* -------------------------------------------------------------------------- */

publicationRouter.get(
  '/standards',
  asyncHandler(async (req, res) => {
    res.json(await standards.listStandards(req.query.includeInactive === 'true'));
  }),
);

publicationRouter.post(
  '/standards',
  validate({ body: createStandardSchema }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await standards.createStandard(body<CreateStandardInput>(req), req.auth!.userId));
  }),
);

publicationRouter.patch(
  '/standards/:id',
  validate({ params: idParamSchema, body: updateStandardSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await standards.updateStandard(
        params<{ id: string }>(req).id,
        body<UpdateStandardInput>(req),
        req.auth!.userId,
      ),
    );
  }),
);

/** Retiring, which is refused while classrooms are still in it. */
publicationRouter.post(
  '/standards/:id/retire',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await standards.retireStandard(params<{ id: string }>(req).id, req.auth!.userId));
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

/* -------------------------------------------------------------------------- */
/* Questions — the rows on a page                                             */
/* -------------------------------------------------------------------------- */

/** Every question in the catalogue, filterable by book or by page. */
publicationRouter.get(
  '/questions',
  asyncHandler(async (req, res) => {
    const asString = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
    res.json(
      await questions.listAllQuestions({
        bookId: asString(req.query.bookId),
        activityId: asString(req.query.activityId),
        page: Number(req.query.page) || 1,
        pageSize: Math.min(Number(req.query.pageSize) || 50, 200),
      }),
    );
  }),
);

publicationRouter.get(
  '/activities/:id/questions',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await questions.listQuestions(params<{ id: string }>(req).id));
  }),
);

publicationRouter.post(
  '/activities/:id/questions',
  validate({ params: idParamSchema, body: createQuestionSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(
      await questions.createQuestion(
        params<{ id: string }>(req).id,
        body<CreateQuestionInput>(req),
        req.auth!.userId,
      ),
    );
  }),
);

publicationRouter.patch(
  '/questions/:id',
  validate({ params: idParamSchema, body: updateQuestionSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await questions.updateQuestion(
        params<{ id: string }>(req).id,
        body<UpdateQuestionInput>(req),
        req.auth!.userId,
      ),
    );
  }),
);

publicationRouter.delete(
  '/questions/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await questions.deleteQuestion(params<{ id: string }>(req).id, req.auth!.userId);
    res.status(204).end();
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
