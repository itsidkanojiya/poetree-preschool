import { z } from 'zod';
import {
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
  /**
   * By id, not by code. Standards are rows the Super Admin maintains, so the
   * set is open and an enum of four could not describe it.
   */
  classLevelId: idSchema,
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

/**
 * The teacher's own details, for a person who already has an account here as a
 * parent: the account, its password and its sign-in stay as they are.
 */
export const addTeacherRoleSchema = createTeacherSchema.pick({
  employeeCode: true,
  qualification: true,
  joinedAt: true,
});
export type AddTeacherRoleInput = z.infer<typeof addTeacherRoleSchema>;

export const updateTeacherSchema = createTeacherSchema
  .omit({ password: true })
  .partial()
  .extend({
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

/** The same the other way round: a teacher here who is also a parent. */
export const addParentRoleSchema = createParentSchema.pick({
  relation: true,
  occupation: true,
  address: true,
});
export type AddParentRoleInput = z.infer<typeof addParentRoleSchema>;

export const updateParentSchema = createParentSchema
  .omit({ password: true })
  .partial()
  .extend({
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
    /**
     * Three parts, the way a school form in India asks for them: given name,
     * father's name, surname — "Dishan Krunal Patel". The middle one is a
     * person, not a spelling, so it has a field of its own rather than being
     * run into the surname where nothing could separate it again.
     */
    firstName: z.string().trim().min(1).max(60),
    middleName: z.string().trim().max(60).optional(),
    lastName: z.string().trim().max(60).optional(),
    dateOfBirth: z.coerce.date(),
    gender: z.enum(GENDERS),
    admissionNo: z.string().trim().min(1).max(40),
    rollNo: z.string().trim().max(20).optional(),
    classroomId: idSchema.nullable().optional(),
    avatarUrl: urlSchema.optional(),
    bloodGroup: z.string().trim().max(8).optional(),
    guardians: z.array(guardianLinkSchema).max(4).default([]),
    /**
     * A parent the school does not have yet, opened with the child so the
     * office types the family in once. They become the primary guardian.
     */
    newParent: createParentSchema.optional(),
  })
  .refine((v) => v.guardians.length > 0 || v.newParent !== undefined, {
    message: 'Link at least one guardian',
    path: ['guardians'],
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

/**
 * Linking a parent to a child from the child's page: one the school already
 * has, or a new one opened there and then.
 */
export const addGuardianSchema = z
  .object({
    parentProfileId: idSchema.optional(),
    parent: createParentSchema.optional(),
    relation: z.enum(GUARDIAN_RELATIONS).default('GUARDIAN'),
    isPrimary: z.boolean().default(false),
  })
  .refine((v) => (v.parentProfileId === undefined) !== (v.parent === undefined), {
    message: 'Choose a parent already at the school, or give a new parent’s details',
    path: ['parentProfileId'],
  });
export type AddGuardianInput = z.infer<typeof addGuardianSchema>;

/** How a linked parent stands to the child: their relation, or becoming the main contact. */
export const updateGuardianSchema = z
  .object({
    relation: z.enum(GUARDIAN_RELATIONS).optional(),
    isPrimary: z.literal(true).optional(),
  })
  .refine((v) => v.relation !== undefined || v.isPrimary !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;

/** A text field that may be cleared: null empties it, absent leaves it. */
const clearable = (max: number) => z.string().trim().max(max).nullable().optional();

/**
 * Everything about a child the office may change — all of it, verified or not,
 * because a verified record still needs correcting when a family moves house.
 * Every change is recorded with what it was and what it became. The admission
 * number is not here: it is the key a returning child is matched on.
 */
export const updateStudentSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  middleName: clearable(60),
  lastName: clearable(60),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(GENDERS).optional(),
  rollNo: z.string().trim().max(20).optional(),
  classroomId: idSchema.nullable().optional(),
  avatarUrl: urlSchema.optional(),
  bloodGroup: clearable(8),
  status: z.enum(STUDENT_STATUSES).optional(),
  guardians: z.array(guardianLinkSchema).min(1).max(4).optional(),
  addressLine1: clearable(200),
  addressLine2: clearable(200),
  city: clearable(100),
  postalCode: clearable(20),
  emergencyContactName: clearable(120),
  emergencyContactPhone: z
    .union([phoneSchema, z.literal('').transform(() => null)])
    .nullable()
    .optional(),
  allergies: clearable(2000),
  medicalNotes: clearable(2000),
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

/**
 * `removed=true` lists only those the school has removed, for the screen that
 * puts them back. Without it, removed rows never appear.
 */
const removedFlag = z.enum(['true', 'false']).optional();

export const listStudentsQuerySchema = paginationQuerySchema.extend({
  classroomId: idSchema.optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
  removed: removedFlag,
});
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(USER_STATUSES).optional(),
  removed: removedFlag,
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
  /** Their signature, printed on the report cards of classes they teach. */
  signatureUrl: string | null;
  /** True when the same account is also a parent here. */
  isParent: boolean;
  /** When the school took them off its teachers. Null while they teach. */
  removedAt: string | null;
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
  children: Array<{
    id: string;
    name: string;
    isPrimary: boolean;
    /**
     * Whether the child has another parent here who is still active. False
     * means removing this one leaves the child with nobody to sign in for
     * them, which the portal warns about before it happens.
     */
    hasOtherGuardian: boolean;
    /** Removed from the roll — with this parent, or on their own. */
    removed: boolean;
  }>;
  /** True when the same account is also a teacher here. */
  isTeacher: boolean;
  /** When the school took them off its parents. Null while active. */
  removedAt: string | null;
  createdAt: string;
}

/**
 * Who already holds a phone number or email the school typed in, sent with the
 * 409 that refuses a second account for them. The portal offers to add the
 * role to this account — or, for a removed one, to restore it — instead.
 */
export interface ExistingAccount {
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  roles: Array<'TEACHER' | 'PARENT' | 'SCHOOL_ADMIN' | 'ORG_ADMIN' | 'PUBLICATION_ADMIN'>;
  /** True when the school removed this account; restoring it is the way back. */
  removed: boolean;
}

/** Null clears it. */
export const setStudentPhotoSchema = z.object({ fileId: idSchema.nullable() });
export type SetStudentPhotoInput = z.infer<typeof setStudentPhotoSchema>;

export interface StudentSummary {
  id: string;
  admissionNo: string;
  firstName: string;
  /** The father's given name — the middle part of "Dishan Krunal Patel". */
  middleName: string | null;
  lastName: string | null;
  fullName: string;
  dateOfBirth: string;
  gender: (typeof GENDERS)[number];
  rollNo: string | null;
  avatarUrl: string | null;
  bloodGroup: string | null;
  status: (typeof STUDENT_STATUSES)[number];
  classroom: {
    id: string;
    label: string;
    /** "JUNIOR KG" — the standard, apart from the section. */
    standard: string;
    section: string;
    academicYear: string;
  } | null;
  guardians: Array<{
    parentProfileId: string;
    /** The parent's account, for opening and managing them. */
    userId: string;
    name: string;
    phone: string | null;
    relation: (typeof GUARDIAN_RELATIONS)[number];
    isPrimary: boolean;
  }>;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  allergies: string | null;
  medicalNotes: string | null;
  /**
   * When the school verified the child — approved the family's registration
   * for them. Null for a child the office entered itself.
   */
  verification: { verifiedAt: string; verifiedBy: string | null } | null;
  /** When the school removed the child. Null while on the roll. */
  removedAt: string | null;
  /**
   * The parent whose removal took the child with them — their only parent
   * here. Restoring that parent brings the child back. Null otherwise.
   */
  removedWithParent: { userId: string; name: string } | null;
  createdAt: string;
}

/** One change to a child's record: who, when, and each field from what to what. */
export interface StudentChange {
  id: string;
  action: string;
  at: string;
  by: string | null;
  changes: Array<{ field: string; before: string | null; after: string | null }>;
}

export interface ClassroomSummary {
  id: string;
  section: string;
  capacity: number | null;
  /**
   * The id is carried as well as the name because standards are rows now: an
   * edit form has to preselect one, and matching on a name a Super Admin can
   * change is not a key.
   */
  classLevel: { id: string; code: string; name: string };
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
