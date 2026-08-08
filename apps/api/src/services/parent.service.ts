import type { Prisma } from '@prisma/client';
import type {
  CreateParentInput,
  ListUsersQuery,
  Paginated,
  ParentSummary,
  UpdateParentInput,
} from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { hashPassword } from '../lib/password.js';
import { paginate, toSkipTake } from '../lib/pagination.js';
import { writeAuditLog } from './audit.service.js';

/**
 * Parents own the family's login. Students hang off a parent account and never
 * hold credentials of their own — in Phase 2 the parent taps a child's avatar
 * after signing in.
 */

const parentInclude = {
  parentProfile: {
    include: {
      children: {
        include: { student: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  },
} satisfies Prisma.UserInclude;

type ParentRow = Prisma.UserGetPayload<{ include: typeof parentInclude }>;

function toSummary(user: ParentRow): ParentSummary {
  const profile = user.parentProfile;
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
      name: [link.student.firstName, link.student.lastName].filter(Boolean).join(' '),
      isPrimary: link.isPrimary,
    })),
    createdAt: user.createdAt.toISOString(),
  };
}

export async function listParents(query: ListUsersQuery): Promise<Paginated<ParentSummary>> {
  const where: Prisma.UserWhereInput = { role: 'PARENT' };
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

export async function getParent(userId: string): Promise<ParentSummary> {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'PARENT' },
    include: parentInclude,
  });
  if (!user) throw ApiError.notFound('Parent not found');
  return toSummary(user);
}

export async function createParent(
  input: CreateParentInput,
  actorUserId: string,
): Promise<ParentSummary> {
  const schoolId = requireSchoolId();

  const clash = await prisma.user.findFirst({
    where: { OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])] },
    select: { id: true },
  });
  if (clash) {
    throw ApiError.conflict('A user with that phone or email already exists at your school');
  }

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

export async function updateParent(
  userId: string,
  input: UpdateParentInput,
  actorUserId: string,
): Promise<ParentSummary> {
  const schoolId = requireSchoolId();

  const existing = await prisma.user.findFirst({
    where: { id: userId, role: 'PARENT' },
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
