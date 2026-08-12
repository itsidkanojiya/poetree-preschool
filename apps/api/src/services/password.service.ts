import crypto from 'node:crypto';
import type { ChangePasswordInput, PasswordResetResponse, Role } from '@poetree/shared';
import { prismaUnscoped } from '../db/prisma.js';
import { ApiError } from '../lib/apiError.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { getRequestContext } from '../context/requestContext.js';
import { writeAuditLog } from './audit.service.js';
import * as authService from './auth.service.js';
import type { AuthTokens, RequestMeta } from './auth.service.js';

/**
 * Words a receptionist can read down a phone line without spelling them.
 *
 * No 'l'/'1'/'0'/'O' anywhere, nothing that sounds like something else, and
 * nothing embarrassing to say to a parent. Two words and four digits is about
 * 2^28 of guessing space against a limiter that allows ten tries a quarter of
 * an hour — and the password only lives until its first use anyway.
 */
const WORDS = [
  'apple', 'basket', 'candle', 'daisy', 'eagle', 'feather', 'garden', 'hazel',
  'igloo', 'jasmine', 'kettle', 'ladder', 'mango', 'nutmeg', 'orange', 'pebble',
  'quilt', 'ribbon', 'saffron', 'tulip', 'umbrella', 'violet', 'walnut', 'yellow',
];

/**
 * A temporary password.
 *
 * crypto.randomInt, not Math.random: this is a credential, and the predictable
 * one is the whole account.
 */
export function generateTemporaryPassword(): string {
  const first = WORDS[crypto.randomInt(WORDS.length)]!;
  let second = WORDS[crypto.randomInt(WORDS.length)]!;
  while (second === first) second = WORDS[crypto.randomInt(WORDS.length)]!;

  const digits = crypto.randomInt(1000, 10_000);
  const capitalised = first[0]!.toUpperCase() + first.slice(1);

  // Satisfies passwordSchema on its own — letter, digit, over eight characters
  // — so the user could keep it. mustChangePassword is what stops them.
  return `${capitalised}-${second}-${digits}`;
}

/** Who may reset whom. */
const MAY_RESET: Record<string, readonly Role[]> = {
  SCHOOL_ADMIN: ['TEACHER', 'PARENT'],
  // The publication's own staff look after the school offices, and nobody else
  // can — a school admin who forgets their password has no colleague above them.
  PUBLICATION_ADMIN: ['SCHOOL_ADMIN', 'TEACHER', 'PARENT'],
};

/**
 * Issues a new password on somebody's behalf and ends every session they have.
 *
 * There is no email or SMS here on purpose. A sixty-family preschool has no
 * mail server, half the parents were enrolled with a phone number and no email
 * address at all, and an SMS gateway in India means DLT registration and a
 * per-message bill for something the office can do in the thirty seconds a
 * parent is already standing at the desk. So: the admin resets it, reads the
 * temporary password out, and the API refuses to do anything else with that
 * account until it has been changed.
 */
export async function resetPassword(
  targetUserId: string,
  actorUserId: string,
): Promise<PasswordResetResponse> {
  const context = getRequestContext();
  if (!context) throw ApiError.unauthenticated();

  const target = await prismaUnscoped.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, role: true, schoolId: true, status: true, deletedAt: true },
  });

  // 404 rather than 403 for someone else's user: a different answer here would
  // confirm that an account exists at another school.
  const foreign = context.role !== 'PUBLICATION_ADMIN' && target?.schoolId !== context.schoolId;
  if (!target || target.deletedAt || foreign) {
    throw ApiError.notFound('User not found');
  }

  const allowed = MAY_RESET[context.role] ?? [];
  if (!allowed.includes(target.role as Role)) {
    throw ApiError.forbidden(`You cannot reset the password of a ${target.role.toLowerCase()}`);
  }

  if (target.id === actorUserId) {
    // Not a safety rule so much as a kindness: this would hand you a password
    // you then have to type back in, when the account page changes it directly.
    throw ApiError.badRequest('Change your own password from your account page');
  }

  const temporaryPassword = generateTemporaryPassword();

  await prismaUnscoped.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
      },
    });

    // Whoever was signed in as them is signed out. A reset is what an office
    // does when a phone has been lost or a password shared, and leaving the old
    // sessions alive would make it decorative.
    await tx.refreshToken.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: 'PASSWORD_RESET' },
    });
  });

  await writeAuditLog({
    action: 'PASSWORD_RESET',
    entity: 'User',
    entityId: target.id,
    schoolId: target.schoolId,
    actorUserId,
    after: { role: target.role },
  });

  return { userId: target.id, name: target.name, temporaryPassword };
}

/**
 * Changing your own password, which is also how a temporary one is cleared.
 *
 * Returns a fresh token pair. Without that, ending the other sessions would
 * end this one too, and the user would be thrown back to the sign-in screen
 * the moment they did the right thing.
 */
export async function changeOwnPassword(
  userId: string,
  input: ChangePasswordInput,
  meta: RequestMeta,
): Promise<AuthTokens> {
  const user = await prismaUnscoped.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, schoolId: true },
  });
  if (!user) throw ApiError.unauthenticated();

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw ApiError.invalidCredentials('Your current password is incorrect');
  }

  await prismaUnscoped.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(input.newPassword),
      mustChangePassword: false,
    },
  });

  // Every other session ends: if the password was changed because it had been
  // seen by somebody else, that somebody is now out.
  await prismaUnscoped.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedBy: 'PASSWORD_CHANGED' },
  });

  await writeAuditLog({
    action: 'PASSWORD_CHANGED',
    entity: 'User',
    entityId: userId,
    schoolId: user.schoolId,
    actorUserId: userId,
  });

  return authService.issueTokensFor(userId, meta);
}
