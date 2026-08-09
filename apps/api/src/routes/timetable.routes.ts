import { Router, type Request } from 'express';
import { z } from 'zod';
import { idParamSchema, idSchema } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { body, params, validate } from '../middleware/validate.js';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import * as timetable from '../services/timetable.service.js';

export const timetableRouter = Router();

const id = (req: Request) => params<{ id: string }>(req).id;

const periodSchema = z.object({
  academicYearId: idSchema,
  name: z.string().trim().min(1).max(40),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  sortOrder: z.number().int().min(0).default(0),
  isBreak: z.boolean().default(false),
});

timetableRouter.get(
  '/periods',
  requirePermission('timetable:read'),
  asyncHandler(async (_req, res) => {
    res.json(await prisma.timetablePeriod.findMany({ orderBy: { sortOrder: 'asc' } }));
  }),
);

timetableRouter.post(
  '/periods',
  requirePermission('timetable:manage'),
  validate({ body: periodSchema }),
  asyncHandler(async (req, res) => {
    const input = body<z.infer<typeof periodSchema>>(req);
    res
      .status(201)
      .json(await prisma.timetablePeriod.create({ data: { schoolId: requireSchoolId(), ...input } }));
  }),
);

const slotsSchema = z.object({
  slots: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(1).max(7),
        periodId: idSchema,
        subjectId: idSchema.nullable().optional(),
        teacherId: idSchema.nullable().optional(),
        roomId: idSchema.nullable().optional(),
        note: z.string().trim().max(120).nullable().optional(),
      }),
    )
    .max(70),
});

timetableRouter.get(
  '/classrooms/:id',
  requirePermission('timetable:read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await timetable.getTimetable(id(req)));
  }),
);

/** Saves the whole week at once, which is how the grid editor works. */
timetableRouter.put(
  '/classrooms/:id',
  requirePermission('timetable:manage'),
  validate({ params: idParamSchema, body: slotsSchema }),
  asyncHandler(async (req, res) => {
    await timetable.setTimetable(id(req), body<z.infer<typeof slotsSchema>>(req).slots, req.auth!.userId);
    res.json(await timetable.getTimetable(id(req)));
  }),
);

/** A teacher's own week, assembled across every class they take. */
timetableRouter.get(
  '/me',
  requirePermission('timetable:read'),
  asyncHandler(async (req, res) => {
    res.json(await timetable.teacherTimetable(req.auth!.userId));
  }),
);
