import type { Prisma } from '@prisma/client';
import type {
  AssignSubscriptionInput,
  CreateSchoolAdminInput,
  CreateSchoolInput,
  ListSchoolsQuery,
  Paginated,
  ReactivateSchoolInput,
  SchoolSummary,
  SuspendSchoolInput,
  UpdateSchoolInput,
} from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { hashPassword } from '../lib/password.js';
import { paginate, toSkipTake } from '../lib/pagination.js';
import { scopeKeyFor, slugify } from '../lib/scope.js';
import { logger } from '../lib/logger.js';
import { writeAuditLog } from './audit.service.js';
import { seedEntitlementsForSchool } from './book.service.js';
import { invalidateSchoolAccess } from './schoolAccess.service.js';
import { revokeAllSessionsForSchool } from './auth.service.js';

/**
 * Super Admin operations. Every function here uses `prismaUnscoped` by design —
 * these routes are gated by `requireRole(PUBLICATION_ADMIN)` and must reach
 * across every school.
 */

const summarySelect = {
  id: true,
  name: true,
  code: true,
  city: true,
  status: true,
  validUntil: true,
  logoUrl: true,
  logoFileId: true,
  primaryColor: true,
  createdAt: true,
  subscriptions: {
    where: { isCurrent: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { expiresAt: true, plan: { select: { name: true } } },
  },
  _count: { select: { users: true, students: true, teacherProfiles: true } },
} satisfies Prisma.SchoolSelect;

type SchoolRow = Prisma.SchoolGetPayload<{ select: typeof summarySelect }>;

function toSummary(school: SchoolRow): SchoolSummary {
  const subscription = school.subscriptions[0] ?? null;
  return {
    id: school.id,
    name: school.name,
    code: school.code,
    city: school.city,
    status: school.status,
    // The uploaded logo wins when both exist: somebody who uploads one has
    // just told us which they mean.
    logoUrl: school.logoFileId
      ? `/api/v1/public/schools/${school.code}/logo`
      : school.logoUrl,
    primaryColor: school.primaryColor,
    planName: subscription?.plan.name ?? null,
    expiresAt: school.validUntil?.toISOString() ?? subscription?.expiresAt.toISOString() ?? null,
    validUntil: school.validUntil?.toISOString() ?? null,
    counts: {
      users: school._count.users,
      teachers: school._count.teacherProfiles,
      students: school._count.students,
    },
    createdAt: school.createdAt.toISOString(),
  };
}

async function requirePublication(): Promise<string> {
  const publication = await prismaUnscoped.publication.findFirst({ select: { id: true } });
  if (!publication) {
    throw ApiError.internal('No publication has been configured. Run the database seed.');
  }
  return publication.id;
}

export async function listSchools(query: ListSchoolsQuery): Promise<Paginated<SchoolSummary>> {
  const where: Prisma.SchoolWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search } },
      { code: { contains: query.search } },
      { city: { contains: query.search } },
    ];
  }

  const [rows, total] = await Promise.all([
    prismaUnscoped.school.findMany({
      where,
      select: summarySelect,
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(query),
    }),
    prismaUnscoped.school.count({ where }),
  ]);

  return paginate(rows.map(toSummary), total, query);
}

export async function getSchool(schoolId: string): Promise<SchoolSummary> {
  const school = await prismaUnscoped.school.findUnique({
    where: { id: schoolId },
    select: summarySelect,
  });
  if (!school) throw ApiError.notFound('School not found');
  return toSummary(school);
}

