import { Router } from 'express';
import {
  attendanceRangeQuerySchema,
  attendanceSheetQuerySchema,
  correctAttendanceSchema,
  idParamSchema,
  markAttendanceSchema,
} from '@poetree/shared';
import type {
  AttendanceRangeQuery,
  AttendanceSheetQuery,
  CorrectAttendanceInput,
  MarkAttendanceInput,
} from '@poetree/shared';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { body, params, query, validate } from '../middleware/validate.js';
import { ApiError } from '../lib/apiError.js';
import * as attendance from '../services/attendance.service.js';

/**
 * Shared by School Admins and Teachers, so it is gated by permission rather than
 * by role. Row-level scope — a teacher only reaching their own classrooms — is
 * enforced inside the service, not here.
 */
export const attendanceRouter = Router();

attendanceRouter.get(
  '/sheet',
  requirePermission('attendance:read'),
  validate({ query: attendanceSheetQuerySchema }),
  asyncHandler(async (req, res) => {
    const { classroomId, date } = query<AttendanceSheetQuery>(req);
    res.json(await attendance.getAttendanceSheet(classroomId, date));
  }),
);

/**
 * PUT, not POST: submitting the register twice must leave one register, not two.
 * The unique constraint on (classroom, date) backs that up in the database.
 */
attendanceRouter.put(
  '/',
  requirePermission('attendance:mark'),
  validate({ body: markAttendanceSchema }),
  asyncHandler(async (req, res) => {
    const sheet = await attendance.markAttendance(
      body<MarkAttendanceInput>(req),
      req.auth!.userId,
    );
    res.json(sheet);
  }),
);

attendanceRouter.patch(
  '/records/:id',
  requirePermission('attendance:mark'),
  validate({ params: idParamSchema, body: correctAttendanceSchema }),
  asyncHandler(async (req, res) => {
    await attendance.correctAttendanceRecord(
      params<{ id: string }>(req).id,
      body<CorrectAttendanceInput>(req),
      req.auth!.userId,
    );
    res.status(204).send();
  }),
);

attendanceRouter.get(
  '/daily',
  requirePermission('attendance:read'),
  validate({ query: attendanceRangeQuerySchema }),
  asyncHandler(async (req, res) => {
    const { classroomId, from, to } = query<AttendanceRangeQuery>(req);
    if (!classroomId) throw ApiError.badRequest('classroomId is required');
    res.json(await attendance.classroomDailySummary(classroomId, from, to));
  }),
);

attendanceRouter.get(
  '/students',
  requirePermission('attendance:read'),
  validate({ query: attendanceRangeQuerySchema }),
  asyncHandler(async (req, res) => {
    const { classroomId, from, to } = query<AttendanceRangeQuery>(req);
    if (!classroomId) throw ApiError.badRequest('classroomId is required');
    res.json(await attendance.studentAttendanceSummary(classroomId, from, to));
  }),
);

/**
 * One child's own attendance — what a parent opens the app for.
 *
 * Deliberately keyed on the child rather than their class. The endpoints above
 * answer classroom-shaped questions, and the guard on those now refuses parents
 * outright: any classroom-shaped answer is a list of other people's children.
 */
attendanceRouter.get(
  '/children/:id',
  requirePermission('attendance:read'),
  validate({ params: idParamSchema, query: attendanceRangeQuerySchema }),
  asyncHandler(async (req, res) => {
    const { from, to } = query<AttendanceRangeQuery>(req);
    res.json(
      await attendance.childAttendance(params<{ id: string }>(req).id, from, to),
    );
  }),
);
