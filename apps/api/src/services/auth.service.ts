import type { Prisma } from '@prisma/client';
import type {
  AuthenticatedUser,
  BranchSummary,
  LoginInput,
  LoginResponse,
  Role,
} from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { burnPasswordComparison, verifyPassword } from '../lib/password.js';
import {
  hashRefreshToken,
  newTokenId,
  refreshTokenExpiry,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/tokens.js';
import { env } from '../config/env.js';
import { assertSchoolUsable } from './schoolAccess.service.js';
import { writeAuditLogSafe } from './audit.service.js';
import { registrationAwaiting } from './registration.service.js';
import { listBranches } from './organisation.service.js';

const userWithSchool = {
  include: {
    school: {
      select: { id: true, name: true, code: true, logoUrl: true, primaryColor: true, status: true },
    },
    // Only a group administrator has one. It is what tells a client to offer a
    // branch switcher at all.
    organisation: { select: { id: true, name: true, code: true } },
  },
} satisfies Prisma.UserDefaultArgs;

type UserWithSchool = Prisma.UserGetPayload<typeof userWithSchool>;

/** What a caller gets back: the pair, and how long the access half lasts. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function toAuthenticatedUser(
  user: UserWithSchool,
  branch?: BranchSchool | null,
): AuthenticatedUser {
  // A group administrator's session belongs to the branch they picked, not to
  // their own row — which holds no school at all.
  const school = branch ?? user.school;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role as Role,
    schoolId: school?.id ?? user.schoolId,
    mustChangePassword: user.mustChangePassword,
    organisation: user.organisation,
    school: school
      ? {
          id: school.id,
          name: school.name,
          code: school.code,
          logoUrl: school.logoUrl,
          primaryColor: school.primaryColor,
          status: school.status,
        }
      : null,
  };
}

/** The shape of a school wherever a session can be pointed at one. */
type BranchSchool = NonNullable<UserWithSchool['school']>;

const branchSelect = {
  id: true,
  name: true,
  code: true,
  logoUrl: true,
  primaryColor: true,
  status: true,
} satisfies Prisma.SchoolSelect;

/**
 * A pair, and the session row behind the refresh half.
 *
 * `activeSchoolId` is the branch a group administrator is working in. It is
 * stored on the session rather than worked out again at refresh time: a refresh
 * that quietly dropped them back to "no branch chosen" would break the next
 * request they made, halfway through whatever they were doing.
 */
async function issueTokens(
  user: UserWithSchool,
  meta: RequestMeta,
  activeSchoolId: string | null = null,
) {
  const tokenId = newTokenId();
  const refreshToken = signRefreshToken({ userId: user.id, tokenId });

  await prismaUnscoped.refreshToken.create({
    data: {
      id: tokenId,
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
      activeSchoolId,
    },
  });

  return {
    accessToken: signAccessToken({
      mustChangePassword: user.mustChangePassword,
      userId: user.id,
      role: user.role as Role,
      schoolId: activeSchoolId ?? user.schoolId,
    }),
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  };
}

/**
 * Login is deliberately role-agnostic — the same endpoint serves the Phase 2
 * mobile app. `allowedRoles` is how the Phase 1 web portal narrows it to
 * administrators without a second implementation.
 */
export async function login(
  input: LoginInput,
  meta: RequestMeta,
  allowedRoles?: readonly Role[],
): Promise<LoginResponse> {
  const identifier = input.identifier.trim();
  const looksLikeEmail = identifier.includes('@');

  const where: Prisma.UserWhereInput = looksLikeEmail
    ? { email: identifier.toLowerCase() }
    : { phone: identifier };

  if (input.schoolCode) {
    // One field, two kinds of code. A branded app is built per school when the
    // customer is independent and per group when it is not, and it sends the
    // code it was built with without knowing which kind that is.
    //
    // The second arm is the group's own administrator, who belongs to no school
    // and would otherwise be excluded by their own group's code.
    where.OR = [
      { school: { OR: [{ code: input.schoolCode }, { organisation: { code: input.schoolCode } }] } },
      { organisation: { code: input.schoolCode } },
    ];
  }

  // The same email or phone may legitimately exist at more than one school, so
  // this is a list, not a lookup.
  const candidates = await prismaUnscoped.user.findMany({
    where,
    ...userWithSchool,
    take: 5,
  });

  if (candidates.length === 0) {
    // Spend the same time as a real comparison so a missing account is not
    // distinguishable by response timing.
    await burnPasswordComparison();

    // Before calling it a bad login: this may be a family who registered
    // themselves and is waiting on the school. "Invalid password" reads as
    // their own mistake and sends them round the same loop for a week.
    //
    // This does tell whoever typed the number that a registration exists for
    // it. It is the family's own submission and the requirement is that they
    // be told — but it is a disclosure, and the rate limiter above is what
    // keeps it from being a way to test numbers in bulk.
    const waiting = await registrationAwaiting(identifier, input.schoolCode);
    if (waiting?.status === 'PENDING') {
      throw ApiError.registrationPending(
        'Your account is currently under verification by the school. ' +
          'You will be able to access the application once your registration is approved.',
        { schoolName: waiting.schoolName },
      );
    }
    if (waiting?.status === 'REJECTED') {
      throw ApiError.registrationRejected(
        waiting.reason
          ? `Your registration was not approved: ${waiting.reason}`
          : 'Your registration was not approved. Please contact the school office.',
        { schoolName: waiting.schoolName },
      );
    }

    writeAuditLogSafe({
      action: 'LOGIN_FAILED',
      entity: 'User',
      metadata: { identifier, reason: 'NO_SUCH_USER' },
      ipAddress: meta.ipAddress ?? null,
    });
    throw ApiError.invalidCredentials();
  }

  const matches: UserWithSchool[] = [];
  for (const candidate of candidates) {
    if (await verifyPassword(input.password, candidate.passwordHash)) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) {
    writeAuditLogSafe({
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: candidates[0]?.id ?? null,
      schoolId: candidates[0]?.schoolId ?? null,
      metadata: { identifier, reason: 'BAD_PASSWORD' },
      ipAddress: meta.ipAddress ?? null,
    });
    throw ApiError.invalidCredentials();
  }

  if (matches.length > 1) {
    throw ApiError.conflict(
      'This login exists at more than one school. Please include your school code.',
      {
        schoolCodes: matches
          .map((m) => m.school?.code ?? m.organisation?.code)
          .filter(Boolean),
      },
    );
  }

  const user = matches[0]!;

  if (allowedRoles && !allowedRoles.includes(user.role as Role)) {
    throw ApiError.portalAccessDenied();
  }

  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('Your account is not active. Please contact your administrator.');
  }

  // The plan gate. A suspended school stops here — no tokens are ever issued.
  if (user.schoolId) {
    await assertSchoolUsable(user.schoolId);
  }

  const tokens = await issueTokens(user, meta);

  await prismaUnscoped.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  writeAuditLogSafe({
    action: 'LOGIN_SUCCEEDED',
    entity: 'User',
    entityId: user.id,
    schoolId: user.schoolId,
    actorUserId: user.id,
    ipAddress: meta.ipAddress ?? null,
  });

  return { ...tokens, user: toAuthenticatedUser(user) };
}

