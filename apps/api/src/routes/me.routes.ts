import { Router } from 'express';
import { CLASS_LEVEL_LABELS } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { prisma } from '../db/prisma.js';
import { teacherClassroomIds } from '../services/scope.service.js';

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
    const where =
      role === 'TEACHER' ? { id: { in: await teacherClassroomIds() } } : {};

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
        label: `${CLASS_LEVEL_LABELS[classroom.classLevel.code]} — ${classroom.section}`,
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
