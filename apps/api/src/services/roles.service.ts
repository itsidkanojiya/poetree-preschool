import type { Prisma } from '@prisma/client';
import type { ExistingAccount, Role } from '@poetree/shared';
import { prisma } from '../db/prisma.js';

/**
 * Who holds which role.
 *
 * An account's `role` column is the one it was opened with. A teacher who is
 * also a parent at the same school — or a parent who comes to teach there —
 * holds both, on the one account, through the two profiles: a TeacherProfile
 * makes someone a teacher here and a ParentProfile a parent, until the school
 * takes it away (`removedAt`). One phone number, one password, one person; the
 * session says which of the two they are acting as at the moment.
 *
 * Office roles have no profile and hold only their own.
 */

/** Holds the teacher role: a teacher profile the school has not removed. */
export const holdsTeacher = {
  teacherProfile: { is: { removedAt: null } },
} satisfies Prisma.UserWhereInput;

/** Holds the parent role: a parent profile the school has not removed. */
export const holdsParent = {
  parentProfile: { is: { removedAt: null } },
} satisfies Prisma.UserWhereInput;

/** Either of the two, for an audience of both. */
export function holdingAny(roles: ReadonlyArray<'TEACHER' | 'PARENT'>): Prisma.UserWhereInput {
  return { OR: roles.map((role) => (role === 'TEACHER' ? holdsTeacher : holdsParent)) };
}

/** What [rolesHeld] needs to know about an account. */
export interface WithProfiles {
  role: string;
  teacherProfile?: { removedAt: Date | null } | null;
  parentProfile?: { removedAt: Date | null } | null;
}

/** The profiles' removal dates, which is all [rolesHeld] reads. */
export const profileRoles = {
  teacherProfile: { select: { removedAt: true } },
  parentProfile: { select: { removedAt: true } },
} satisfies Prisma.UserSelect;

export function rolesHeld(user: WithProfiles): Role[] {
  if (user.role !== 'TEACHER' && user.role !== 'PARENT') return [user.role as Role];

  const roles: Role[] = [];
  if (user.teacherProfile && !user.teacherProfile.removedAt) roles.push('TEACHER');
  if (user.parentProfile && !user.parentProfile.removedAt) roles.push('PARENT');
  // An account with neither profile at all predates profiles carrying the
  // role, and keeps the one it was opened with.
  if (roles.length === 0 && !user.teacherProfile && !user.parentProfile) {
    roles.push(user.role as Role);
  }
  return roles;
}

/** The role a new sign-in starts as: the account's own, while it still holds it. */
export function defaultRole(user: WithProfiles): Role {
  const held = rolesHeld(user);
  return held.includes(user.role as Role) ? (user.role as Role) : (held[0] ?? (user.role as Role));
}

/**
 * The account at this school that already has this email or phone, if any —
 * including one the school removed, which is the way back for that person
 * rather than a second account.
 *
 * Scoped to the caller's school by the client, and `deletedAt` is named on
 * purpose so removed accounts are found too.
 */
export async function existingAccount(match: {
  email?: string | null;
  phone?: string | null;
}): Promise<ExistingAccount | null> {
  const or: Prisma.UserWhereInput[] = [
    ...(match.email ? [{ email: match.email }] : []),
    ...(match.phone ? [{ phone: match.phone }] : []),
  ];
  if (or.length === 0) return null;

  const user = await prisma.user.findFirst({
    where: { OR: or, deletedAt: undefined },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      deletedAt: true,
      ...profileRoles,
    },
  });
  if (!user) return null;

  return {
    userId: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    roles: user.deletedAt ? [] : rolesHeld(user),
    removed: user.deletedAt !== null,
  };
}
