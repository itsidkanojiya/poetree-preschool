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
import { getPlanLimits } from './plan.service.js';
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
              deletedAt: true,
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
      removed: link.student.deletedAt !== null,
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
export async function assertNoAccount(match: { email?: string | null; phone?: string | null }) {
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
  const { userId } = await prisma.$transaction((tx) =>
    createParentRecords(tx, schoolId, input, passwordHash),
  );
  await auditParentCreated(userId, input, actorUserId);

  return getParent(userId);
}

/**
 * The account and profile of a new parent, inside a transaction the caller
 * owns — so a child added with a new parent is both or neither. Checking that
 * nobody holds the phone or email (`assertNoAccount`) and hashing the password
 * are the caller's, before the transaction opens.
 */
export async function createParentRecords(
  tx: TenantTransactionClient,
  schoolId: string,
  input: CreateParentInput,
  passwordHash: string,
): Promise<{ userId: string; profileId: string }> {
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

  const profile = await tx.parentProfile.create({
    data: {
      userId: user.id,
      schoolId,
      relation: input.relation,
      occupation: input.occupation ?? null,
      address: input.address ?? null,
    },
    select: { id: true },
  });

  return { userId: user.id, profileId: profile.id };
}

export async function auditParentCreated(
  userId: string,
  input: CreateParentInput,
  actorUserId: string,
): Promise<void> {
  await writeAuditLog({
    action: 'USER_CREATED',
    entity: 'User',
    entityId: userId,
    schoolId: requireSchoolId(),
    actorUserId,
    metadata: { role: 'PARENT', phone: input.phone },
  });
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
    select: { id: true, phone: true, email: true },
  });
  if (!existing) throw ApiError.notFound('Parent not found');

  // A new phone or email is their sign-in, so it cannot be somebody else's.
  const changedPhone = input.phone !== undefined && input.phone !== existing.phone;
  const changedEmail = input.email !== undefined && input.email !== existing.email;
  if (changedPhone || changedEmail) {
    const clash = await existingAccount({
      phone: changedPhone ? input.phone : null,
      email: changedEmail ? input.email : null,
    });
    if (clash && clash.userId !== userId) {
      throw ApiError.conflict(`${clash.name} already has that phone or email at your school.`, {
        existingAccount: clash,
      });
    }
  }

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
 * No child is left on the roll with nobody to reach: a child for whom this was
 * the only parent here is removed with them — hidden, every record kept — and
 * comes back when the parent is restored. A child with another parent stays,
 * and if this one was the main contact, another parent becomes it.
 *
 * The links are kept, inert, so restoring the parent puts the family back. The
 * parent is signed out and cannot sign in. Someone who also teaches here keeps
 * that: only the parent role goes.
 */
