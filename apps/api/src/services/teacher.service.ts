import type { Prisma } from '@prisma/client';
import type {
  CreateTeacherInput,
  ListUsersQuery,
  Paginated,
  TeacherSummary,
  UpdateTeacherInput,
} from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { hashPassword } from '../lib/password.js';
import { paginate, toSkipTake } from '../lib/pagination.js';
import { writeAuditLog } from './audit.service.js';
import { getPlanLimits } from './plan.service.js';

/**
 * School Admin roster operations. These use the tenant-scoped `prisma` client,
 * so `schoolId` is applied automatically on reads and forced on writes — no
 * function here accepts a schoolId from the caller.
 */

const teacherInclude = {
  teacherProfile: true,
  _count: { select: { classroomAssignments: true } },
} satisfies Prisma.UserInclude;

type TeacherRow = Prisma.UserGetPayload<{ include: typeof teacherInclude }>;

function toSummary(user: TeacherRow): TeacherSummary {
  return {
    id: user.teacherProfile?.id ?? user.id,
    userId: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    employeeCode: user.teacherProfile?.employeeCode ?? null,
    qualification: user.teacherProfile?.qualification ?? null,
    joinedAt: user.teacherProfile?.joinedAt?.toISOString() ?? null,
    classroomCount: user._count.classroomAssignments,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function listTeachers(query: ListUsersQuery): Promise<Paginated<TeacherSummary>> {
  const where: Prisma.UserWhereInput = { role: 'TEACHER' };
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
      include: teacherInclude,
      orderBy: { name: 'asc' },
      ...toSkipTake(query),
    }),
    prisma.user.count({ where }),
  ]);

  return paginate(rows.map(toSummary), total, query);
}

export async function getTeacher(userId: string): Promise<TeacherSummary> {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'TEACHER' },
    include: teacherInclude,
  });
  // A teacher at another school is reported missing, not forbidden.
  if (!user) throw ApiError.notFound('Teacher not found');
  return toSummary(user);
}

async function assertTeacherSeatAvailable(schoolId: string): Promise<void> {
  const limits = await getPlanLimits(schoolId);
  if (limits?.maxTeachers == null) return;

  const current = await prisma.teacherProfile.count();
  if (current >= limits.maxTeachers) {
    throw ApiError.planLimitExceeded(
      `Your plan allows ${limits.maxTeachers} teachers. Contact Poetree Publication to upgrade.`,
      { limit: limits.maxTeachers, current },
    );
  }
}

export async function createTeacher(
  input: CreateTeacherInput,
  actorUserId: string,
): Promise<TeacherSummary> {
  const schoolId = requireSchoolId();

  await assertTeacherSeatAvailable(schoolId);

  const clash = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])] },
    select: { id: true },
  });
  if (clash) {
    throw ApiError.conflict('A user with that email or phone already exists at your school');
  }

  const passwordHash = await hashPassword(input.password);

  // Inside an interactive transaction, write schoolId explicitly rather than
  // relying on the isolation extension — the transaction client is treated as
  // unscoped here so the code is correct either way.
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        schoolId,
        scopeKey: schoolId,
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        passwordHash,
        role: 'TEACHER',
        status: 'ACTIVE',
      },
    });

    await tx.teacherProfile.create({
      data: {
        userId: user.id,
        schoolId,
        employeeCode: input.employeeCode ?? null,
        qualification: input.qualification ?? null,
        joinedAt: input.joinedAt ?? null,
      },
    });

    return user.id;
  });

  await writeAuditLog({
    action: 'USER_CREATED',
    entity: 'User',
    entityId: created,
    schoolId,
    actorUserId,
    metadata: { role: 'TEACHER', email: input.email },
  });

  return getTeacher(created);
}

export async function updateTeacher(
  userId: string,
  input: UpdateTeacherInput,
  actorUserId: string,
): Promise<TeacherSummary> {
  const schoolId = requireSchoolId();

  const existing = await prisma.user.findFirst({
    where: { id: userId, role: 'TEACHER' },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound('Teacher not found');

  const { employeeCode, qualification, joinedAt, ...userFields } = input;

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

    if (employeeCode !== undefined || qualification !== undefined || joinedAt !== undefined) {
      await tx.teacherProfile.updateMany({
        where: { userId, schoolId },
        data: {
          employeeCode: employeeCode ?? undefined,
          qualification: qualification ?? undefined,
          joinedAt: joinedAt ?? undefined,
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
    metadata: { role: 'TEACHER', fields: Object.keys(input) },
  });

  return getTeacher(userId);
}
