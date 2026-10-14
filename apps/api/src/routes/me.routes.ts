import { Router } from 'express';
import { z } from 'zod';
import {
  chooseFeePlanSchema,
  idParamSchema,
  idSchema,
  setStudentPhotoSchema,
  type ChooseFeePlanInput,
} from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { body, params, query, validate } from '../middleware/validate.js';
import { prisma } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { guardianStudentIds, teacherClassroomIds } from '../services/scope.service.js';
import * as idCards from '../services/idCard.service.js';
import * as gallery from '../services/gallery.service.js';
import * as certificates from '../services/certificate.service.js';
import * as results from '../services/result.service.js';
import * as students from '../services/student.service.js';
import * as feePlans from '../services/feePlan.service.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { studentName } from '../lib/names.js';

/**
 * "What is mine?" — the first call every client makes after signing in.
 *
 * A teacher's app opens straight onto today's register, so it needs its own
 * classrooms before it can render anything.
 */
export const meRouter = Router();

meRouter.get(
  '/classrooms',
  asyncHandler(async (req, res) => {
    const role = req.auth!.role;

    // School Admins see the whole school; teachers only what they are assigned.
    const where = role === 'TEACHER' ? { id: { in: await teacherClassroomIds() } } : {};

    const classrooms = await prisma.classroom.findMany({
      where,
      include: {
        classLevel: { select: { code: true, name: true } },
        academicYear: { select: { id: true, name: true, isCurrent: true } },
        _count: { select: { enrolments: true } },
      },
      orderBy: [{ classLevel: { sortOrder: 'asc' } }, { section: 'asc' }],
    });

    res.json(
      classrooms.map((classroom) => ({
        id: classroom.id,
        label: `${classroom.classLevel.name} — ${classroom.section}`,
        section: classroom.section,
        classLevel: { code: classroom.classLevel.code, name: classroom.classLevel.name },
        academicYear: {
          id: classroom.academicYear.id,
          name: classroom.academicYear.name,
          isCurrent: classroom.academicYear.isCurrent,
        },
        studentCount: classroom._count.enrolments,
      })),
    );
  }),
);

/**
 * A parent's children.
 *
 * The app opens on this: a child is chosen by tapping a face, because students
 * hold no credentials anywhere in this platform. Every other parent screen
 * hangs off the child chosen here.
 *
 * Scoped by guardian link rather than by school — being a parent at a school
 * does not entitle anyone to the roster of it.
 */
meRouter.get(
  '/children',
  asyncHandler(async (req, res) => {
    if (req.auth!.role !== 'PARENT') {
      throw ApiError.forbidden('Only a parent has children on this endpoint');
    }

    const studentIds = await guardianStudentIds();
    if (studentIds.length === 0) {
      res.json([]);
      return;
    }

    const students = await prisma.student.findMany({
      where: { id: { in: studentIds }, status: 'ACTIVE' },
      include: {
        enrolments: {
          where: { status: 'ACTIVE' },
          orderBy: { enrolledOn: 'desc' },
          take: 1,
          include: {
            classroom: { include: { classLevel: { select: { code: true, name: true } } } },
            academicYear: { select: { id: true, name: true, isCurrent: true } },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }],
    });

    res.json(
      students.map((student) => {
        const enrolment = student.enrolments[0];
        return {
          id: student.id,
          fullName: studentName(student),
          admissionNo: student.admissionNo,
          // The photograph the school or the family set, as the office's own
          // view reads it. The old avatarUrl column alone left every photo
          // set since out of the parent app.
          avatarUrl: student.photoFileId
            ? `/api/v1/files/${student.photoFileId}`
            : student.avatarUrl,
          rollNo: enrolment?.rollNo ?? null,
          // A child between enrolments still belongs to their parent, so they
          // appear with no class rather than vanishing from the app.
          classroom: enrolment?.classroom
            ? {
                id: enrolment.classroom.id,
                label: `${enrolment.classroom.classLevel.name} — ${enrolment.classroom.section}`,
              }
            : null,
          academicYear: enrolment?.academicYear
            ? { id: enrolment.academicYear.id, name: enrolment.academicYear.name }
            : null,
        };
      }),
    );
  }),
);

/**
 * The child's ID card, as data for the app to draw.
 *
 * The same fields the printed card carries, including the school's switches:
 * if the office has turned the guardian's phone off the card, it is off the
 * phone too, or the screen would say more than the thing in the child's bag.
 *
 * Guarded by assertCanReadStudent inside the service, so a parent reaches their
 * own children and nobody else's.
 */
/**
 * The events this child's family may see: the whole school's, and their own
 * class's. Guarded inside the service like the ID card — a parent reaches their
 * own children and nobody else's.
 */
meRouter.get(
  '/children/:id/gallery',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await gallery.eventsForChild(params<{ id: string }>(req).id));
  }),
);

