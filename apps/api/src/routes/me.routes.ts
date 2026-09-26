import { Router } from 'express';
import { idParamSchema, idSchema } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { params, validate } from '../middleware/validate.js';
import { prisma } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { guardianStudentIds, teacherClassroomIds } from '../services/scope.service.js';
import * as idCards from '../services/idCard.service.js';
import * as gallery from '../services/gallery.service.js';
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
          avatarUrl: student.avatarUrl,
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
