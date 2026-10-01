import { z } from 'zod';
import type { ReportCardStatus } from '../enums.js';
import { idSchema } from './common.js';

/**
 * Term report cards.
 *
 * The office sets up three things once: its grading scale (its own words —
 * "Excellent", "A+", "★★★"), the terms of each academic year, and the lines a
 * child is graded on for each class level, under headings such as "Subjects"
 * and "Development". Class teachers then grade their children each term and
 * hand the class to the office, which checks and publishes to families.
 */

/* -------------------------------------------------------------------------- */
/* Presets                                                                    */
/* -------------------------------------------------------------------------- */

/** Ready-made scales a school can start from, best grade first. */
export const GRADE_SCALE_PRESETS = {
  words: [
    { label: 'Excellent', description: 'Does this confidently and on their own' },
    { label: 'Very good', description: 'Does this well, with a little help' },
    { label: 'Good', description: 'Is getting there with help' },
    { label: 'Needs practice', description: 'Is just starting' },
  ],
  letters: [
    { label: 'A+', description: 'Outstanding' },
    { label: 'A', description: 'Very good' },
    { label: 'B', description: 'Good' },
    { label: 'C', description: 'Needs practice' },
  ],
  stars: [
    { label: '★★★', description: 'Excellent' },
    { label: '★★', description: 'Good' },
    { label: '★', description: 'Needs practice' },
  ],
} as const;
export type GradeScalePreset = keyof typeof GRADE_SCALE_PRESETS;

/** The two headings a report card starts with. A school may add its own. */
export const REPORT_AREA_GROUPS = ['Subjects', 'Development'] as const;

/** The developmental areas most preschools report on. */
export const DEVELOPMENT_AREA_PRESETS = [
  'Language & communication',
  'Fine motor skills',
  'Gross motor skills',
  'Social & emotional',
  'Creativity (art & craft)',
  'Music & movement',
] as const;

/* -------------------------------------------------------------------------- */
/* Setup                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The whole scale at once, best first. Grades kept by id are renamed in place;
 * grades left out are retired, not deleted — a published card still names them.
 */
export const saveGradeScaleSchema = z.object({
  levels: z
    .array(
      z.object({
        id: idSchema.optional(),
        label: z.string().trim().min(1, 'Give the grade a name').max(30),
        description: z.string().trim().max(120).nullish(),
      }),
    )
    .min(2, 'A scale needs at least two grades')
    .max(8, 'Eight grades is the most a report card can show'),
});
export type SaveGradeScaleInput = z.infer<typeof saveGradeScaleSchema>;

export const createTermSchema = z
  .object({
    /** Defaults to the current academic year. */
    academicYearId: idSchema.optional(),
    name: z.string().trim().min(1, 'Name the term').max(60),
    startsOn: z.coerce.date().nullish(),
    endsOn: z.coerce.date().nullish(),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.startsOn <= v.endsOn, {
    message: 'The term ends before it starts',
    path: ['endsOn'],
  });
export type CreateTermInput = z.infer<typeof createTermSchema>;

export const updateTermSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  startsOn: z.coerce.date().nullish(),
  endsOn: z.coerce.date().nullish(),
  sortOrder: z.number().int().min(0).max(99).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTermInput = z.infer<typeof updateTermSchema>;

export const createReportAreaSchema = z.object({
  classLevelId: idSchema,
  group: z.string().trim().min(1, 'Choose a heading').max(60),
  name: z.string().trim().min(1, 'Name what is graded').max(80),
});
export type CreateReportAreaInput = z.infer<typeof createReportAreaSchema>;

export const updateReportAreaSchema = z.object({
  group: z.string().trim().min(1).max(60).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateReportAreaInput = z.infer<typeof updateReportAreaSchema>;

/** Adds a set of areas in one go: the book subjects, or the usual development areas. */
export const addReportAreaPresetSchema = z.object({
  classLevelId: idSchema,
  preset: z.enum(['subjects', 'development']),
});
export type AddReportAreaPresetInput = z.infer<typeof addReportAreaPresetSchema>;

export const reportAreasQuerySchema = z.object({ classLevelId: idSchema.optional() });

/* -------------------------------------------------------------------------- */
/* Filling in                                                                 */
/* -------------------------------------------------------------------------- */

/** One child's card: every grade given so far, and the teacher's remarks. */
export const saveReportCardSchema = z.object({
  termId: idSchema,
  studentId: idSchema,
  grades: z.array(z.object({ areaId: idSchema, gradeLevelId: idSchema.nullable() })).max(80),
  remarks: z.string().trim().max(1500).nullish(),
});
export type SaveReportCardInput = z.infer<typeof saveReportCardSchema>;

/** Publish the whole class, or only the children named. */
export const publishReportCardsSchema = z.object({
  studentIds: z.array(idSchema).max(200).optional(),
});
export type PublishReportCardsInput = z.infer<typeof publishReportCardsSchema>;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export interface GradeLevelSummary {
  id: string;
  label: string;
  description: string | null;
  sortOrder: number;
}

export interface TermSummary {
  id: string;
  academicYearId: string;
  academicYearName: string;
  name: string;
  sortOrder: number;
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
}

export interface ReportAreaSummary {
  id: string;
  classLevelId: string;
  group: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

/** Where a child's card is. NOT_STARTED is a child with no card saved yet. */
export type ReportCardProgress = ReportCardStatus | 'NOT_STARTED';

export interface ReportGridChild {
  studentId: string;
  fullName: string;
  rollNo: string | null;
  reportCardId: string | null;
  status: ReportCardProgress;
  remarks: string | null;
  /** areaId → the grade given, or null. Areas not yet graded are absent. */
  grades: Record<string, string | null>;
  /** How many areas have a grade. */
  graded: number;
}

export interface ReportCounts {
  notStarted: number;
  draft: number;
  submitted: number;
  published: number;
}

/** Everything the grid needs for one class and one term. */
export interface ReportGrid {
  classroom: { id: string; label: string; classLevelId: string };
  term: TermSummary;
  areas: ReportAreaSummary[];
  scale: GradeLevelSummary[];
  children: ReportGridChild[];
  counts: ReportCounts;
}

/** One class's progress through a term, for the office's overview. */
export interface ResultsClassroomRow extends ReportCounts {
  classroomId: string;
  label: string;
  children: number;
}

/**
 * A report card as a family reads it. Built from the frozen snapshot once
 * published, so it never changes under them.
 */
export interface ReportCardView {
  id: string;
  status: ReportCardStatus;
  term: string;
  academicYear: string;
  student: {
    id: string;
    fullName: string;
    admissionNo: string;
    rollNo: string | null;
    dateOfBirth: string;
  };
  classroom: string;
  groups: Array<{ group: string; rows: Array<{ area: string; grade: string | null }> }>;
  scale: Array<{ label: string; description: string | null }>;
  remarks: string | null;
  classTeacher: string | null;
  principal: string | null;
  publishedAt: string | null;
}

/** A published card in a family's list. */
export interface ReportCardListItem {
  id: string;
  termId: string;
  term: string;
  academicYear: string;
  publishedAt: string;
}
