import type { Prisma } from '@prisma/client';
import type {
  AddTeacherRoleInput,
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
import { endAllSessions } from './auth.service.js';
import { getPlanLimits } from './plan.service.js';
import { existingAccount, holdsTeacher, profileRoles, rolesHeld } from './roles.service.js';

/**
 * School Admin roster operations. These use the tenant-scoped `prisma` client,
 * so `schoolId` is applied automatically on reads and forced on writes — no
 * function here accepts a schoolId from the caller.
 *
 * A teacher is an account holding a teacher profile the school has not
 * removed. The same account may be a parent here too; removing the teacher
 * leaves the parent as they were.
 */

const teacherInclude = {
  teacherProfile: true,
  parentProfile: { select: { removedAt: true } },
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
    signatureUrl: user.signatureFileId ? `/api/v1/files/${user.signatureFileId}` : null,
    isParent: rolesHeld(user).includes('PARENT'),
    removedAt: user.teacherProfile?.removedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function listTeachers(query: ListUsersQuery): Promise<Paginated<TeacherSummary>> {
  // Removed ones only on request, for the screen that puts them back — and
  // `deletedAt` named so the soft-delete filter lets their accounts through.
  const where: Prisma.UserWhereInput =
    query.removed === 'true'
      ? { teacherProfile: { is: { removedAt: { not: null } } }, deletedAt: undefined }
      : { ...holdsTeacher };
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

/** One teacher — removed ones too, so the portal can show them and put them back. */
export async function getTeacher(userId: string): Promise<TeacherSummary> {
  const user = await prisma.user.findFirst({
    where: { id: userId, teacherProfile: { isNot: null }, deletedAt: undefined },
    include: teacherInclude,
  });
  // A teacher at another school is reported missing, not forbidden.
  if (!user) throw ApiError.notFound('Teacher not found');
  return toSummary(user);
}

async function assertTeacherSeatAvailable(schoolId: string): Promise<void> {
  const limits = await getPlanLimits(schoolId);
  if (limits?.maxTeachers == null) return;

  // Removed teachers do not take a seat.
  const current = await prisma.teacherProfile.count({ where: { removedAt: null } });
  if (current >= limits.maxTeachers) {
    throw ApiError.planLimitExceeded(
      `Your plan allows ${limits.maxTeachers} teachers. Contact Poetree Publication to upgrade.`,
      { limit: limits.maxTeachers, current },
    );
  }
}

/**
 * Refuses a second account for somebody the school already has, saying who
 * they are so the portal can offer the right way instead: adding the teacher
 * role to a parent's account, or restoring a removed one.
 */
async function assertNoAccount(match: { email?: string | null; phone?: string | null }) {
  const clash = await existingAccount(match);
  if (!clash) return;

  if (clash.removed) {
    throw ApiError.conflict(
      `${clash.name} was removed from your school and still holds that email or phone. ` +
        'Restore them instead of adding them again.',
      { existingAccount: clash },
    );
  }
  if (clash.roles.includes('TEACHER')) {
    throw ApiError.conflict(`${clash.name} is already a teacher at your school.`, {
      existingAccount: clash,
    });
  }
  if (clash.roles.includes('PARENT')) {
    throw ApiError.conflict(
      `${clash.name} already has a parent account with that email or phone. ` +
        'Add the teacher role to it rather than opening a second account.',
      { existingAccount: clash },
    );
  }
  throw ApiError.conflict('A user with that email or phone already exists at your school', {
    existingAccount: clash,
  });
}

export async function createTeacher(
  input: CreateTeacherInput,
  actorUserId: string,
): Promise<TeacherSummary> {
  const schoolId = requireSchoolId();

  await assertTeacherSeatAvailable(schoolId);
  await assertNoAccount({ email: input.email, phone: input.phone });

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

/**
 * A parent at the school who comes to teach there, on the account they have.
 *
 * Their sign-in, password and children stay exactly as they are; they gain the
 * teacher role, and the app offers a switch between the two.
 */
export async function addTeacherRole(
  userId: string,
  input: AddTeacherRoleInput,
  actorUserId: string,
): Promise<TeacherSummary> {
  const schoolId = requireSchoolId();

  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      teacherProfile: { select: { id: true, removedAt: true } },
      parentProfile: { select: { removedAt: true } },
    },
  });
  if (!user) throw ApiError.notFound('Account not found');

  const held = rolesHeld(user);
  if (held.includes('TEACHER')) throw ApiError.conflict('They are already a teacher here.');
  if (!held.includes('PARENT')) {
    throw ApiError.badRequest('Only a parent’s account can be given the teacher role.');
  }

  await assertTeacherSeatAvailable(schoolId);

  const details = {
    employeeCode: input.employeeCode ?? null,
    qualification: input.qualification ?? null,
    joinedAt: input.joinedAt ?? null,
  };
  await prisma.$transaction(async (tx) => {
    if (user.teacherProfile) {
      // They taught here before and were removed: the same profile, back.
      await tx.teacherProfile.update({
        where: { id: user.teacherProfile.id },
        data: { ...details, removedAt: null },
      });
    } else {
      await tx.teacherProfile.create({ data: { userId, schoolId, ...details } });
    }
  });

  await writeAuditLog({
    action: 'ROLE_ADDED',
    entity: 'User',
    entityId: userId,
    schoolId,
    actorUserId,
    metadata: { role: 'TEACHER' },
  });

  return getTeacher(userId);
}

export async function updateTeacher(
  userId: string,
  input: UpdateTeacherInput,
  actorUserId: string,
): Promise<TeacherSummary> {
  const schoolId = requireSchoolId();

  const existing = await prisma.user.findFirst({
    where: { id: userId, ...holdsTeacher },
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
    metadata: { role: 'TEACHER', fields: Object.keys(input) },
  });

  return getTeacher(userId);
}

/**
 * The school taking a teacher off.
 *
 * Nothing is erased. Their name stays on the attendance they marked and the
 * homework they set; they leave their classes and the timetable, so the office
 * can put someone else there; and they are signed out and cannot sign in
 * again. Someone who is also a parent here keeps that — only the teacher role
 * goes, and they carry on as a parent.
 */
export async function removeTeacher(userId: string, actorUserId: string): Promise<TeacherSummary> {
  const schoolId = requireSchoolId();

  const user = await prisma.user.findFirst({
    where: { id: userId, ...holdsTeacher },
    select: { id: true, name: true, role: true, ...profileRoles },
  });
  if (!user) throw ApiError.notFound('Teacher not found');

  const stillParent = rolesHeld(user).includes('PARENT');
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.teacherProfile.updateMany({ where: { userId, schoolId }, data: { removedAt: now } });
    // Their classes and their slots on the timetable wait for whoever the
    // office puts there next.
    await tx.classroomTeacher.deleteMany({ where: { userId, schoolId } });
    await tx.timetableEntry.updateMany({
      where: { teacherId: userId, schoolId },
      data: { teacherId: null },
    });

    if (!stillParent) {
      await tx.user.update({
        where: { id: userId, schoolId },
        data: { deletedAt: now, status: 'INACTIVE' },
      });
    } else if (user.role === 'TEACHER') {
      // The role the account opens as is the one it still holds.
      await tx.user.update({ where: { id: userId, schoolId }, data: { role: 'PARENT' } });
    }
  });

  await endAllSessions(userId, 'REMOVED_BY_SCHOOL');

  await writeAuditLog({
    action: 'USER_REMOVED',
    entity: 'User',
    entityId: userId,
    schoolId,
    actorUserId,
    metadata: { role: 'TEACHER', name: user.name, keptAsParent: stillParent },
  });

  return getTeacher(userId);
}

/** Putting a removed teacher back, with the account and history they had. */
export async function restoreTeacher(userId: string, actorUserId: string): Promise<TeacherSummary> {
  const schoolId = requireSchoolId();

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      teacherProfile: { is: { removedAt: { not: null } } },
      deletedAt: undefined,
    },
    select: { id: true, deletedAt: true },
  });
  if (!user) throw ApiError.notFound('There is no removed teacher with that id');

  await assertTeacherSeatAvailable(schoolId);

  await prisma.$transaction(async (tx) => {
    await tx.teacherProfile.updateMany({ where: { userId, schoolId }, data: { removedAt: null } });
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
    metadata: { role: 'TEACHER' },
  });

  return getTeacher(userId);
}
