import { z } from 'zod';
import { SCHOOL_STATUSES, STUDENT_STATUSES, USER_STATUSES } from '../enums.js';
import { idSchema } from './common.js';

/**
 * Taking school records away as an Excel file.
 *
 * Two doors. A School Admin exports their own school — the school is the one
 * on their session, never a parameter — and the Super Admin exports across
 * schools, one, several or all, with each row saying which school it is from.
 * Both are validated here and audited by the API; neither ever carries a
 * password, a code or a token, because the queries behind them never select
 * one.
 */

/** What a School Admin can export. */
export const SCHOOL_EXPORT_TYPES = ['students', 'teachers', 'parents', 'classes'] as const;
export type SchoolExportType = (typeof SCHOOL_EXPORT_TYPES)[number];

/** What the Super Admin can export, across schools. */
export const GLOBAL_EXPORT_TYPES = ['schools', 'students', 'teachers', 'parents'] as const;
export type GlobalExportType = (typeof GLOBAL_EXPORT_TYPES)[number];

/**
 * The status a row must have. Which values make sense depends on what is
 * exported — a child can be WITHDRAWN, an account SUSPENDED, a school on
 * TRIAL — so the type is checked against it below rather than trusted.
 */
const anyStatus = z.enum([
  ...new Set([...STUDENT_STATUSES, ...USER_STATUSES, ...SCHOOL_STATUSES]),
] as [string, ...string[]]);

function statusFits(type: string, status: string | undefined): boolean {
  if (!status) return true;
  if (type === 'students') return (STUDENT_STATUSES as readonly string[]).includes(status);
  if (type === 'teachers' || type === 'parents') {
    return (USER_STATUSES as readonly string[]).includes(status);
  }
  if (type === 'schools') return (SCHOOL_STATUSES as readonly string[]).includes(status);
  return false;
}

/** A School Admin's filters. Every one optional: none at all is everything. */
export const schoolExportQuerySchema = z
  .object({
    type: z.enum(SCHOOL_EXPORT_TYPES),
    /** One year of the school's own; the current year's classes when left out. */
    academicYearId: idSchema.optional(),
    /** The standard — Nursery, Junior KG. */
    classLevelId: idSchema.optional(),
    /** One class: a standard and section in a year. */
    classroomId: idSchema.optional(),
    status: anyStatus.optional(),
    search: z.string().trim().max(80).optional(),
  })
  .refine((v) => statusFits(v.type, v.status), {
    message: 'That status does not apply to this export',
    path: ['status'],
  });
export type SchoolExportQuery = z.infer<typeof schoolExportQuerySchema>;

/**
 * Up to this many schools may be named in one export. All of them is simply
 * naming none.
 */
export const MAX_EXPORT_SCHOOLS = 500;

/** The Super Admin's filters, across schools. */
export const globalExportQuerySchema = z
  .object({
    type: z.enum(GLOBAL_EXPORT_TYPES),
    /** Comma-separated school ids. Left out: every school. */
    schoolIds: z
      .string()
      .trim()
      .max(MAX_EXPORT_SCHOOLS * 32)
      .optional()
      .transform((value) =>
        value
          ? value
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean)
          : [],
      )
      .pipe(z.array(idSchema).max(MAX_EXPORT_SCHOOLS)),
    classLevelId: idSchema.optional(),
    /** A section's name — "A", "Sunflower" — which each school names itself. */
    section: z.string().trim().min(1).max(40).optional(),
    /**
     * An academic year by its name — "2026-27". Every school keeps its own
     * year rows, so across schools the year is matched on what it is called.
     */
    academicYear: z.string().trim().min(1).max(40).optional(),
    status: anyStatus.optional(),
  })
  .refine((v) => statusFits(v.type, v.status), {
    message: 'That status does not apply to this export',
    path: ['status'],
  });
export type GlobalExportQuery = z.infer<typeof globalExportQuerySchema>;

/** What the Super Admin's export screen offers to filter by. */
export interface GlobalExportFilters {
  schools: Array<{ id: string; name: string; code: string; status: string }>;
  standards: Array<{ id: string; name: string }>;
  /** Year names in use at any school, newest first. */
  academicYears: string[];
  /** Section names in use at any school. */
  sections: string[];
}
