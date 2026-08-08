/**
 * Canonical enum values for the whole platform.
 *
 * These are mirrored by the Prisma enums in `apps/api/prisma/schema.prisma`.
 * If you change a value here, change it there in the same commit — the API
 * casts between the two without a translation layer.
 */

export const ROLES = ['PUBLICATION_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'PARENT'] as const;
export type Role = (typeof ROLES)[number];

/** Roles allowed to sign in to the Next.js portal in Phase 1. */
export const PORTAL_ROLES = ['PUBLICATION_ADMIN', 'SCHOOL_ADMIN'] as const;
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
 * The four preschool levels Poetree publishes for. Global (not per-school) so
 * curriculum and learning content can attach to a level in a later phase.
 */
export const CLASS_LEVEL_CODES = ['PLAY_GROUP', 'NURSERY', 'JUNIOR_KG', 'SENIOR_KG'] as const;
export type ClassLevelCode = (typeof CLASS_LEVEL_CODES)[number];

export const CLASS_LEVEL_LABELS: Record<ClassLevelCode, string> = {
  PLAY_GROUP: 'Play Group',
  NURSERY: 'Nursery',
  JUNIOR_KG: 'Junior KG',
  SENIOR_KG: 'Senior KG',
};

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
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