export async function createSchool(
  input: CreateSchoolInput,
  actorUserId: string,
): Promise<SchoolSummary> {
  const publicationId = await requirePublication();

  const existing = await prismaUnscoped.school.findUnique({
    where: { code: input.code },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.conflict(`School code "${input.code}" is already taken`, { field: 'code' });
  }

  const school = await prismaUnscoped.school.create({
    data: {
      publicationId,
      name: input.name,
      code: input.code,
      slug: slugify(input.name, input.code),
      email: input.email ?? null,
      phone: input.phone ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
      principalName: input.principalName ?? null,
      logoUrl: input.logoUrl ?? null,
      primaryColor: input.primaryColor ?? null,
      status: 'TRIAL',
    },
    select: summarySelect,
  });

  // Every book, switched on. The Super Admin has just sold them something and
  // an empty shelf on day one is the worse first impression; turning a book
  // off afterwards is the deliberate act.
  await seedEntitlementsForSchool(prismaUnscoped, school.id);

  await writeAuditLog({
    action: 'SCHOOL_CREATED',
    entity: 'School',
    entityId: school.id,
    schoolId: school.id,
    actorUserId,
    metadata: { name: school.name, code: school.code },
  });

  return toSummary(school);
}

export async function updateSchool(
  schoolId: string,
  input: UpdateSchoolInput,
  actorUserId: string,
): Promise<SchoolSummary> {
  const current = await prismaUnscoped.school.findUnique({
    where: { id: schoolId },
    select: { id: true, code: true },
  });
  if (!current) throw ApiError.notFound('School not found');

  const data: Prisma.SchoolUpdateInput = { ...input };
  if (input.name) data.slug = slugify(input.name, current.code);

  const school = await prismaUnscoped.school.update({
    where: { id: schoolId },
    data,
    select: summarySelect,
  });

  await writeAuditLog({
    action: 'SCHOOL_UPDATED',
    entity: 'School',
    entityId: schoolId,
    schoolId,
    actorUserId,
    metadata: { fields: Object.keys(input) },
  });

  return toSummary(school);
}

export async function createSchoolAdmin(
  schoolId: string,
  input: CreateSchoolAdminInput,
  actorUserId: string,
): Promise<{ id: string; name: string; email: string | null }> {
  const school = await prismaUnscoped.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) throw ApiError.notFound('School not found');

  const scopeKey = scopeKeyFor(schoolId);

  const clash = await prismaUnscoped.user.findFirst({
    where: { scopeKey, OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])] },
    select: { id: true },
  });
  if (clash) {
    throw ApiError.conflict('A user with that email or phone already exists at this school');
  }

  const user = await prismaUnscoped.user.create({
    data: {
      schoolId,
      scopeKey,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: await hashPassword(input.password),
      role: 'SCHOOL_ADMIN',
      status: 'ACTIVE',
    },
    select: { id: true, name: true, email: true },
  });

  await writeAuditLog({
    action: 'SCHOOL_ADMIN_CREATED',
    entity: 'User',
    entityId: user.id,
    schoolId,
    actorUserId,
    metadata: { email: input.email },
  });

  return user;
}

export async function assignSubscription(
  schoolId: string,
  input: AssignSubscriptionInput,
  actorUserId: string,
): Promise<{ schoolId: string; planId: string; expiresAt: string; status: string }> {
  const [school, plan] = await Promise.all([
    prismaUnscoped.school.findUnique({ where: { id: schoolId }, select: { id: true, status: true } }),
    prismaUnscoped.subscriptionPlan.findUnique({
      where: { id: input.planId },
      select: { id: true, name: true, isActive: true },
    }),
  ]);

  if (!school) throw ApiError.notFound('School not found');
  if (!plan) throw ApiError.notFound('Subscription plan not found');
  if (!plan.isActive) throw ApiError.badRequest('That plan is no longer active');

  const startsAt = input.startsAt ?? new Date();

  const subscription = await prismaUnscoped.$transaction(async (tx) => {
    // Only one row may be current per school.
    await tx.schoolSubscription.updateMany({
      where: { schoolId, isCurrent: true },
      data: { isCurrent: false },
    });

    const created = await tx.schoolSubscription.create({
      data: {
        schoolId,
        planId: plan.id,
        startsAt,
        expiresAt: input.expiresAt,
        status: 'ACTIVE',
        isCurrent: true,
      },
      select: { id: true, planId: true, expiresAt: true, status: true },
    });

    // Assigning a live plan is also how a Super Admin brings a lapsed school
    // back, so the school status follows the plan.
    await tx.school.update({ where: { id: schoolId }, data: { status: 'ACTIVE' } });

    await writeAuditLog(
      {
        action: 'SUBSCRIPTION_ASSIGNED',
        entity: 'SchoolSubscription',
        entityId: created.id,
        schoolId,
        actorUserId,
        metadata: { planId: plan.id, planName: plan.name, expiresAt: input.expiresAt.toISOString() },
      },
      tx,
    );

    return created;
  });

  invalidateSchoolAccess(schoolId);

  return {
    schoolId,
    planId: subscription.planId,
    expiresAt: subscription.expiresAt.toISOString(),
    status: subscription.status,
  };
}