/**
 * Rotating refresh. The presented token is revoked and replaced on every use;
 * presenting an already-revoked token is treated as theft and ends every
 * session the user has.
 */
/**
 * How long a just-rotated refresh token keeps working.
 *
 * Long enough to cover a page load's worth of parallel requests and a flaky
 * mobile retry; far too short to be worth anything to someone replaying a
 * stolen token.
 */
const ROTATION_GRACE_MS = 60_000;

export async function refresh(rawToken: string, meta: RequestMeta): Promise<LoginResponse> {
  const payload = verifyRefreshToken(rawToken);

  const stored = await prismaUnscoped.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(rawToken) },
    include: { user: userWithSchool },
  });

  if (!stored || stored.userId !== payload.sub) {
    throw ApiError.invalidRefreshToken();
  }

  if (stored.revokedAt) {
    // A token presented moments after it was rotated is a race, not a theft.
    //
    // The web middleware refreshes per request, so a page load that fans out
    // into several requests sends the same cookie several times: the first
    // rotates it and the rest arrive holding a token that is now revoked. The
    // punishment for reuse is revoking every session the user has, so one such
    // race signed people out of the browser AND the phone at once. Production
    // had twenty-three of these against eleven honest rotations — the check
    // was firing more often on real use than it ever would on an attacker.
    //
    // Inside the window we issue a fresh pair and leave other sessions alone.
    // A stolen token replayed later still trips the alarm, which is the case
    // rotation detection exists for.
    const rotatedRecently =
      stored.revokedBy === 'ROTATED' &&
      Date.now() - stored.revokedAt.getTime() <= ROTATION_GRACE_MS;

    if (!rotatedRecently) {
      await prismaUnscoped.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: 'REUSE_DETECTED' },
      });
      throw ApiError.invalidRefreshToken(
        'This session token was already used. All sessions have been ended for your safety.',
      );
    }
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw ApiError.invalidRefreshToken('Your session has expired. Please sign in again.');
  }

  const user = stored.user;

  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('Your account is not active. Please contact your administrator.');
  }

  // The branch this session was working in, if it is a group administrator's.
  const branch = stored.activeSchoolId
    ? await prismaUnscoped.school.findUnique({
        where: { id: stored.activeSchoolId },
        select: branchSelect,
      })
    : null;

  // Re-checked here so a suspended school cannot extend a live session — and
  // for the branch, not the user's own row, when the two differ.
  const schoolToCheck = branch?.id ?? user.schoolId;
  if (schoolToCheck) {
    await assertSchoolUsable(schoolToCheck);
  }

  const tokens = await issueTokens(user, meta, branch?.id ?? null);

  await prismaUnscoped.refreshToken.update({
    where: { id: stored.id },
    data: {
      revokedAt: new Date(),
      revokedBy: 'ROTATED',
      replacedById: hashRefreshToken(tokens.refreshToken).slice(0, 40),
    },
  });

  return { ...tokens, user: toAuthenticatedUser(user, branch) };
}