/** A child's certificates, issued and standing, newest first. */
meRouter.get(
  '/children/:id/certificates',
  requirePermission('certificate:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await certificates.certificatesForChild(params<{ id: string }>(req).id));
  }),
);

/** A child's published report cards, newest first. */
meRouter.get(
  '/children/:id/report-cards',
  requirePermission('result:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await results.reportCardsForChild(params<{ id: string }>(req).id));
  }),
);

/** One published report card, as the app draws it. */
meRouter.get(
  '/children/:id/report-cards/:termId',
  requirePermission('result:read'),
  validate({ params: idParamSchema.extend({ termId: idSchema }) }),
  asyncHandler(async (req, res) => {
    const { id, termId } = params<{ id: string; termId: string }>(req);
    res.json(await results.reportCardForChild(id, termId));
  }),
);

/** One event's photos. An event they may not see is not found, not forbidden. */
meRouter.get(
  '/children/:id/gallery/:eventId',
  validate({ params: idParamSchema.extend({ eventId: idSchema }) }),
  asyncHandler(async (req, res) => {
    const { id, eventId } = params<{ id: string; eventId: string }>(req);
    res.json(await gallery.eventForChild(id, eventId));
  }),
);

meRouter.get(
  '/children/:id/id-card',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await idCards.studentIdCardData(params<{ id: string }>(req).id));
  }),
);

/**
 * A parent's photograph of their own child, from the app. Null takes it off.
 * The office can still replace it from the portal, as before.
 */
meRouter.put(
  '/children/:id/photo',
  validate({ params: idParamSchema, body: setStudentPhotoSchema }),
  asyncHandler(async (req, res) => {
    if (req.auth!.role !== 'PARENT') {
      throw ApiError.forbidden('Only a parent can set their child’s photograph here');
    }
    await students.setOwnChildPhoto(
      params<{ id: string }>(req).id,
      body<{ fileId: string | null }>(req).fileId,
      req.auth!.userId,
    );
    res.status(204).end();
  }),
);

/**
 * How this child's fees can be paid this year: the plans the school offers
 * them, what each comes to, and the one chosen.
 */
meRouter.get(
  '/children/:id/fee-plan',
  requirePermission('fee:read'),
  validate({
    params: idParamSchema,
    query: z.object({ academicYearId: idSchema.optional() }),
  }),
  asyncHandler(async (req, res) => {
    res.json(
      await feePlans.planChoice(
        params<{ id: string }>(req).id,
        query<{ academicYearId?: string }>(req).academicYearId,
      ),
    );
  }),
);

/**
 * The family chooses a plan; its installments are billed there and then.
 * Choosing twice returns the first choice — never a second schedule.
 */
meRouter.post(
  '/children/:id/fee-plan',
  requirePermission('fee:read'),
  validate({ params: idParamSchema, body: chooseFeePlanSchema }),
  asyncHandler(async (req, res) => {
    if (req.auth!.role !== 'PARENT') {
      throw ApiError.forbidden('The office sets a child’s plan from the portal');
    }
    res.json(
      await feePlans.choosePlan(
        params<{ id: string }>(req).id,
        body<ChooseFeePlanInput>(req),
        req.auth!.userId,
      ),
    );
  }),
);

/**
 * Nothing else lives under /me. Said so here, rather than letting the request
 * fall through to the School Admin routes mounted at the root — which answer
 * "This action requires one of: SCHOOL_ADMIN, ORG_ADMIN", and told a parent
 * whose app was newer than this server that they needed to be an admin.
 */
meRouter.use((_req, _res, next) => next(ApiError.notFound('Not found')));