/** What the confirmation dialog needs before the Super Admin pulls the switch. */
export async function getSuspensionImpact(
  schoolId: string,
): Promise<{ schoolId: string; schoolName: string; users: number; activeSessions: number }> {
  const school = await prismaUnscoped.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, _count: { select: { users: true } } },
  });
  if (!school) throw ApiError.notFound('School not found');

  const activeSessions = await prismaUnscoped.refreshToken.count({
    where: { revokedAt: null, expiresAt: { gt: new Date() }, user: { schoolId } },
  });

  return {
    schoolId: school.id,
    schoolName: school.name,
    users: school._count.users,
    activeSessions,
  };
}

/**
 * Switch the school's plan off. This is the cascade: the school status flips,
 * the current subscription is marked suspended, and every live session for
 * every user of that school is revoked in the same transaction.
 */
export async function suspendSchool(
  schoolId: string,
  input: SuspendSchoolInput,
  actorUserId: string,
  ipAddress?: string | null,
): Promise<{ schoolId: string; status: string; revokedSessions: number; affectedUsers: number }> {
  const result = await prismaUnscoped.$transaction(async (tx) => {
    const school = await tx.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, status: true, _count: { select: { users: true } } },
    });
    if (!school) throw ApiError.notFound('School not found');
    if (school.status === 'SUSPENDED') {
      throw ApiError.conflict('This school is already suspended');
    }

    await tx.school.update({ where: { id: schoolId }, data: { status: 'SUSPENDED' } });

    await tx.schoolSubscription.updateMany({
      where: { schoolId, isCurrent: true },
      data: {
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        suspendedReason: input.reason,
        suspendedById: actorUserId,
      },
    });

    const revokedSessions = await revokeAllSessionsForSchool(schoolId, tx);

    await writeAuditLog(
      {
        action: 'SCHOOL_SUSPENDED',
        entity: 'School',
        entityId: schoolId,
        schoolId,
        actorUserId,
        ipAddress,
        metadata: {
          reason: input.reason,
          previousStatus: school.status,
          revokedSessions,
          affectedUsers: school._count.users,
        },
      },
      tx,
    );

    return { revokedSessions, affectedUsers: school._count.users, name: school.name };
  });

  // Bust the cache *after* the transaction commits, so no request can refill it
  // from the pre-suspension state.
  invalidateSchoolAccess(schoolId);

  logger.warn('School suspended', {
    schoolId,
    school: result.name,
    actorUserId,
    revokedSessions: result.revokedSessions,
  });

  return {
    schoolId,
    status: 'SUSPENDED',
    revokedSessions: result.revokedSessions,
    affectedUsers: result.affectedUsers,
  };
}

export async function reactivateSchool(
  schoolId: string,
  input: ReactivateSchoolInput,
  actorUserId: string,
  ipAddress?: string | null,
): Promise<{ schoolId: string; status: string; expiresAt: string | null }> {
  const result = await prismaUnscoped.$transaction(async (tx) => {
    const school = await tx.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, status: true },
    });
    if (!school) throw ApiError.notFound('School not found');
    if (school.status === 'ACTIVE' || school.status === 'TRIAL') {
      throw ApiError.conflict('This school is already active');
    }

    const subscription = await tx.schoolSubscription.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, expiresAt: true },
    });

    let expiresAt = subscription?.expiresAt ?? null;

    if (subscription) {
      // Reactivating a school whose plan already lapsed without extending it
      // would be undone by lazy expiry on the very next request.
      if (!input.expiresAt && subscription.expiresAt.getTime() <= Date.now()) {
        throw ApiError.badRequest(
          'This school’s plan has already expired. Provide a new expiry date to reactivate it.',
        );
      }

      expiresAt = input.expiresAt ?? subscription.expiresAt;

      await tx.schoolSubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          suspendedAt: null,
          suspendedReason: null,
          suspendedById: null,
          reactivatedAt: new Date(),
          reactivatedById: actorUserId,
          expiresAt,
        },
      });
    }

    await tx.school.update({ where: { id: schoolId }, data: { status: 'ACTIVE' } });

    await writeAuditLog(
      {
        action: 'SCHOOL_REACTIVATED',
        entity: 'School',
        entityId: schoolId,
        schoolId,
        actorUserId,
        ipAddress,
        metadata: { note: input.note ?? null, previousStatus: school.status },
      },
      tx,
    );

    return { expiresAt, name: school.name };
  });

  invalidateSchoolAccess(schoolId);

  logger.info('School reactivated', { schoolId, school: result.name, actorUserId });

  return {
    schoolId,
    status: 'ACTIVE',
    expiresAt: result.expiresAt?.toISOString() ?? null,
  };
}


