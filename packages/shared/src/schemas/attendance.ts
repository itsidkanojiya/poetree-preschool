import { z } from 'zod';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '../enums.js';
import { idSchema } from './common.js';

/**
 * The whole register is sent in one request rather than one call per child.
 *
 * That is deliberate: it is a single round trip from a phone on poor signal, it
 * is replayable when the app syncs after being offline, and it matches the
 * unique constraint on (classroom, date) so a retry can never create a second
 * register for the same day.
 */
export const markAttendanceSchema = z.object({
  classroomId: idSchema,
  date: z.coerce.date(),
  note: z.string().trim().max(300).optional(),
  records: z
    .array(
      z.object({
        studentId: idSchema,
        status: z.enum(ATTENDANCE_STATUSES),
        remark: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, 'Mark at least one child')
    .max(200),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

export const attendanceSheetQuerySchema = z.object({
  classroomId: idSchema,
  date: z.coerce.date(),
});
export type AttendanceSheetQuery = z.infer<typeof attendanceSheetQuerySchema>;

export const attendanceRangeQuerySchema = z.object({
  classroomId: idSchema.optional(),
  studentId: idSchema.optional(),
  from: z.coerce.date(),
  to: z.coerce.date(),
});
export type AttendanceRangeQuery = z.infer<typeof attendanceRangeQuerySchema>;

export const correctAttendanceSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES),
  remark: z.string().trim().max(200).optional(),
});
export type CorrectAttendanceInput = z.infer<typeof correctAttendanceSchema>;

export interface AttendanceSheetRow {
  studentId: string;
  fullName: string;
  admissionNo: string;
  rollNo: string | null;
  avatarUrl: string | null;
  status: AttendanceStatus;
  remark: string | null;
  recordId: string | null;
}

export interface AttendanceSheet {
  classroomId: string;
  classroomLabel: string;
  date: string;
  /** A holiday blocks marking entirely and is excluded from percentages. */
  isHoliday: boolean;
  holidayTitle: string | null;
  /** True once a register exists for this classroom and day. */
  alreadyMarked: boolean;
  markedByName: string | null;
  markedAt: string | null;
  /** False when the caller may view but no longer edit this date. */
  editable: boolean;
  note: string | null;
  rows: AttendanceSheetRow[];
  counts: Record<AttendanceStatus, number>;
}

export interface AttendanceDaySummary {
  date: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  halfDay: number;
  total: number;
  /** Present + late + half day, over the roster. Holidays never appear here. */
  percentage: number;
}

export interface StudentAttendanceSummary {
  studentId: string;
  fullName: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  halfDay: number;
  /** Days the school actually ran — holidays excluded, or the figure is wrong. */
  markedDays: number;
  percentage: number;
}
