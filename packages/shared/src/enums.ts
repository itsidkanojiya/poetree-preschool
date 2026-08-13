/**
 * Canonical enum values for the whole platform.
 *
 * These are mirrored by the Prisma enums in `apps/api/prisma/schema.prisma`.
 * If you change a value here, change it there in the same commit — the API
 * casts between the two without a translation layer.
 */

export const ROLES = ['PUBLICATION_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'PARENT'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Roles allowed to sign in to the Next.js portal.
 *
 * Teachers joined at the ERP phase — they need attendance and homework on a
 * desktop as well as in the app. Parents remain app-only; students never sign in
 * at all.
 */
export const PORTAL_ROLES = ['PUBLICATION_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const SCHOOL_STATUSES = ['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED'] as const;
export type SchoolStatus = (typeof SCHOOL_STATUSES)[number];

/** School statuses whose users are allowed to authenticate and use the API. */
export const ACTIVE_SCHOOL_STATUSES: readonly SchoolStatus[] = ['TRIAL', 'ACTIVE'];

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDERS)[number];

export const STUDENT_STATUSES = ['ACTIVE', 'INACTIVE', 'GRADUATED', 'WITHDRAWN'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const GUARDIAN_RELATIONS = ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'] as const;
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

/**
 * The standards a new installation starts with.
 *
 * No longer a closed set: standards are rows the Super Admin adds, renames and
 * reorders, because a school that calls its first year "Toddler" should not
 * need a release. These four are what the seed writes, and nothing at runtime
 * may assume the list stops here — read the name off the row instead.
 */
export const SEED_CLASS_LEVELS = [
  { code: 'PLAY_GROUP', name: 'Play Group', sortOrder: 1 },
  { code: 'NURSERY', name: 'Nursery', sortOrder: 2 },
  { code: 'JUNIOR_KG', name: 'Junior KG', sortOrder: 3 },
  { code: 'SENIOR_KG', name: 'Senior KG', sortOrder: 4 },
] as const;

/* -------------------------------------------------------------------------- */
/* ERP — academic structure                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A student's state within one academic year. Enrolment is per-year, so
 * promoting a child never overwrites last year's record.
 */
export const ENROLMENT_STATUSES = [
  'ACTIVE',
  'PROMOTED',
  'TRANSFERRED',
  'WITHDRAWN',
  'GRADUATED',
] as const;
export type EnrolmentStatus = (typeof ENROLMENT_STATUSES)[number];

export const CLASSROOM_TEACHER_ROLES = [
  'CLASS_TEACHER',
  'ASSISTANT',
  'SUBJECT_TEACHER',
] as const;
export type ClassroomTeacherRole = (typeof CLASSROOM_TEACHER_ROLES)[number];

/**
 * Deliberately short. Preschools do not need period-wise attendance or a reason
 * taxonomy, and every extra option slows the teacher down on the one screen they
 * use every single morning.
 */
export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  LEAVE: 'Leave',
  HALF_DAY: 'Half day',
};

/** Non-teaching days. Excluded from attendance prompts and from percentage denominators. */
export const HOLIDAY_TYPES = ['HOLIDAY', 'VACATION', 'EVENT', 'WEEKLY_OFF'] as const;
export type HolidayType = (typeof HOLIDAY_TYPES)[number];

/* -------------------------------------------------------------------------- */
/* ERP — cross-cutting                                                        */
/* -------------------------------------------------------------------------- */

/** Gapless per-school counters. Receipt numbers must never collide or skip. */
export const SEQUENCE_KINDS = ['ADMISSION', 'RECEIPT', 'INVOICE'] as const;
export type SequenceKind = (typeof SEQUENCE_KINDS)[number];

export const FILE_VISIBILITIES = ['PRIVATE', 'SCHOOL', 'PUBLIC'] as const;
export type FileVisibility = (typeof FILE_VISIBILITIES)[number];

export const STUDENT_DOCUMENT_TYPES = [
  'PHOTO',
  'BIRTH_CERTIFICATE',
  'ADDRESS_PROOF',
  'MEDICAL',
  'TRANSFER_CERTIFICATE',
  'OTHER',
] as const;
export type StudentDocumentType = (typeof STUDENT_DOCUMENT_TYPES)[number];

export const DEVICE_PLATFORMS = ['ANDROID', 'IOS', 'WEB'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/**
 * Drives notification copy, deep links, and the per-school on/off preferences.
 * Adding a type here is what makes it routable — never send an ad-hoc string.
 */
export const NOTIFICATION_TYPES = [
  'ATTENDANCE_ABSENT',
  'HOMEWORK_ASSIGNED',
  'HOMEWORK_REVIEWED',
  'FEE_DUE',
  'FEE_RECEIPT',
  'NOTICE_PUBLISHED',
  'NOTICE_EMERGENCY',
  'CLASSROOM_POST',
  'PROGRESS_UPDATED',
  'ACCOUNT_SECURITY',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const AUDIT_ACTIONS = [
  'SCHOOL_CREATED',
  'SCHOOL_UPDATED',
  'SCHOOL_SUSPENDED',
  'SCHOOL_REACTIVATED',
  'SUBSCRIPTION_ASSIGNED',
  'SCHOOL_ADMIN_CREATED',
  'USER_CREATED',
  'USER_UPDATED',
  'STUDENT_CREATED',
  'STUDENT_UPDATED',
  'STUDENT_DELETED',
  'STUDENTS_IMPORTED',
  'ENROLMENT_CREATED',
  'ENROLMENT_UPDATED',
  'STUDENTS_PROMOTED',
  'STUDENT_WITHDRAWN',
  'ATTENDANCE_MARKED',
  'ATTENDANCE_CORRECTED',
  'FEE_STRUCTURE_UPDATED',
  'FEE_CONCESSION_GRANTED',
  'INVOICES_GENERATED',
  'INVOICE_CANCELLED',
  'PAYMENT_RECORDED',
  'PAYMENT_REFUNDED',
  'HOMEWORK_PUBLISHED',
  'HOMEWORK_DELETED',
  'HOMEWORK_SUBMITTED',
  'NOTICE_PUBLISHED',
  'NOTICE_UPDATED',
  'TIMETABLE_UPDATED',
  'FILE_UPLOADED',
  'FILE_DELETED',
  // A child's birth certificate or medical letter arriving on — or leaving —
  // their record is exactly the kind of thing someone asks about a year later.
  'STUDENT_DOCUMENT_ATTACHED',
  'STUDENT_DOCUMENT_REMOVED',
  'DATA_EXPORTED',
  // The publisher's own catalogue. Not a school's data, but the thing every
  // school's children are scored against, so changes to it are worth keeping.
  'ACTIVITY_CREATED',
  'ACTIVITY_UPDATED',
  // Standards are no longer compiled in, so changing one is an event.
  'STANDARD_CREATED',
  'STANDARD_UPDATED',
  'PASSWORD_CHANGED',
  // Somebody else setting a password on your behalf is a different event from
  // you changing your own, and the one worth being able to look up later.
  'PASSWORD_RESET',
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