/**
 * Points a school at an already-uploaded file as its logo.
 *
 * The bytes go through POST /files like every other upload — magic-byte
 * sniffing, size caps and EXIF stripping all apply — and this only records
 * which of them is the logo. Publication-owned (schoolId NULL) or the school's
 * own are both fine; anything else is not, or one school could wear another's
 * badge.
 */
export async function setSchoolLogo(
  schoolId: string,
  fileId: string | null,
  actorUserId: string,
): Promise<SchoolSummary> {
  const current = await prismaUnscoped.school.findUnique({
    where: { id: schoolId },
    select: { id: true, logoFileId: true },
  });
  if (!current) throw ApiError.notFound('School not found');

  if (fileId) {
    const file = await prismaUnscoped.fileObject.findFirst({
      where: { id: fileId, deletedAt: null },
      select: { id: true, schoolId: true, mimeType: true },
    });
    if (!file) throw ApiError.badRequest('That file does not exist');

    if (file.schoolId !== null && file.schoolId !== schoolId) {
      throw ApiError.badRequest('That file belongs to another school');
    }

    // Served to anyone who knows the school code, so it must be a picture and
    // not, say, a PDF of somebody's medical letter uploaded by mistake.
    if (!file.mimeType.startsWith('image/')) {
      throw ApiError.badRequest('A logo has to be a picture');
    }
  }

  const school = await prismaUnscoped.school.update({
    where: { id: schoolId },
    data: { logoFileId: fileId },
    select: summarySelect,
  });

  await writeAuditLog({
    action: 'SCHOOL_UPDATED',
    entity: 'School',
    entityId: schoolId,
    schoolId,
    actorUserId,
    before: { logoFileId: current.logoFileId },
    after: { logoFileId: fileId },
  });

  return toSummary(school);
}


/**
 * Sets how long a school's access lasts.
 *
 * The only lever the publisher wanted: a date, and a locked-out school when it
 * passes. Extending it on an expired school brings them back — otherwise the
 * obvious act of renewing would leave every teacher still shut out, and
 * somebody would have to know to press reactivate as well.
 */
export async function setSchoolValidity(
  schoolId: string,
  validUntil: Date | null,
  actorUserId: string,
): Promise<SchoolSummary> {
  const current = await prismaUnscoped.school.findUnique({
    where: { id: schoolId },
    select: { id: true, status: true, validUntil: true },
  });
  if (!current) throw ApiError.notFound('School not found');

  const stillValid = validUntil === null || validUntil.getTime() > Date.now();

  // A suspension is a deliberate act by a person and is not undone by a date:
  // only an expiry is lifted here.
  const status =
    current.status === 'EXPIRED' && stillValid
      ? 'ACTIVE'
      : stillValid
        ? current.status
        : 'EXPIRED';

  const school = await prismaUnscoped.school.update({
    where: { id: schoolId },
    data: { validUntil, status },
    select: summarySelect,
  });

  // The gate caches per school; without this the change waits out the TTL.
  invalidateSchoolAccess(schoolId);

  await writeAuditLog({
    action: validUntil && !stillValid ? 'SCHOOL_SUSPENDED' : 'SCHOOL_UPDATED',
    entity: 'School',
    entityId: schoolId,
    schoolId,
    actorUserId,
    before: { validUntil: current.validUntil, status: current.status },
    after: { validUntil, status },
  });

  return toSummary(school);
}
