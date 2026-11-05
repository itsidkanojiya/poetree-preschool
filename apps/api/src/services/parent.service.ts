import type { Prisma } from '@prisma/client';
import type {
  AddParentRoleInput,
  CreateParentInput,
  ListUsersQuery,
  Paginated,
  ParentSummary,
  UpdateParentInput,
} from '@poetree/shared';
import { prisma, type TenantTransactionClient } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { hashPassword } from '../lib/password.js';
import { paginate, toSkipTake } from '../lib/pagination.js';
import { writeAuditLog } from './audit.service.js';
import { endAllSessions } from './auth.service.js';
import { existingAccount, holdsParent, profileRoles, rolesHeld } from './roles.service.js';
import { studentName } from '../lib/names.js';

/**
 * Parents own the family's login. Students hang off a parent account and never
 * hold credentials of their own — in Phase 2 the parent taps a child's avatar
 * after signing in.
 *
 * A parent is an account holding a parent profile the school has not removed.
 * The same account may teach here too; removing the parent leaves the teacher
 * as they were.
 */

/** A child's other parents who are still active, for the warning on removal. */
const activeGuardians = {
  where: { parentProfile: { removedAt: null, user: { deletedAt: null } } },
};

const parentInclude = {
  parentProfile: {
    include: {
      children: {
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              _count: { select: { guardians: activeGuardians } },
            },
          },
        },
      },
    },
  },
  teacherProfile: { select: { removedAt: true } },
} satisfies Prisma.UserInclude;

type ParentRow = Prisma.UserGetPayload<{ include: typeof parentInclude }>;

function toSummary(user: ParentRow): ParentSummary {
  const profile = user.parentProfile;
  // Whether this parent is one of the active guardians being counted.
  const selfActive = profile !== null && profile.removedAt === null && user.deletedAt === null;
  return {
    id: profile?.id ?? user.id,
    userId: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    relation: profile?.relation ?? 'GUARDIAN',
    occupation: profile?.occupation ?? null,
    address: profile?.address ?? null,
    children: (profile?.children ?? []).map((link) => ({
      id: link.student.id,
      name: studentName(link.student),
      isPrimary: link.isPrimary,
      hasOtherGuardian: link.student._count.guardians - (selfActive ? 1 : 0) > 0,
    })),
    isTeacher: rolesHeld(user).includes('TEACHER'),
    removedAt: profile?.removedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function listParents(query: ListUsersQuery): Promise<Paginated<ParentSummary>> {
  // Removed ones only on request, for the screen that puts them back.
  const where: Prisma.UserWhereInput =
    query.removed === 'true'
      ? { parentProfile: { is: { removedAt: { not: null } } }, deletedAt: undefined }
      : { ...holdsParent };
  if (query.status) where.status = query.status;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search } },
      { email: { contains: query.search } },
      { phone: { contains: query.search } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: parentInclude,
      orderBy: { name: 'asc' },
      ...toSkipTake(query),
    }),
    prisma.user.count({ where }),
  ]);

  return paginate(rows.map(toSummary), total, query);
}

/** One parent — removed ones too, so the portal can show them and put them back. */
export async function getParent(userId: string): Promise<ParentSummary> {
  const user = await prisma.user.findFirst({
    where: { id: userId, parentProfile: { isNot: null }, deletedAt: undefined },
    include: parentInclude,
  });
  if (!user) throw ApiError.notFound('Parent not found');
  return toSummary(user);
}

/**
 * Refuses a second account for somebody the school already has, saying who
 * they are so the portal can offer the right way instead.
 */
async function assertNoAccount(match: { email?: string | null; phone?: string | null }) {
  const clash = await existingAccount(match);
  if (!clash) return;

  if (clash.removed) {
    throw ApiError.conflict(
      `${clash.name} was removed from your school and still holds that phone or email. ` +
        'Restore them instead of adding them again.',
      { existingAccount: clash },
    );
  }
  if (clash.roles.includes('PARENT')) {
    throw ApiError.conflict(`${clash.name} is already a parent at your school.`, {
      existingAccount: clash,
    });
  }
  if (clash.roles.includes('TEACHER')) {
    throw ApiError.conflict(
      `${clash.name} already teaches here with that phone or email. ` +
        'Add the parent role to their account rather than opening a second one.',
      { existingAccount: clash },
    );
  }
  throw ApiError.conflict('A user with that phone or email already exists at your school', {
    existingAccount: clash,
  });
}

export async function createParent(
  input: CreateParentInput,
  actorUserId: string,
): Promise<ParentSummary> {
  const schoolId = requireSchoolId();

  await assertNoAccount({ phone: input.phone, email: input.email });

  const passwordHash = await hashPassword(input.password);

  const userId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        schoolId,
        scopeKey: schoolId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone,
        passwordHash,
        role: 'PARENT',
        status: 'ACTIVE',
      },
    });

    await tx.parentProfile.create({
      data: {
        userId: user.id,
        schoolId,
        relation: input.relation,
        occupation: input.occupation ?? null,
        address: input.address ?? null,
      },
    });

    return user.id;
  });

  await writeAuditLog({
    action: 'USER_CREATED',
    entity: 'User',
    entityId: userId,
    schoolId,
    actorUserId,
    metadata: { role: 'PARENT', phone: input.phone },
  });

  return getParent(userId);
}

/**
 * A teacher here whose own child joins the school, on the account they have.
 * Their sign-in and password stay; they gain the parent role, and the app
 * offers a switch between the two.
 */
