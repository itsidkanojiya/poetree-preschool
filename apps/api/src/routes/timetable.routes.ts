import { Router, type Request } from 'express';
import { z } from 'zod';
import { idParamSchema, idSchema } from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { body, params, validate } from '../middleware/validate.js';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import * as timetable from '../services/timetable.service.js';
import { ApiError } from '../lib/apiError.js';
import { writeAuditLog } from '../services/audit.service.js';

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

/**
 * The school day, with what each period is carrying.
 *
 * `lessonCount` is every entry in that period across every class, because
 * `TimetableEntry.periodId` cascades: removing a period takes that row out of
 * every timetable in the school. Somebody deciding whether to delete one should
 * be told the cost before they do it, not discover it on Monday.
 */
timetableRouter.get(
  '/periods',
  requirePermission('timetable:read'),
  asyncHandler(async (_req, res) => {
    const periods = await prisma.timetablePeriod.findMany({ orderBy: { sortOrder: 'asc' } });

    const used = await prisma.timetableEntry.groupBy({
      by: ['periodId'],
      where: { periodId: { in: periods.map((period) => period.id) } },
      _count: { _all: true },
    });
    const counts = new Map(used.map((row) => [row.periodId, row._count._all]));

    res.json(
      periods.map((period) => ({ ...period, lessonCount: counts.get(period.id) ?? 0 })),
    );
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

/** Everything about a period can be corrected except the year it belongs to. */
const updatePeriodSchema = periodSchema.omit({ academicYearId: true }).partial();

timetableRouter.patch(
  '/periods/:id',
  requirePermission('timetable:manage'),
  validate({ params: idParamSchema, body: updatePeriodSchema }),
  asyncHandler(async (req, res) => {
    // Scoped, so a period belonging to another school is simply not here and
    // the answer is "not found" rather than a 403 that would confirm it exists.
    const existing = await prisma.timetablePeriod.findFirst({
      where: { id: id(req) },
      select: { id: true, name: true },
    });
    if (!existing) throw ApiError.notFound('Period not found');

    const input = body<z.infer<typeof updatePeriodSchema>>(req);
    const period = await prisma.timetablePeriod.update({ where: { id: existing.id }, data: input });

    await writeAuditLog({
      action: 'TIMETABLE_UPDATED',
      entity: 'TimetablePeriod',
      entityId: existing.id,
      schoolId: requireSchoolId(),
      actorUserId: req.auth!.userId,
      before: { name: existing.name },
      after: { fields: Object.keys(input) },
    });

    res.json(period);
  }),
);

/**
 * Removes a period from the school day.
 *
 * A real delete, and it takes the lessons with it: the entry's `periodId`
 * cascades, so every class loses whatever was in that row. There is no softer
 * option — a period nobody teaches is a blank line across the whole week, and
 * leaving it "retired but present" would be exactly that.
 *
 * The count is in the response so the portal can say what went, and the audit
 * log records it, because this cannot be undone from the screen.
 */
timetableRouter.delete(
  '/periods/:id',
  requirePermission('timetable:manage'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.timetablePeriod.findFirst({
      where: { id: id(req) },
      select: { id: true, name: true },
    });
    if (!existing) throw ApiError.notFound('Period not found');

    const lessonCount = await prisma.timetableEntry.count({ where: { periodId: existing.id } });
    await prisma.timetablePeriod.delete({ where: { id: existing.id } });

    await writeAuditLog({
      action: 'TIMETABLE_UPDATED',
      entity: 'TimetablePeriod',
      entityId: existing.id,
      schoolId: requireSchoolId(),
      actorUserId: req.auth!.userId,
      before: { removed: existing.name, lessonCount },
    });

    res.json({ removed: existing.name, lessonCount });
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
