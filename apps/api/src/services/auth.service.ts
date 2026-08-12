import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser, LoginInput, LoginResponse, Role } from '@poetree/shared';
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

const userWithSchool = {
  include: {
    school: {
      select: { id: true, name: true, code: true, logoUrl: true, primaryColor: true, status: true },
    },
  },
} satisfies Prisma.UserDefaultArgs;

type UserWithSchool = Prisma.UserGetPayload<typeof userWithSchool>;

export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function toAuthenticatedUser(user: UserWithSchool): AuthenticatedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role as Role,
    schoolId: user.schoolId,
    school: user.school
      ? {
          id: user.school.id,
          name: user.school.name,
          code: user.school.code,
          logoUrl: user.school.logoUrl,
          primaryColor: user.school.primaryColor,
          status: user.school.status,
        }
      : null,
  };
}

async function issueTokens(user: UserWithSchool, meta: RequestMeta) {
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
    },
  });

  return {
    accessToken: signAccessToken({
      userId: user.id,
      role: user.role as Role,
      schoolId: user.schoolId,
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
    where.school = { code: input.schoolCode };
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
      { schoolCodes: matches.map((m) => m.school?.code).filter(Boolean) },
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

  // Re-checked here so a suspended school cannot extend a live session.
  if (user.schoolId) {
    await assertSchoolUsable(user.schoolId);
  }

  const tokens = await issueTokens(user, meta);

  await prismaUnscoped.refreshToken.update({
    where: { id: stored.id },
    data: {
      revokedAt: new Date(),
      revokedBy: 'ROTATED',
      replacedById: hashRefreshToken(tokens.refreshToken).slice(0, 40),
    },
  });

  return { ...tokens, user: toAuthenticatedUser(user) };
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

export async function getAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
  const user = await prismaUnscoped.user.findUnique({ where: { id: userId }, ...userWithSchool });
  if (!user) throw ApiError.unauthenticated('Your account no longer exists');
  return toAuthenticatedUser(user);
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
