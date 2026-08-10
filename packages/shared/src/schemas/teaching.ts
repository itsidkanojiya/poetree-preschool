import { z } from 'zod';
import { idSchema, paginationQuerySchema } from './common.js';

export const PUBLISH_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

export const SUBMISSION_STATUSES = [
  'PENDING',
  'SUBMITTED',
  'COMPLETED',
  'NOT_COMPLETED',
  'LATE',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const NOTICE_TYPES = ['GENERAL', 'EVENT', 'HOLIDAY', 'ACADEMIC', 'EMERGENCY'] as const;
export type NoticeType = (typeof NOTICE_TYPES)[number];

export const NOTICE_AUDIENCES = ['ALL', 'TEACHERS', 'PARENTS', 'CLASSROOMS'] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

export const CLASSROOM_POST_TYPES = ['ANNOUNCEMENT', 'MATERIAL'] as const;
export type ClassroomPostType = (typeof CLASSROOM_POST_TYPES)[number];

/* -------------------------------------------------------------------------- */
/* Homework                                                                   */
/* -------------------------------------------------------------------------- */

export const createHomeworkSchema = z.object({
  classroomId: idSchema,
  subjectId: idSchema.nullable().optional(),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).optional(),
  dueDate: z.coerce.date(),
  allowsSubmission: z.boolean().default(false),
  fileIds: z.array(idSchema).max(10).optional(),
  /** Publish immediately, or keep as a draft the class cannot see yet. */
  publish: z.boolean().default(true),
});
export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;

export const updateHomeworkSchema = createHomeworkSchema
  .omit({ classroomId: true, publish: true })
  .partial();
export type UpdateHomeworkInput = z.infer<typeof updateHomeworkSchema>;

export const listHomeworkQuerySchema = paginationQuerySchema.extend({
  classroomId: idSchema.optional(),
  status: z.enum(PUBLISH_STATUSES).optional(),
  /**
   * Whose submission to report alongside each row.
   *
   * A parent needs "have we done this", and the aggregate progress figures
   * cannot answer it. Ignored unless the caller may read that child.
   */
  studentId: idSchema.optional(),
});
export type ListHomeworkQuery = z.infer<typeof listHomeworkQuerySchema>;

export const reviewSubmissionSchema = z.object({
  status: z.enum(SUBMISSION_STATUSES),
  teacherRemark: z.string().trim().max(500).optional(),
});
export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;

/**
 * A parent marking their child's homework done.
 *
 * No status field: a parent says "we did this", and whether that counts as
 * COMPLETED is the teacher's call, not theirs. Letting a parent choose the
 * status would make the completion figures meaningless.
 */
export const submitHomeworkSchema = z.object({
  studentId: idSchema,
  note: z.string().trim().max(500).optional(),
  fileIds: z.array(idSchema).max(5).optional(),
});
export type SubmitHomeworkInput = z.infer<typeof submitHomeworkSchema>;

export interface HomeworkSummary {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: PublishStatus;
  allowsSubmission: boolean;
  classroom: { id: string; label: string };
  subject: { id: string; name: string } | null;
  assignedBy: string;
  assignedOn: string;
  attachmentCount: number;
  /** Only meaningful once published. */
  progress: { total: number; completed: number; pending: number };
  /**
   * This child's own submission, when the list was asked for on their behalf.
   * Absent for a teacher or admin viewing the class as a whole.
   */
  mySubmission?: {
    id: string;
    status: SubmissionStatus;
    submittedOn: string | null;
    teacherRemark: string | null;
  };
}

export interface SubmissionSummary {
  id: string;
  studentId: string;
  fullName: string;
  rollNo: string | null;
  status: SubmissionStatus;
  submittedOn: string | null;
  teacherRemark: string | null;
  reviewedOn: string | null;
}

/* -------------------------------------------------------------------------- */
/* Class stream                                                               */
/* -------------------------------------------------------------------------- */

export const createClassroomPostSchema = z.object({
  classroomId: idSchema,
  type: z.enum(CLASSROOM_POST_TYPES).default('ANNOUNCEMENT'),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().max(4000).optional(),
  fileIds: z.array(idSchema).max(10).optional(),
});
export type CreateClassroomPostInput = z.infer<typeof createClassroomPostSchema>;

export interface ClassroomPostSummary {
  id: string;
  type: ClassroomPostType;
  title: string;
  body: string | null;
  createdBy: string;
  publishedAt: string;
  attachmentCount: number;
}

/* -------------------------------------------------------------------------- */
/* Notices                                                                    */
/* -------------------------------------------------------------------------- */

export const createNoticeSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    body: z.string().trim().min(2).max(8000),
    type: z.enum(NOTICE_TYPES).default('GENERAL'),
    audience: z.enum(NOTICE_AUDIENCES).default('ALL'),
    classroomIds: z.array(idSchema).max(50).optional(),
    pinned: z.boolean().default(false),
    publishAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    fileIds: z.array(idSchema).max(10).optional(),
    publish: z.boolean().default(true),
  })
  .refine((v) => v.audience !== 'CLASSROOMS' || (v.classroomIds?.length ?? 0) > 0, {
    message: 'Choose at least one classroom for a class-specific notice',
    path: ['classroomIds'],
  })
  .refine((v) => !v.expiresAt || !v.publishAt || v.expiresAt > v.publishAt, {
    message: 'Expiry must be after the publish date',
    path: ['expiresAt'],
  });
export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;

export const listNoticesQuerySchema = paginationQuerySchema.extend({
  type: z.enum(NOTICE_TYPES).optional(),
  status: z.enum(PUBLISH_STATUSES).optional(),
});
export type ListNoticesQuery = z.infer<typeof listNoticesQuerySchema>;

export interface NoticeSummary {
  id: string;
  title: string;
  body: string;
  type: NoticeType;
  audience: NoticeAudience;
  status: PublishStatus;
  pinned: boolean;
  publishAt: string;
  expiresAt: string | null;
  createdBy: string;
  classroomLabels: string[];
  attachmentCount: number;
  /** For the caller. Absent for admins listing every notice. */
  readByMe?: boolean;
  /** Admin view: how many recipients have opened it. */
  readCount?: number;
}
