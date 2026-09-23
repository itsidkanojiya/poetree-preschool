import type {
  CreateOrganisationInput,
  OrganisationOverview,
  OrganisationSummary,
  UpdateOrganisationInput,
  BranchSummary,
} from '@poetree/shared';
import type { SchoolStatus } from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { hashPassword } from '../lib/password.js';
import { codeFromName, nextFreeCode, organisationScopeKey } from '../lib/scope.js';
import { writeAuditLog } from './audit.service.js';

/**
 * Groups of schools — a customer with more than one branch.
 *
 * Super Admin surface, so `prismaUnscoped` throughout, like the rest of
 * school.service: an organisation belongs to no school, and reads here cross
 * every school in the group by design.
 *
 * The group overview is the only thing in the platform that reads across
 * schools for somebody who is not the publisher. It does that with an explicit
 * `schoolId: { in: [...] }` over the branches the caller owns — never by
 * loosening the tenant client, which stays fail-closed.
 */

async function publicationId(): Promise<string> {
  const publication = await prismaUnscoped.publication.findFirst({ select: { id: true } });
  if (!publication) {
    throw ApiError.internal('No publication has been configured. Run the database seed.');
  }
  return publication.id;
}

const codeTaken = async (code: string): Promise<boolean> => {
  // Against both tables: a group's code and a school's code are handed to the
  // same login field, so "sunrise" cannot be a group and a school at once.
  const [organisation, school] = await Promise.all([
    prismaUnscoped.organisation.findUnique({ where: { code }, select: { id: true } }),
    prismaUnscoped.school.findUnique({ where: { code }, select: { id: true } }),
  ]);
  return Boolean(organisation ?? school);
};

/** Free, and free of the other table too. Exported for school.service. */
export const isCodeTaken = codeTaken;

export async function listOrganisations(): Promise<OrganisationSummary[]> {
  const rows = await prismaUnscoped.organisation.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      code: true,
      createdAt: true,
      _count: { select: { schools: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    branchCount: row._count.schools,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createOrganisation(
  input: CreateOrganisationInput,
  actorUserId: string,
): Promise<OrganisationSummary> {
  const code = input.code ?? (await nextFreeCode(codeFromName(input.name), codeTaken));

  if (input.code && (await codeTaken(input.code))) {
    throw ApiError.conflict(`Code "${input.code}" is already taken`, { field: 'code' });
  }

  const organisation = await prismaUnscoped.organisation.create({
    data: { publicationId: await publicationId(), name: input.name, code },
    select: { id: true, name: true, code: true, createdAt: true },
  });

  await writeAuditLog({
    action: 'ORGANISATION_CREATED',
    entity: 'Organisation',
    entityId: organisation.id,
    actorUserId,
    metadata: { name: organisation.name, code: organisation.code },
  });

  return { ...organisation, branchCount: 0, createdAt: organisation.createdAt.toISOString() };
}

export async function updateOrganisation(
  organisationId: string,
  input: UpdateOrganisationInput,
  actorUserId: string,
): Promise<OrganisationSummary> {
  await requireOrganisation(organisationId);

  const organisation = await prismaUnscoped.organisation.update({
    where: { id: organisationId },
    data: { name: input.name },
    select: {
      id: true,
      name: true,
      code: true,
      createdAt: true,
      _count: { select: { schools: true } },
    },
  });

  await writeAuditLog({
    action: 'ORGANISATION_UPDATED',
    entity: 'Organisation',
    entityId: organisationId,
    actorUserId,
    metadata: { name: organisation.name },
  });

  return {
    id: organisation.id,
    name: organisation.name,
    code: organisation.code,
    branchCount: organisation._count.schools,
    createdAt: organisation.createdAt.toISOString(),
  };
}

export async function requireOrganisation(organisationId: string): Promise<{
  id: string;
  name: string;
  code: string;
  createdAt: Date;
}> {
  const organisation = await prismaUnscoped.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true, code: true, createdAt: true },
  });
  if (!organisation) throw ApiError.notFound('Organisation not found');
  return organisation;
}

/** The branches of one group, in the order a person would read them. */
export async function listBranches(
  organisationId: string,
  currentSchoolId: string | null,
): Promise<BranchSummary[]> {
  const branches = await prismaUnscoped.school.findMany({
    where: { organisationId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
      status: true,
      _count: { select: { students: true, teacherProfiles: true } },
    },
  });

  return branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    code: branch.code,
    city: branch.city,
    status: branch.status as SchoolStatus,
    isCurrent: branch.id === currentSchoolId,
    counts: { students: branch._count.students, teachers: branch._count.teacherProfiles },
  }));
}

/** Every branch side by side — the one view that spans a group. */
export async function organisationOverview(
  organisationId: string,
  currentSchoolId: string | null,
): Promise<OrganisationOverview> {
  const organisation = await requireOrganisation(organisationId);
  const branches = await listBranches(organisationId, currentSchoolId);

  return {
    organisation: {
      id: organisation.id,
      name: organisation.name,
      code: organisation.code,
      branchCount: branches.length,
      createdAt: organisation.createdAt.toISOString(),
    },
    branches,
    totals: {
      students: branches.reduce((sum, branch) => sum + branch.counts.students, 0),
      teachers: branches.reduce((sum, branch) => sum + branch.counts.teachers, 0),
    },
  };
}

/**
 * A group administrator: one account, no school of their own.
 *
 * Their scope key is the organisation rather than a school, so the uniqueness
 * constraints on email and phone hold for them the way they do for everybody
 * else — see `organisationScopeKey`.
 */
export async function createOrganisationAdmin(
  organisationId: string,
  input: { name: string; email: string; phone?: string; password: string },
  actorUserId: string,
): Promise<{ id: string; name: string; email: string | null }> {
  const organisation = await requireOrganisation(organisationId);
  const scopeKey = organisationScopeKey(organisation.id);

  const clash = await prismaUnscoped.user.findFirst({
    where: {
      scopeKey,
      OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])],
    },
    select: { id: true },
  });
  if (clash) {
    throw ApiError.conflict('A user with that email or phone already exists in this group');
  }

  const user = await prismaUnscoped.user.create({
    data: {
      organisationId: organisation.id,
      schoolId: null,
      scopeKey,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: await hashPassword(input.password),
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
    },
    select: { id: true, name: true, email: true },
  });

  await writeAuditLog({
    action: 'ORG_ADMIN_CREATED',
    entity: 'User',
    entityId: user.id,
    actorUserId,
    metadata: { organisationId: organisation.id, email: input.email },
  });

  return user;
}
