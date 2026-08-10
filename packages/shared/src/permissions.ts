import type { Role } from './enums.js';

/**
 * Granular permissions, checked on every mutating route.
 *
 * Deliberately a static matrix rather than database-driven RBAC: there are five
 * fixed roles and one product, so a permissions admin UI, its seeding, its cache
 * and a migration per new permission would all be cost with no benefit. Being a
 * constant makes it compile-time checked, greppable and testable.
 *
 * Revisit only if a school asks for custom roles — for example an accountant who
 * sees fees but not children.
 */
export const PERMISSIONS = [
  // Publication scope
  'school:read_all',
  'school:manage',
  'plan:manage',
  'content:manage',

  // School administration
  'student:read',
  'student:create',
  'student:update',
  'student:delete',
  'student:import',
  'enrolment:manage',

  'teacher:read',
  'teacher:manage',
  'parent:read',
  'parent:manage',

  'classroom:read',
  'classroom:manage',
  'academic_year:manage',
  'holiday:manage',

  // Attendance
  'attendance:read',
  'attendance:mark',
  'attendance:correct',

  // Fees
  'fee:read',
  'fee:manage_structure',
  'fee:generate_invoice',
  'fee:record_payment',
  'fee:refund',
  'fee:cancel_invoice',

  // Teaching
  'homework:read',
  'homework:manage',
  'homework:review',
  'classroom_post:manage',
  'timetable:read',
  'timetable:manage',

  // Communication
  'notice:read',
  'notice:manage',

  // Progress
  'progress:read',
  'progress:annotate',
  // Recording an attempt is not the same as reading progress: the figures must
  // come from activities actually completed, not from anyone who can see them.
  // Held by the app's two audiences - a parent whose child is playing, and a
  // teacher on a classroom device.
  'progress:record',

  // Cross-cutting
  'report:view',
  'report:export',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PUBLICATION_ADMIN: Permission[] = [
  'school:read_all',
  'school:manage',
  'plan:manage',
  'content:manage',
  'student:read',
  'teacher:read',
  'parent:read',
  'classroom:read',
  'progress:read',
  'report:view',
  'report:export',
  'audit:read',
];

const SCHOOL_ADMIN: Permission[] = [
  'student:read',
  'student:create',
  'student:update',
  'student:delete',
  'student:import',
  'enrolment:manage',
  'teacher:read',
  'teacher:manage',
  'parent:read',
  'parent:manage',
  'classroom:read',
  'classroom:manage',
  'academic_year:manage',
  'holiday:manage',
  'attendance:read',
  'attendance:mark',
  'attendance:correct',
  'fee:read',
  'fee:manage_structure',
  'fee:generate_invoice',
  'fee:record_payment',
  'fee:refund',
  'fee:cancel_invoice',
  'homework:read',
  'timetable:read',
  'timetable:manage',
  'notice:read',
  'notice:manage',
  'progress:read',
  'report:view',
  'report:export',
  'audit:read',
];

/**
 * A teacher's permissions are further narrowed at the row level: holding
 * `homework:manage` does not grant access to a classroom they are not assigned
 * to. See `assertTeacherOwnsClassroom` in the API.
 */
const TEACHER: Permission[] = [
  'student:read',
  'parent:read',
  'classroom:read',
  'attendance:read',
  'attendance:mark',
  'homework:read',
  'homework:manage',
  'homework:review',
  'classroom_post:manage',
  'timetable:read',
  'notice:read',
  'notice:manage',
  'progress:read',
  'progress:annotate',
  // Recording an attempt is not the same as reading progress: the figures must
  // come from activities actually completed, not from anyone who can see them.
  // Held by the app's two audiences - a parent whose child is playing, and a
  // teacher on a classroom device.
  'progress:record',
  'report:view',
];

/** Parents read their own children and nothing else. */
const PARENT: Permission[] = [
  'student:read',
  'attendance:read',
  'fee:read',
  'homework:read',
  'timetable:read',
  'notice:read',
  'progress:read',
  // A child has no login, so their attempts are recorded through the parent's
  // session while they play. The service still checks the parent is that
  // child's guardian — the permission alone would let them post scores for any
  // child in the school.
  'progress:record',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PUBLICATION_ADMIN,
  SCHOOL_ADMIN,
  TEACHER,
  PARENT,
};

const PERMISSION_SETS: Record<Role, ReadonlySet<Permission>> = {
  PUBLICATION_ADMIN: new Set(PUBLICATION_ADMIN),
  SCHOOL_ADMIN: new Set(SCHOOL_ADMIN),
  TEACHER: new Set(TEACHER),
  PARENT: new Set(PARENT),
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return PERMISSION_SETS[role]?.has(permission) ?? false;
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