export async function addParentRole(
  userId: string,
  input: AddParentRoleInput,
  actorUserId: string,
): Promise<ParentSummary> {
  const schoolId = requireSchoolId();
  await grantParentRole(userId, input);

  await writeAuditLog({
    action: 'ROLE_ADDED',
    entity: 'User',
    entityId: userId,
    schoolId,
    actorUserId,
    metadata: { role: 'PARENT' },
  });

  return getParent(userId);
}

/**
 * Gives a teacher's account the parent role and returns its parent profile —
 * the one they had, if they were a parent here once and were removed.
 *
 * Shared with registration approval, which does the same for a teacher whose
 * child's registration the office accepts.
 */
export async function grantParentRole(
  userId: string,
  input: Partial<AddParentRoleInput>,
  client?: TenantTransactionClient,
): Promise<string> {
  if (!client) return prisma.$transaction((tx) => grantParentRole(userId, input, tx));

  const schoolId = requireSchoolId();

  const user = await client.user.findFirst({
    where: { id: userId, schoolId, deletedAt: null },
    select: {
      id: true,
      role: true,
      parentProfile: { select: { id: true, removedAt: true } },
      teacherProfile: { select: { removedAt: true } },
    },
  });
  if (!user) throw ApiError.notFound('Account not found');

  const held = rolesHeld(user);
  if (held.includes('PARENT') && user.parentProfile) return user.parentProfile.id;
  if (!held.includes('TEACHER')) {
    throw ApiError.badRequest('Only a teacher’s account can be given the parent role.');
  }

  const details = {
    relation: input.relation ?? 'GUARDIAN',
    occupation: input.occupation ?? null,
    address: input.address ?? null,
  };
  if (user.parentProfile) {
    await client.parentProfile.update({
      where: { id: user.parentProfile.id },
      data: { ...details, removedAt: null },
    });
    return user.parentProfile.id;
  }
  const profile = await client.parentProfile.create({
    data: { userId, schoolId, ...details },
    select: { id: true },
  });
  return profile.id;
}

export async function updateParent(
  userId: string,
  input: UpdateParentInput,
  actorUserId: string,
): Promise<ParentSummary> {
  const schoolId = requireSchoolId();

  const existing = await prisma.user.findFirst({
    where: { id: userId, ...holdsParent },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Parent not found');

  const { relation, occupation, address, ...userFields } = input;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(userFields).length > 0) {
      await tx.user.update({
        where: { id: userId, schoolId },
        data: {
          name: userFields.name,
          email: userFields.email,
          phone: userFields.phone,
          status: userFields.status,
        },
      });
    }

    if (relation !== undefined || occupation !== undefined || address !== undefined) {
      await tx.parentProfile.updateMany({
        where: { userId, schoolId },
        data: {
          relation: relation ?? undefined,
          occupation: occupation ?? undefined,
          address: address ?? undefined,
        },
      });
    }
  });

  // Deactivated or suspended: out now, not when their token next expires.
  if (userFields.status && userFields.status !== 'ACTIVE') {
    await endAllSessions(userId, 'DEACTIVATED');
  }

  await writeAuditLog({
    action: 'USER_UPDATED',
    entity: 'User',
    entityId: userId,
    schoolId,
    actorUserId,
    metadata: { role: 'PARENT', fields: Object.keys(input) },
  });

  return getParent(userId);
}

/**
 * The school taking a parent off.
 *
 * Their children are never touched — not one record of theirs changes — and
 * the links to them are kept, inert, so restoring the parent puts the family
 * back as it was. The parent is signed out, cannot sign in, and is told
 * nothing more about the children. Someone who also teaches here keeps that:
 * only the parent role goes.
 */
export async function removeParent(userId: string, actorUserId: string): Promise<ParentSummary> {
  const schoolId = requireSchoolId();

  const user = await prisma.user.findFirst({
    where: { id: userId, ...holdsParent },
    select: { id: true, name: true, role: true, ...profileRoles },
  });
  if (!user) throw ApiError.notFound('Parent not found');

  const stillTeacher = rolesHeld(user).includes('TEACHER');
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.parentProfile.updateMany({ where: { userId, schoolId }, data: { removedAt: now } });

    if (!stillTeacher) {
      await tx.user.update({
        where: { id: userId, schoolId },
        data: { deletedAt: now, status: 'INACTIVE' },
      });
    } else if (user.role === 'PARENT') {
      await tx.user.update({ where: { id: userId, schoolId }, data: { role: 'TEACHER' } });
    }
  });

  await endAllSessions(userId, 'REMOVED_BY_SCHOOL');

  await writeAuditLog({
    action: 'USER_REMOVED',
    entity: 'User',
    entityId: userId,
    schoolId,
    actorUserId,
    metadata: { role: 'PARENT', name: user.name, keptAsTeacher: stillTeacher },
  });

  return getParent(userId);
}

/** Putting a removed parent back, with their children as they were. */
export async function restoreParent(userId: string, actorUserId: string): Promise<ParentSummary> {
  const schoolId = requireSchoolId();

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      parentProfile: { is: { removedAt: { not: null } } },
      deletedAt: undefined,
    },
    select: { id: true, deletedAt: true },
  });
  if (!user) throw ApiError.notFound('There is no removed parent with that id');

  await prisma.$transaction(async (tx) => {
    await tx.parentProfile.updateMany({ where: { userId, schoolId }, data: { removedAt: null } });
    if (user.deletedAt) {
      await tx.user.update({
        where: { id: userId, schoolId },
        data: { deletedAt: null, status: 'ACTIVE' },
      });
    }
  });

  await writeAuditLog({
    action: 'USER_RESTORED',
    entity: 'User',
    entityId: userId,
    schoolId,
    actorUserId,
    metadata: { role: 'PARENT' },
  });

  return getParent(userId);
}
