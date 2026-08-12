import { z } from 'zod';
import {
  CLASS_LEVEL_CODES,
  GENDERS,
  GUARDIAN_RELATIONS,
  STUDENT_DOCUMENT_TYPES,
  STUDENT_STATUSES,
  USER_STATUSES,
} from '../enums.js';
import {
  emailSchema,
  idSchema,
  nameSchema,
  paginationQuerySchema,
  passwordSchema,
  phoneSchema,
  urlSchema,
} from './common.js';

/* -------------------------------------------------------------------------- */
/* Academic year                                                              */
/* -------------------------------------------------------------------------- */

export const createAcademicYearSchema = z
  .object({
    name: z.string().trim().min(4).max(40),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.endDate > v.startDate, {
    message: 'End date must be after the start date',
    path: ['endDate'],
  });
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;

/* -------------------------------------------------------------------------- */
/* Classroom                                                                  */
/* -------------------------------------------------------------------------- */

export const createClassroomSchema = z.object({
  academicYearId: idSchema,
  classLevelCode: z.enum(CLASS_LEVEL_CODES),
  /** "A", "B", "Sunflower" — free text, unique per level per academic year. */
  section: z.string().trim().min(1).max(40),
  classTeacherId: idSchema.nullable().optional(),
  capacity: z.number().int().min(1).max(200).optional(),
});
export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;

export const updateClassroomSchema = createClassroomSchema.partial().omit({ academicYearId: true });
export type UpdateClassroomInput = z.infer<typeof updateClassroomSchema>;

/* -------------------------------------------------------------------------- */
/* Teacher                                                                    */
/* -------------------------------------------------------------------------- */

export const createTeacherSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  /** Teachers cannot sign in until Phase 2, but the credential is set up now. */
  password: passwordSchema,
  employeeCode: z.string().trim().max(40).optional(),
  qualification: z.string().trim().max(160).optional(),
  joinedAt: z.coerce.date().optional(),
});
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;

export const updateTeacherSchema = createTeacherSchema.omit({ password: true }).partial().extend({
  status: z.enum(USER_STATUSES).optional(),
});
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;

/* -------------------------------------------------------------------------- */
/* Parent                                                                     */
/* -------------------------------------------------------------------------- */

export const createParentSchema = z.object({
  name: nameSchema,
  email: emailSchema.optional(),
  phone: phoneSchema,
  password: passwordSchema,
  relation: z.enum(GUARDIAN_RELATIONS).default('GUARDIAN'),
  occupation: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
});
export type CreateParentInput = z.infer<typeof createParentSchema>;

export const updateParentSchema = createParentSchema.omit({ password: true }).partial().extend({
  status: z.enum(USER_STATUSES).optional(),
});
export type UpdateParentInput = z.infer<typeof updateParentSchema>;

/* -------------------------------------------------------------------------- */
/* Student — no credentials, ever. Reached through a guardian's account.       */
/* -------------------------------------------------------------------------- */

export const guardianLinkSchema = z.object({
  parentProfileId: idSchema,
  relation: z.enum(GUARDIAN_RELATIONS).default('GUARDIAN'),
  isPrimary: z.boolean().default(false),
});

export const createStudentSchema = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().max(60).optional(),
    dateOfBirth: z.coerce.date(),
    gender: z.enum(GENDERS),
    admissionNo: z.string().trim().min(1).max(40),
    rollNo: z.string().trim().max(20).optional(),
    classroomId: idSchema.nullable().optional(),
    avatarUrl: urlSchema.optional(),
    bloodGroup: z.string().trim().max(8).optional(),
    guardians: z.array(guardianLinkSchema).min(1, 'Link at least one guardian').max(4),
  })
  .refine((v) => v.guardians.filter((g) => g.isPrimary).length <= 1, {
    message: 'Only one guardian can be marked primary',
    path: ['guardians'],
  })
  .refine((v) => new Set(v.guardians.map((g) => g.parentProfileId)).size === v.guardians.length, {
    message: 'The same guardian is linked more than once',
    path: ['guardians'],
  });
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(GENDERS).optional(),
  rollNo: z.string().trim().max(20).optional(),
  classroomId: idSchema.nullable().optional(),
  avatarUrl: urlSchema.optional(),
  bloodGroup: z.string().trim().max(8).optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
  guardians: z.array(guardianLinkSchema).min(1).max(4).optional(),
});
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

/**
 * Attaching an already-uploaded file to a child.
 *
 * The upload happens first, through POST /files, so content sniffing and the
 * per-type size caps apply here without being restated. All this carries is
 * what the file *is*.
 */
export const attachDocumentSchema = z.object({
  fileId: idSchema,
  type: z.enum(STUDENT_DOCUMENT_TYPES),
  label: z.string().trim().max(120).optional(),
});
export type AttachDocumentInput = z.infer<typeof attachDocumentSchema>;

export interface StudentDocumentSummary {
  id: string;
  type: (typeof STUDENT_DOCUMENT_TYPES)[number];
  label: string | null;
  createdAt: string;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
  };
}

export const listStudentsQuerySchema = paginationQuerySchema.extend({
  classroomId: idSchema.optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
});
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(USER_STATUSES).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Response shapes                                                            */
/* -------------------------------------------------------------------------- */

export interface TeacherSummary {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: (typeof USER_STATUSES)[number];
  employeeCode: string | null;
  qualification: string | null;
  joinedAt: string | null;
  classroomCount: number;
  createdAt: string;
}

export interface ParentSummary {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: (typeof USER_STATUSES)[number];
  relation: (typeof GUARDIAN_RELATIONS)[number];
  occupation: string | null;
  address: string | null;
  children: Array<{ id: string; name: string; isPrimary: boolean }>;
  createdAt: string;
}

/** Null clears it. */
export const setStudentPhotoSchema = z.object({ fileId: idSchema.nullable() });
export type SetStudentPhotoInput = z.infer<typeof setStudentPhotoSchema>;

export interface StudentSummary {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  dateOfBirth: string;
  gender: (typeof GENDERS)[number];
  rollNo: string | null;
  avatarUrl: string | null;
  bloodGroup: string | null;
  status: (typeof STUDENT_STATUSES)[number];
  classroom: { id: string; label: string } | null;
  guardians: Array<{
    parentProfileId: string;
    name: string;
    phone: string | null;
    relation: (typeof GUARDIAN_RELATIONS)[number];
    isPrimary: boolean;
  }>;
  createdAt: string;
}

export interface ClassroomSummary {
  id: string;
  section: string;
  capacity: number | null;
  classLevel: { code: (typeof CLASS_LEVEL_CODES)[number]; name: string };
  academicYear: { id: string; name: string; isCurrent: boolean };
  classTeacher: { id: string; name: string } | null;
  studentCount: number;
}

export interface AcademicYearSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  classroomCount: number;
}
