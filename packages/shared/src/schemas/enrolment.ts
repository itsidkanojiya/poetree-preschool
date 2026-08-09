import { z } from 'zod';
import { ENROLMENT_STATUSES, GENDERS, type EnrolmentStatus } from '../enums.js';
import { idSchema, paginationQuerySchema } from './common.js';

/**
 * Promotion moves a cohort into next year's classroom. It never edits the
 * current enrolment's classroom — it closes it and opens a new one, so last
 * year's register, fees and homework stay attached to where they happened.
 */
export const promoteStudentsSchema = z.object({
  fromClassroomId: idSchema,
  toClassroomId: idSchema,
  /** Omit to promote the whole classroom. */
  studentIds: z.array(idSchema).max(300).optional(),
});
export type PromoteStudentsInput = z.infer<typeof promoteStudentsSchema>;

export const withdrawStudentSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason — it is written to the audit log').max(200),
  exitedOn: z.coerce.date().optional(),
  /** TRANSFERRED when the child moves to another school; WITHDRAWN otherwise. */
  status: z.enum(['WITHDRAWN', 'TRANSFERRED']).default('WITHDRAWN'),
});
export type WithdrawStudentInput = z.infer<typeof withdrawStudentSchema>;

/** Moving a child between sections inside the same year. */
export const transferSectionSchema = z.object({
  toClassroomId: idSchema,
  rollNo: z.string().trim().max(20).optional(),
});
export type TransferSectionInput = z.infer<typeof transferSectionSchema>;

export const listEnrolmentsQuerySchema = paginationQuerySchema.extend({
  classroomId: idSchema.optional(),
  academicYearId: idSchema.optional(),
  status: z.enum(ENROLMENT_STATUSES).optional(),
});
export type ListEnrolmentsQuery = z.infer<typeof listEnrolmentsQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Bulk import                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One row of the uploaded sheet.
 *
 * `admissionNo` is optional — leave it blank and the server issues the next one
 * from the school's sequence, which is what a school moving off paper usually
 * wants.
 */
export const importStudentRowSchema = z.object({
  admissionNo: z.string().trim().max(40).optional(),
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().max(60).optional(),
  dateOfBirth: z.coerce.date(),
  gender: z.enum(GENDERS),
  rollNo: z.string().trim().max(20).optional(),
  guardianName: z.string().trim().min(2, 'Guardian name is required').max(120),
  guardianPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s\-()]{6,19}$/, 'Invalid guardian phone'),
  guardianEmail: z.string().trim().toLowerCase().email().max(160).optional().or(z.literal('')),
});
export type ImportStudentRow = z.infer<typeof importStudentRowSchema>;

export const importStudentsSchema = z.object({
  classroomId: idSchema,
  /** A default password for the guardian accounts this import creates. */
  guardianPassword: z.string().min(8).max(72),
  rows: z.array(z.unknown()).min(1, 'The file has no rows').max(500),
  /**
   * false → validate only and return the report.
   * true  → apply, and only if every row is valid.
   */
  commit: z.boolean().default(false),
});
export type ImportStudentsInput = z.infer<typeof importStudentsSchema>;

export interface ImportRowIssue {
  row: number;
  field: string;
  message: string;
}

export interface ImportReport {
  totalRows: number;
  validRows: number;
  issues: ImportRowIssue[];
  /** True only when `commit` was set and every single row was valid. */
  applied: boolean;
  createdStudents: number;
  createdGuardians: number;
}

/* -------------------------------------------------------------------------- */
/* Responses                                                                  */
/* -------------------------------------------------------------------------- */

export interface EnrolmentSummary {
  id: string;
  studentId: string;
  fullName: string;
  admissionNo: string;
  rollNo: string | null;
  status: EnrolmentStatus;
  classroom: { id: string; label: string };
  academicYear: { id: string; name: string };
  enrolledOn: string;
  exitedOn: string | null;
  exitReason: string | null;
}

export interface PromotionResult {
  promoted: number;
  skipped: Array<{ studentId: string; fullName: string; reason: string }>;
  toClassroomLabel: string;
}