export async function removeParent(userId: string, actorUserId: string): Promise<ParentSummary> {
  const schoolId = requireSchoolId();

  const user = await prisma.user.findFirst({
    where: { id: userId, ...holdsParent },
    select: { id: true, name: true, role: true, ...profileRoles },
  });
  if (!user) throw ApiError.notFound('Parent not found');

  const profile = await prisma.parentProfile.findFirstOrThrow({
    where: { userId },
    select: {
      id: true,
      children: {
        where: { student: { deletedAt: null } },
        select: {
          id: true,
          isPrimary: true,
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              status: true,
              // The child's other parents who are still here.
              guardians: {
                where: {
                  parentProfile: { removedAt: null, user: { deletedAt: null } },
                  NOT: { parentProfile: { userId } },
                },
                select: { id: true, isPrimary: true },
              },
            },
          },
        },
      },
    },
  });

  const alone = profile.children.filter((link) => link.student.guardians.length === 0);
  // Children staying with another parent who lose their main contact.
  const handOver = profile.children.filter(
    (link) =>
      link.student.guardians.length > 0 &&
      link.isPrimary &&
      !link.student.guardians.some((other) => other.isPrimary),
  );

  const stillTeacher = rolesHeld(user).includes('TEACHER');
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.parentProfile.updateMany({ where: { userId, schoolId }, data: { removedAt: now } });

    // Withdrawn and hidden exactly as removing the child by hand does, marked
    // as having gone with this parent so restoring them brings the child back.
    const aloneIds = alone.map((link) => link.student.id);
    if (aloneIds.length > 0) {
      await tx.studentEnrolment.updateMany({
        where: { studentId: { in: aloneIds }, schoolId, status: 'ACTIVE' },
        data: { status: 'WITHDRAWN', exitedOn: now, exitReason: 'Removed with their parent' },
      });
      await tx.student.updateMany({
        where: { id: { in: aloneIds }, schoolId },
        data: { deletedAt: now, status: 'WITHDRAWN', removedWithParentId: profile.id },
      });
    }

    for (const link of handOver) {
      await tx.studentGuardian.update({
        where: { id: link.student.guardians[0]!.id },
        data: { isPrimary: true },
      });
      await tx.studentGuardian.update({ where: { id: link.id }, data: { isPrimary: false } });
    }

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
    metadata: {
      role: 'PARENT',
      name: user.name,
      keptAsTeacher: stillTeacher,
      childrenRemoved: alone.map((link) => link.student.id),
    },
  });
  for (const link of alone) {
    await writeAuditLog({
      action: 'STUDENT_DELETED',
      entity: 'Student',
      entityId: link.student.id,
      schoolId,
      actorUserId,
      before: { status: link.student.status },
      metadata: {
        admissionNo: link.student.admissionNo,
        name: link.student.firstName,
        withParent: user.name,
      },
    });
  }

  return getParent(userId);
}

/**
 * Putting a removed parent back, with their children as they were — the
 * children removed with them come back too, without a class, as a child
 * restored by hand does.
 */
export async function restoreParent(userId: string, actorUserId: string): Promise<ParentSummary> {
  const schoolId = requireSchoolId();

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      parentProfile: { is: { removedAt: { not: null } } },
      deletedAt: undefined,
    },
    select: { id: true, name: true, deletedAt: true, parentProfile: { select: { id: true } } },
  });
  if (!user) throw ApiError.notFound('There is no removed parent with that id');

  const children = await prisma.student.findMany({
    where: { removedWithParentId: user.parentProfile!.id, deletedAt: { not: null } },
    select: { id: true },
  });

  if (children.length > 0) {
    const limits = await getPlanLimits(schoolId);
    if (limits?.maxStudents != null) {
      const current = await prisma.student.count({ where: { status: 'ACTIVE' } });
      if (current + children.length > limits.maxStudents) {
        throw ApiError.planLimitExceeded(
          `Restoring ${user.name} brings back ${children.length} ${
            children.length === 1 ? 'child' : 'children'
          }, and your plan allows ${limits.maxStudents} students. Contact Poetree Publication to upgrade.`,
          { limit: limits.maxStudents, current },
        );
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.parentProfile.updateMany({ where: { userId, schoolId }, data: { removedAt: null } });
    if (user.deletedAt) {
      await tx.user.update({
        where: { id: userId, schoolId },
        data: { deletedAt: null, status: 'ACTIVE' },
      });
    }
    if (children.length > 0) {
      await tx.student.updateMany({
        where: { id: { in: children.map((c) => c.id) }, schoolId, deletedAt: { not: null } },
        data: { deletedAt: null, status: 'ACTIVE', removedWithParentId: null },
      });
    }
  });

  await writeAuditLog({
    action: 'USER_RESTORED',
    entity: 'User',
    entityId: userId,
    schoolId,
    actorUserId,
    metadata: { role: 'PARENT', childrenRestored: children.map((c) => c.id) },
  });
  for (const child of children) {
    await writeAuditLog({
      action: 'STUDENT_RESTORED',
      entity: 'Student',
      entityId: child.id,
      schoolId,
      actorUserId,
      metadata: { withParent: user.name },
    });
  }

  return getParent(userId);
}
