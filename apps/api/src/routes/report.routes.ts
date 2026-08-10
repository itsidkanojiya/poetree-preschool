import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { roleHasPermission } from '@poetree/shared';
import { getRequestContext } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { paiseToRupees, reportFilename, toCsv, type CsvColumn } from '../lib/csv.js';
import { writeAuditLogSafe } from '../services/audit.service.js';
import * as reports from '../services/report.service.js';

export const reportRouter = Router();

// Viewing a report on screen and taking a copy of it away are different acts,
// and the permission matrix already separates them. Everything here needs
// report:view; the CSV branch additionally needs report:export.
reportRouter.use(requirePermission('report:view'));

function range(req: Request): reports.DateRange {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  return reports.parseRange(from, to);
}

function classroomId(req: Request): string | undefined {
  return typeof req.query.classroomId === 'string' ? req.query.classroomId : undefined;
}

/**
 * Returns JSON, or CSV when `?format=csv`.
 *
 * An export is a bulk read of children's and families' data leaving the system,
 * so it is audited — who took what, and when. That record is the only way to
 * answer the question afterwards.
 */
function respond<T>(
  req: Request,
  res: Response,
  name: string,
  rows: T[],
  columns: Array<CsvColumn<T>>,
): void {
  if (req.query.format !== 'csv') {
    res.json({ rows, count: rows.length });
    return;
  }

  const context = getRequestContext();

  if (!context || !roleHasPermission(context.role, 'report:export')) {
    throw ApiError.forbidden('You may view this report but not export it');
  }

  writeAuditLogSafe({
    action: 'DATA_EXPORTED',
    entity: 'Report',
    entityId: name,
    schoolId: context.schoolId ?? null,
    actorUserId: context.userId,
    ipAddress: req.ip ?? null,
    metadata: { report: name, rows: rows.length, from: req.query.from, to: req.query.to },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${reportFilename(name)}"`);
  res.send(toCsv(rows, columns));
}

reportRouter.get(
  '/attendance/register',
  asyncHandler(async (req, res) => {
    const rows = await reports.attendanceRegister(range(req), classroomId(req));
    respond(req, res, 'attendance-register', rows, [
      { header: 'Date', value: (r) => r.date },
      { header: 'Class', value: (r) => r.classroom },
      { header: 'Present', value: (r) => r.present },
      { header: 'Absent', value: (r) => r.absent },
      { header: 'Late', value: (r) => r.late },
      { header: 'Leave', value: (r) => r.leave },
      { header: 'Half day', value: (r) => r.halfDay },
      { header: 'Total', value: (r) => r.total },
      { header: 'Attendance %', value: (r) => r.percentage },
    ]);
  }),
);

reportRouter.get(
  '/attendance/students',
  asyncHandler(async (req, res) => {
    const rows = await reports.studentAttendance(range(req), classroomId(req));
    respond(req, res, 'attendance-by-student', rows, [
      { header: 'Admission no.', value: (r) => r.admissionNo },
      { header: 'Student', value: (r) => r.student },
      { header: 'Class', value: (r) => r.classroom },
      { header: 'Present', value: (r) => r.present },
      { header: 'Absent', value: (r) => r.absent },
      { header: 'Late', value: (r) => r.late },
      { header: 'Leave', value: (r) => r.leave },
      { header: 'Half day', value: (r) => r.halfDay },
      { header: 'Days marked', value: (r) => r.daysMarked },
      { header: 'Attendance %', value: (r) => r.percentage },
    ]);
  }),
);

reportRouter.get(
  '/fees/collection',
  asyncHandler(async (req, res) => {
    const rows = await reports.feeCollection(range(req));
    respond(req, res, 'fee-collection', rows, [
      { header: 'Receipt no.', value: (r) => r.receiptNo },
      { header: 'Date', value: (r) => r.paidOn },
      { header: 'Admission no.', value: (r) => r.admissionNo },
      { header: 'Student', value: (r) => r.student },
      { header: 'Method', value: (r) => r.method },
      // Rupees, not paise: a spreadsheet should sum to what the office banked.
      { header: 'Amount (INR)', value: (r) => paiseToRupees(r.amountInPaise) },
      { header: 'Reference', value: (r) => r.reference },
      { header: 'Recorded by', value: (r) => r.recordedBy },
    ]);
  }),
);

reportRouter.get(
  '/fees/dues',
  asyncHandler(async (req, res) => {
    const rows = await reports.outstandingDues();
    respond(req, res, 'outstanding-dues', rows, [
      { header: 'Admission no.', value: (r) => r.admissionNo },
      { header: 'Student', value: (r) => r.student },
      { header: 'Class', value: (r) => r.classroom },
      { header: 'Invoice no.', value: (r) => r.invoiceNo },
      { header: 'Period', value: (r) => r.period },
      { header: 'Due date', value: (r) => r.dueDate },
      { header: 'Billed (INR)', value: (r) => paiseToRupees(r.netInPaise) },
      { header: 'Paid (INR)', value: (r) => paiseToRupees(r.paidInPaise) },
      { header: 'Outstanding (INR)', value: (r) => paiseToRupees(r.outstandingInPaise) },
      { header: 'Days overdue', value: (r) => r.daysOverdue },
    ]);
  }),
);

reportRouter.get(
  '/homework/completion',
  asyncHandler(async (req, res) => {
    const rows = await reports.homeworkCompletion(range(req));
    respond(req, res, 'homework-completion', rows, [
      { header: 'Homework', value: (r) => r.title },
      { header: 'Class', value: (r) => r.classroom },
      { header: 'Due date', value: (r) => r.dueDate },
      { header: 'Assigned', value: (r) => r.assigned },
      { header: 'Completed', value: (r) => r.completed },
      { header: 'Pending', value: (r) => r.pending },
      { header: 'Completion %', value: (r) => r.completionPercent },
    ]);
  }),
);

reportRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json(await reports.schoolSummary(range(req)));
  }),
);