/**
 * A group administrator choosing which branch to work in.
 *
 * What comes back is an ordinary session bound to one school — the same shape a
 * School Admin's is — because every tenant-scoped query in the API reads one
 * `schoolId` off the token and nothing else. Switching is signing in again at
 * the chosen branch, not holding two schools at once.
 *
 * The session that was open stays valid until it expires or is rotated, exactly
 * as it would if the same person signed in on a second device.
 */
export async function switchBranch(
  userId: string,
  schoolId: string,
  meta: RequestMeta,
): Promise<LoginResponse> {
  const user = await prismaUnscoped.user.findUnique({ where: { id: userId }, ...userWithSchool });
  if (!user) throw ApiError.unauthenticated('Your account no longer exists');

  if (user.role !== 'ORG_ADMIN' || !user.organisationId) {
    throw ApiError.forbidden('Only a group administrator can change branch');
  }

  // Scoped to their own group in the query itself: a branch belonging to
  // somebody else is not found rather than refused, like every other
  // cross-tenant read here.
  const branch = await prismaUnscoped.school.findFirst({
    where: { id: schoolId, organisationId: user.organisationId },
    select: branchSelect,
  });
  if (!branch) throw ApiError.notFound('Branch not found');

  await assertSchoolUsable(branch.id);

  const tokens = await issueTokens(user, meta, branch.id);

  writeAuditLogSafe({
    action: 'BRANCH_SWITCHED',
    entity: 'School',
    entityId: branch.id,
    schoolId: branch.id,
    actorUserId: user.id,
    metadata: { organisationId: user.organisationId, branchCode: branch.code },
    ipAddress: meta.ipAddress ?? null,
  });

  return { ...tokens, user: toAuthenticatedUser(user, branch) };
}

/**
 * A fresh pair for a user who is already known to be who they say they are.
 *
 * Used after a password change, which revokes every session including the one
 * doing the changing — this is what hands that session its life back.
 */
export async function issueTokensFor(userId: string, meta: RequestMeta): Promise<AuthTokens> {
  const user = await prismaUnscoped.user.findUnique({ where: { id: userId }, ...userWithSchool });
  if (!user) throw ApiError.unauthenticated('Your account no longer exists');
  return issueTokens(user, meta);
}

export async function logout(rawToken: string | undefined, userId: string): Promise<void> {
  if (rawToken) {
    await prismaUnscoped.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(rawToken), userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: 'LOGOUT' },
    });
    return;
  }

  await prismaUnscoped.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedBy: 'LOGOUT_ALL' },
  });
}

export async function getAuthenticatedUser(
  userId: string,
  activeSchoolId?: string | null,
): Promise<AuthenticatedUser> {
  const user = await prismaUnscoped.user.findUnique({ where: { id: userId }, ...userWithSchool });
  if (!user) throw ApiError.unauthenticated('Your account no longer exists');

  // A group administrator's own row holds no school, so the branch has to come
  // from the token that asked.
  const branch =
    activeSchoolId && activeSchoolId !== user.schoolId
      ? await prismaUnscoped.school.findUnique({
          where: { id: activeSchoolId },
          select: branchSelect,
        })
      : null;

  return toAuthenticatedUser(user, branch);
}

/** The branches a group administrator may work in. */
export async function branchesFor(
  userId: string,
  currentSchoolId: string | null,
): Promise<BranchSummary[]> {
  const user = await prismaUnscoped.user.findUnique({
    where: { id: userId },
    select: { organisationId: true },
  });

  if (!user?.organisationId) return [];
  return listBranches(user.organisationId, currentSchoolId);
}

/**
 * Bulk session kill used when a school is suspended — this is what makes the
 * block bite immediately instead of at the end of each refresh window.
 */
export async function revokeAllSessionsForSchool(
  schoolId: string,
  tx: Prisma.TransactionClient,
): Promise<number> {
  const result = await tx.refreshToken.updateMany({
    where: { revokedAt: null, user: { schoolId } },
    data: { revokedAt: new Date(), revokedBy: 'SCHOOL_SUSPENDED' },
  });
  return result.count;
}
